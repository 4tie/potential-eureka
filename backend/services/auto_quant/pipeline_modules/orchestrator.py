"""Orchestrator for the Auto-Quant pipeline - main run_pipeline function and pre-stage data download."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from ..sensitivity import run_sensitivity_check
from ..ollama_service import ask_ollama_for_sensitivity_fix, detect_strategy_type
from ..policy import load_policy
from ..variants import ensure_working_copy
from .config import DEFAULT_STRESS_PAIRS
from .discovery import apply_discovery_results, run_discovery
from .helpers import _emit, _run_subprocess
from .logging import _rlog, logger
from .stages_assessment import _stage_delivery, _stage_joint_portfolio_backtest
from .stages_optimization import _stage_hyperopt, _stage_patch
from .stages_regime import _stage_regime_detection
from .stages_validation import _stage_portfolio_baseline, _stage_robustness_feature_injection, _stage_pre_flight_filtering, _stage_pre_selection, _stage_sanity_backtest, _stage_stress_test
from .helpers import _fail_stage, _pass_stage
from .state import (
    PipelineState,
    _Cancelled,
    _cancelled,
    _save_state_to_disk,
    get_queues,
    get_states,
    _now,
)


def _merge_timeranges(r1: str, r2: str) -> str:
    """Return the smallest YYYYMMDD-YYYYMMDD bounding range covering r1 and r2.

    Silently falls back to r1 if either range cannot be parsed.
    """
    try:
        s1, e1 = r1.split("-", 1)
        s2, e2 = r2.split("-", 1)
        start = min(s for s in (s1, s2) if s) if any((s1, s2)) else ""
        end   = max(e for e in (e1, e2) if e) if any((e1, e2)) else ""
        if start and end:
            return f"{start}-{end}"
    except Exception as exc:
        logger.warning("Orchestrator | failed to merge date ranges %s and %s: %s", r1, r2, exc)
    return r1


async def run_pipeline(run_id: str) -> None:
    """Main async pipeline entry point. Runs all 6 stages sequentially with pause/resume support."""
    state = get_states().get(run_id)
    if state is None:
        logger.error("run_pipeline called with unknown run_id=%s — aborting.", run_id)
        return

    # If resuming from user approval, continue from where we left off
    if state.status == "awaiting_user_approval":
        logger.info("run_pipeline: resuming from user approval checkpoint at stage %d", state.current_stage)
        state.status = "running"
        
        # Transfer user_approved_pairs to selected_pairs if they exist
        if state.user_approved_pairs and not state.selected_pairs:
            state.selected_pairs = [{"key": pair} for pair in state.user_approved_pairs]
            logger.info("run_pipeline: transferred %d user_approved_pairs to selected_pairs", len(state.user_approved_pairs))
        
        _save_state_to_disk(state)
    else:
        state.status = "running"
    
    out_dir = Path(state.user_data_dir) / "auto_quant" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    policy = load_policy()
    ensure_working_copy(state, out_dir)
    state.selected_timeframe = state.selected_timeframe or state.timeframe
    state.selected_pair_universe = state.selected_pair_universe or state.pair_universe
    state.policy_versions = state.policy_versions or policy.versions
    
    # Run discovery phase if enabled and no results exist
    if state.auto_discovery_enabled and not state.discovery_results:
        _rlog(run_id, 0, logging.INFO, "── Running Discovery Phase ──")
        _emit(run_id, 0, "running", "Running discovery to select optimal timeframe and pair universe...", 2)
        
        discovery_result = await run_discovery(run_id, state, out_dir)
        apply_discovery_results(state, discovery_result)
        
        _rlog(run_id, 0, logging.INFO,
              f"Discovery Complete | Selected timeframe: {state.selected_timeframe}, "
              f"Pairs: {len(state.selected_pair_universe)}, Notes: {len(state.validation_notes)}")
    
    _save_state_to_disk(state)

    _rlog(run_id, 0, logging.INFO,
          f"══ AUTO-QUANT FACTORY STARTED ══  run={run_id}  strategy={state.strategy}"
          f"  timeframe={state.timeframe}  IS={state.in_sample_range}"
          f"  OOS={state.out_sample_range}  exchange={state.exchange}")
    _rlog(run_id, 0, logging.DEBUG,
          f"Config file : {state.config_file}")
    _rlog(run_id, 0, logging.DEBUG,
          f"Freqtrade   : {state.freqtrade_path}")
    _rlog(run_id, 0, logging.DEBUG,
          f"Output dir  : {out_dir}")
    _emit(run_id, 0, "running", "Pipeline started.", 0)

    try:
        # ── Stage 1: Pre-Flight Filtering (Data Healing + Baseline Backtest) ──
        # Skip if already completed (current_stage > 1)
        if state.current_stage < 1:
            _rlog(run_id, 1, logging.INFO, "── ENTERING Stage 1: Pre-Flight Filtering ──")
            s1_result = await _stage_pre_flight_filtering(run_id, state, out_dir)
            if s1_result is None:
                _rlog(run_id, 1, logging.ERROR, "Stage 1 FAILED — pipeline halted.")
                return  # pipeline already marked failed
            
            # Check if Stage 1 paused for user approval
            if state.status == "awaiting_user_approval":
                _rlog(run_id, 1, logging.INFO, "Stage 1 PAUSED awaiting user approval")
                _save_state_to_disk(state)
                return
        else:
            # Resume: load Stage 1 result from state and set selected_pairs from user approval
            s1_result = state.stages[0].data if state.stages else {}
            _rlog(run_id, 1, logging.INFO, "── RESUMING: Stage 1 already completed")
            
            # Set selected_pairs from user_approved_pairs (set by resume endpoint)
            if state.user_approved_pairs:
                state.selected_pairs = [{"key": pair} for pair in state.user_approved_pairs]
                _rlog(run_id, 1, logging.INFO,
                      f"Stage 1 | User approved {len(state.user_approved_pairs)} pairs")
            else:
                # Fallback to passing_pairs from Stage 1 result
                passing_pairs = s1_result.get("passing_pairs", [])
                if passing_pairs:
                    state.selected_pairs = [{"key": pair} for pair in passing_pairs]
                    _rlog(run_id, 1, logging.INFO,
                          f"Stage 1 | Using {len(passing_pairs)} pairs from Stage 1 result")
                else:
                    # Final fallback: use discovery selected pairs or pair_universe
                    fallback_pairs = state.selected_pair_universe or state.pair_universe or []
                    if fallback_pairs:
                        state.selected_pairs = [{"key": pair} for pair in fallback_pairs]
                        _rlog(run_id, 1, logging.WARNING,
                              f"Stage 1 | No passing pairs found, using {len(fallback_pairs)} discovery/universe pairs as fallback")
                    else:
                        _rlog(run_id, 1, logging.ERROR,
                              "Stage 1 | No pairs available for continuation - pipeline cannot proceed")
                        _fail_stage(run_id, state, 1, "No pairs available - all pairs failed filtering or no pairs provided")
                        return
            
            # Mark Stage 1 as passed now that we have user approval
            state.stages[0].status = "passed"
            _pass_stage(run_id, state, 1,
                        f"Pre-flight filtering complete — {len(state.selected_pairs)} pairs approved.",
                        s1_result)

        # ── Stage 1.5: Regime Detection ─────────────────────────────────────
        # Run regime detection if enabled
        if state.regime_detection_enabled:
            _rlog(run_id, 1, logging.INFO, "── ENTERING Stage 1.5: Regime Detection ──")
            regime_result = await _stage_regime_detection(run_id, state, out_dir)
            if regime_result:
                _rlog(run_id, 1, logging.INFO,
                      f"Regime Detection Complete | Regime={state.current_regime}")
            else:
                _rlog(run_id, 1, logging.WARNING, "Regime detection failed, using defaults")

        # ── Stage 2: Portfolio Baseline Backtest ───────────────────────────
        # Check if Stage 2 needs to run based on both current_stage and individual stage status
        # Stage 2 corresponds to index 1 in the stages array (0-indexed: stages[1] = Stage 2)
        stage2_needs_run = (state.current_stage < 2) or (len(state.stages) > 1 and state.stages[1].status != "passed")
        
        if stage2_needs_run:
            _rlog(run_id, 2, logging.INFO, "── ENTERING Stage 2: Portfolio Baseline Backtest ──")
            s2_result = await _stage_portfolio_baseline(run_id, state, out_dir)
            if s2_result is None:
                _rlog(run_id, 2, logging.ERROR, "Stage 2 FAILED — pipeline halted.")
                return  # pipeline already marked failed
            
            # Check if Stage 2 paused for user approval
            if state.status == "awaiting_user_approval":
                _rlog(run_id, 2, logging.INFO, "Stage 2 PAUSED awaiting user approval")
                _save_state_to_disk(state)
                return
        elif state.current_stage == 2:
            # Resume: load Stage 2 result from state
            s2_result = state.stages[1].data if len(state.stages) > 1 else {}
            _rlog(run_id, 2, logging.INFO, "── RESUMING: Stage 2 already completed")
            
            # Ensure selected_pairs is populated
            if not state.selected_pairs:
                fallback_pairs = state.selected_pair_universe or state.pair_universe or []
                if fallback_pairs:
                    state.selected_pairs = [{"key": pair} for pair in fallback_pairs]
                    _rlog(run_id, 2, logging.WARNING,
                          f"Stage 2 | Auto-populated {len(fallback_pairs)} pairs from discovery/universe")
                else:
                    _rlog(run_id, 2, logging.ERROR,
                          "Stage 2 | No pairs available - pipeline cannot proceed")
                    _fail_stage(run_id, state, 2, "No pairs available for continuation")
                    return
            
            # Mark Stage 2 as passed now that we have user approval
            state.stages[1].status = "passed"
            _pass_stage(run_id, state, 2,
                        f"Portfolio baseline complete — {len(state.selected_pairs)} pairs confirmed.",
                        s2_result)
            
            # Advance to next stage
            state.current_stage = 3
            _save_state_to_disk(state)
        else:
            # Stage 2 already completed and current_stage > 2, skip to next stage
            _rlog(run_id, 2, logging.INFO, "── SKIPPING: Stage 2 already completed (current_stage=%d)", state.current_stage)
            s2_result = state.stages[1].data if len(state.stages) > 1 else {}

        # ── Stages 3-4: Self-healing retry loop (renumbered from 2-3) ───────
        oos_result: dict | None = None
        optimized_path: Path | None = None
        best_params: dict | None = None
        _relaxed_gate_attempted: bool = False

        while True:
            # ── Stage 3: WFA Hyperopt (renumbered from Stage 2) ───────────────
            # Check if Stage 3 needs to run based on both current_stage and individual stage status
            # Stage 3 corresponds to index 2 in the stages array (0-indexed: stages[2] = Stage 3)
            stage3_needs_run = (state.current_stage < 3) or (len(state.stages) > 2 and state.stages[2].status != "passed")
            
            if not stage3_needs_run:
                _rlog(run_id, 3, logging.INFO, "── RESUMING: Stage 3 already completed")
                # Load optimized_path from state if available (needed for subsequent stages)
                if not optimized_path and state.stages and len(state.stages) >= 3:
                    stage3_data = state.stages[2].data if state.stages[2].data else {}
                    if "optimized_file" in stage3_data:
                        optimized_path = Path(stage3_data["optimized_file"])
                        _rlog(run_id, 3, logging.INFO, f"Loaded optimized_path from state: {optimized_path}")
                break  # Exit the retry loop and continue to Stage 4
            
            _rlog(run_id, 3, logging.INFO, "── ENTERING Stage 3: WFA Hyperopt ──")
            # Pass selected_pairs from Stage 1 pre-flight filtering
            selected_pairs_list = [p["key"] for p in state.selected_pairs] if state.selected_pairs else None
            best_params = await _stage_hyperopt(run_id, state, out_dir, selected_pairs_list)
            if best_params is None:
                _rlog(run_id, 3, logging.ERROR, "Stage 3 FAILED — pipeline halted.")
                return

            # ── Sub-step: Sensitivity / Robustness Check ──────────────────
            _rlog(run_id, 3, logging.INFO,
                  "── Sub-step: Sensitivity / Robustness Check ──")
            _emit(run_id, 3, "running",
                  "Running robustness check (±5% parameter perturbation)…", -1)
            sensitivity_result = await run_sensitivity_check(
                best_params, out_dir, run_id, state
            )
            state.sensitivity = sensitivity_result
            _save_state_to_disk(state)

            _rlog(run_id, 3,
                  logging.INFO if sensitivity_result["passed"] else logging.WARNING,
                  f"Sensitivity | {sensitivity_result['label']}"
                  f"  score={sensitivity_result['score']}"
                  f"  passed={sensitivity_result['passed']}"
                  f"  param={sensitivity_result.get('param')}"
                  f"  p_best={sensitivity_result.get('p_best')}"
                  f"  p_minus={sensitivity_result.get('p_minus')}"
                  f"  p_plus={sensitivity_result.get('p_plus')}")

            _emit(run_id, 3, "running",
                  f"Robustness: {sensitivity_result['label']} (score={sensitivity_result['score']})",
                  -1,
                  {"sensitivity": sensitivity_result},
                  msg_type="sensitivity_result")

            if not sensitivity_result["passed"]:
                # ── Sharp peak: trigger self-healing retry ─────────────────
                failure_reason = sensitivity_result.get("failure_reason")
                
                if failure_reason == "FAIL_NEGATIVE_BASELINE":
                    _rlog(run_id, 3, logging.WARNING,
                          "Sensitivity check FAILED (Negative Baseline) — triggering HARD MUTATION. "
                          f"p_best={sensitivity_result.get('p_best')}")
                else:
                    _rlog(run_id, 3, logging.WARNING,
                          "Sensitivity check FAILED (Sharp Peak) — triggering self-healing retry. "
                          f"p_best={sensitivity_result.get('p_best')}  "
                          f"p_minus={sensitivity_result.get('p_minus')}  "
                          f"p_plus={sensitivity_result.get('p_plus')}")

                attempt_idx = state.retry_count
                attempt_record = {
                    "attempt": attempt_idx,
                    "label": "Initial attempt" if attempt_idx == 0 else f"Retry {attempt_idx}",
                    "loss": state.hyperopt_loss,
                    "spaces": list(state.hyperopt_spaces),
                    "epochs": state.hyperopt_epochs,
                    "profit": sensitivity_result.get("p_best"),
                    "drawdown": None,
                    "trades": None,
                    "reason": failure_reason if failure_reason else "sensitivity",
                    "passed": False,
                }
                
                # Try Ollama for intelligent suggestions if enabled
                ollama_suggestions = None
                try:
                    import json
                    settings_file = Path(state.user_data_dir) / "strategy_lab_settings.json"
                    if settings_file.exists():
                        with open(settings_file, "r", encoding="utf-8") as f:
                            settings = json.load(f)
                        ollama_enabled = settings.get("ollama_self_healing_enabled", False)
                        if ollama_enabled:
                            _rlog(run_id, 3, logging.INFO,
                                  "Ollama self-healing enabled — requesting AI suggestions")
                            ollama_suggestions = await ask_ollama_for_sensitivity_fix(
                                sensitivity_result,
                                state.retry_history,
                                state
                            )
                            if ollama_suggestions:
                                attempt_record["ollama_suggestions"] = ollama_suggestions
                                _rlog(run_id, 3, logging.INFO,
                                      f"Ollama suggestions: {ollama_suggestions.get('reasoning', 'N/A')}")
                            else:
                                _rlog(run_id, 3, logging.WARNING,
                                      "Ollama unavailable or failed — using fallback logic")
                except Exception as exc:
                    _rlog(run_id, 3, logging.WARNING,
                          f"Failed to check Ollama settings or get suggestions: {exc}")
                
                state.retry_history.append(attempt_record)

                state.retry_count += 1
                if state.retry_count > state.max_retries:
                    history = state.retry_history
                    best_a = max(history, key=lambda a: a.get("profit") or -999.0)
                    state.generalization_failure = {
                        "thresholds": {
                            "min_oos_profit": state.min_oos_profit,
                            "max_drawdown_threshold": state.max_drawdown_threshold,
                        },
                        "attempts": history,
                        "best_attempt": best_a,
                        "best_attempt_file": None,
                        "best_attempt_strategy_name": None,
                        "suggestions": [
                            "Strategy parameters sit on a very sharp optimisation peak — "
                            "nearby values produce significantly different results. "
                            "Consider extending the in-sample date range, "
                            "using a different base strategy, or switching to WFO mode."
                        ],
                    }
                    # Get the actual failure reason from the most recent sensitivity check
                    last_failure_reason = sensitivity_result.get("failure_reason", "sensitivity failure")
                    failure_label = "Negative Baseline" if last_failure_reason == "FAIL_NEGATIVE_BASELINE" else "Sharp Peak"

                    # Adjust suggestions based on failure type
                    if last_failure_reason == "FAIL_NEGATIVE_BASELINE":
                        failure_suggestions = [
                            "Strategy is unprofitable with current configuration (Negative Baseline). "
                            "Consider: 1) Different timeframe or pairs, 2) Enabling trend/volatility filters, "
                            "3) Switching to OnlyProfitHyperOptLoss, 4) Strategy redesign."
                        ]
                    else:
                        failure_suggestions = [
                            "Strategy parameters sit on a very sharp optimisation peak — "
                            "nearby values produce significantly different results. "
                            "Consider extending the in-sample date range, "
                            "using a different base strategy, or switching to WFO mode."
                        ]

                    state.generalization_failure["suggestions"] = failure_suggestions

                    msg = (
                        f"❌ Strategy failed robustness check after "
                        f"{state.max_retries} self-healing attempts ({failure_label} detected). "
                        "See retry history and suggestions below."
                    )
                    _rlog(run_id, 3, logging.ERROR, f"Sensitivity | {msg}")
                    _fail_stage(run_id, state, 3, msg, state.generalization_failure)
                    return

                # ── Hard Mutation for FAIL_NEGATIVE_BASELINE ───────────────────
                if failure_reason == "FAIL_NEGATIVE_BASELINE":
                    _rlog(run_id, 3, logging.WARNING,
                          "FAIL_NEGATIVE_BASELINE detected — applying HARD MUTATION")
                    
                    # Force dominant Boolean indicators to True via state overrides
                    if not hasattr(state, 'param_overrides'):
                        state.param_overrides = {}
                    state.param_overrides.update({
                        "use_ema_cross": True,
                        "use_atr": True,
                        "use_adx": True,
                    })
                    
                    # Widen hyperopt spaces drastically
                    state.hyperopt_spaces = ["buy", "stoploss", "roi"]
                    state.hyperopt_epochs = int(state.hyperopt_epochs * 2.0)
                    
                    _rlog(run_id, 3, logging.INFO,
                          f"Hard Mutation: forcing Boolean indicators, "
                          f"spaces={state.hyperopt_spaces}, epochs={state.hyperopt_epochs}")
                    
                    retry_msg = (
                        f"⚠️ Negative Baseline detected. Triggering HARD MUTATION Retry "
                        f"{state.retry_count}/{state.max_retries} with forced Boolean indicators…"
                    )
                else:
                    # Apply Ollama suggestions if available, otherwise use fallback logic
                    if ollama_suggestions:
                        _rlog(run_id, 3, logging.INFO,
                              "Applying Ollama-suggested parameter adjustments")
                        
                        # Apply hyperopt_loss
                        if "hyperopt_loss" in ollama_suggestions:
                            state.hyperopt_loss = ollama_suggestions["hyperopt_loss"]
                        
                        # Apply hyperopt_spaces
                        if "hyperopt_spaces" in ollama_suggestions:
                            state.hyperopt_spaces = set(ollama_suggestions["hyperopt_spaces"])
                        
                        # Apply hyperopt_epochs
                        if "hyperopt_epochs" in ollama_suggestions:
                            state.hyperopt_epochs = ollama_suggestions["hyperopt_epochs"]
                        
                        # Apply param_overrides
                        if "param_overrides" in ollama_suggestions:
                            if not hasattr(state, 'param_overrides'):
                                state.param_overrides = {}
                            state.param_overrides.update(ollama_suggestions["param_overrides"])
                        
                        retry_msg = (
                            f"⚠️ Sharp Peak detected. Applying AI-Suggested Retry "
                            f"{state.retry_count}/{state.max_retries}…"
                        )
                    else:
                        # Fallback to standard logic
                        retry_msg = (
                            f"⚠️ Sharp Peak detected. Triggering Self-Healing Retry "
                            f"{state.retry_count}/{state.max_retries} with a different optimisation axis…"
                        )
                
                _rlog(run_id, 3, logging.WARNING, retry_msg)
                _emit(run_id, 3, "running", retry_msg, -1)

                _sens_reason = attempt_record.get("reason", "sensitivity")
                if _sens_reason == "FAIL_NEGATIVE_BASELINE":
                    # Hard mutation already applied above
                    _new_loss = "OnlyProfitHyperOptLoss"
                elif _sens_reason == "drawdown":
                    _new_loss = "CalmarHyperOptLoss"
                elif _sens_reason == "both":
                    _new_loss = "ProfitDrawDownHyperOptLoss"
                else:
                    _new_loss = "OnlyProfitHyperOptLoss"
                
                # Only apply standard soft mutation if not hard mutation and no ollama suggestions
                if _sens_reason != "FAIL_NEGATIVE_BASELINE" and not ollama_suggestions:
                    state.hyperopt_loss = _new_loss
                    _rlog(run_id, 3, logging.INFO,
                          f"Self-Heal Retry {state.retry_count}: switching hyperopt_loss → {_new_loss} "
                          f"(reason={_sens_reason})")
                    
                    if state.retry_count == 2:
                        state.hyperopt_spaces = ["roi", "stoploss"]
                        _rlog(run_id, 3, logging.INFO,
                              "Self-Heal Retry 2: broadening spaces → ['roi', 'stoploss']")
                    elif state.retry_count >= 3:
                        state.hyperopt_epochs = int(state.hyperopt_epochs * 1.5)
                        _rlog(run_id, 3, logging.INFO,
                              f"Self-Heal Retry {state.retry_count}: boosting epochs → {state.hyperopt_epochs}")

                for idx in (2, 3):
                    state.stages[idx - 1].status = "pending"
                    state.stages[idx - 1].message = ""
                    state.stages[idx - 1].data = {}

                _save_state_to_disk(state)
                continue

            # ── Auto-Patching (merged into Stage 3) ───────────────────────
            _rlog(run_id, 3, logging.INFO, "── Sub-step: Auto-Patching ──")
            optimized_path = await _stage_patch(run_id, state, out_dir, best_params)
            if optimized_path is None:
                _rlog(run_id, 3, logging.ERROR, "Auto-Patching FAILED — pipeline halted.")
                return

            # Stage 3 complete — exit the retry loop and continue to Stage 4
            break

        # ── Stage 4: Robustness & Feature Injection (if not already completed) ──
        # Check if Stage 4 needs to run based on both current_stage and individual stage status
        # Stage 4 corresponds to index 3 in the stages array (0-indexed: stages[3] = Stage 4)
        stage4_needs_run = (state.current_stage < 4) or (len(state.stages) > 3 and state.stages[3].status != "passed")
        
        if stage4_needs_run:
            _rlog(run_id, 4, logging.INFO, "── ENTERING Stage 4: Robustness & Feature Injection ──")
            state.current_stage = 4
            _save_state_to_disk(state)
            
            # Ensure optimized_path is available
            # If resuming after Stage 3 was completed, retrieve it from state
            if not optimized_path and len(state.stages) > 2:
                stage3_data = state.stages[2].data
                if stage3_data and "optimized_file" in stage3_data:
                    optimized_path = Path(stage3_data["optimized_file"])
                    _rlog(run_id, 4, logging.INFO, f"Retrieved optimized_path from Stage 3: {optimized_path}")
                else:
                    _rlog(run_id, 4, logging.WARNING, "Stage 3 data missing or no optimized_file found")
                    _rlog(run_id, 4, logging.DEBUG, f"Stage 3 status: {state.stages[2].status if len(state.stages) > 2 else 'N/A'}")
                    _rlog(run_id, 4, logging.DEBUG, f"Stage 3 data keys: {list(stage3_data.keys()) if stage3_data else 'N/A'}")
            
            if not optimized_path:
                _rlog(run_id, 4, logging.ERROR, "Stage 4 cannot proceed: optimized_path is None")
                _rlog(run_id, 4, logging.ERROR, "This indicates Stage 3 (Auto-Patching) was not properly completed.")
                _rlog(run_id, 4, logging.ERROR, f"Current stage: {state.current_stage}, Stage 3 status: {state.stages[2].status if len(state.stages) > 2 else 'N/A'}")
                _fail_stage(run_id, state, 4, "optimized_path is None - cannot run robustness & feature injection")
                return
            
            stage4_result = await _stage_robustness_feature_injection(run_id, state, out_dir, optimized_path)

            if stage4_result is None:
                # Stage 4 failed (bad exit code, missing data, etc.)
                _rlog(run_id, 4, logging.ERROR, "Stage 4 FAILED — pipeline halted.")
                return
        else:
            _rlog(run_id, 4, logging.INFO, "── RESUMING: Stage 4 already completed")
            # Load Stage 4 result from state if available
            stage4_result = state.stages[3].data if len(state.stages) > 3 else {}

        # ── Stage 5: Portfolio Competition (Joint Portfolio Backtest) ──────────────────────
        _rlog(run_id, 5, logging.INFO, "── ENTERING Stage 5: Portfolio Competition ──")
        
        # Ensure optimized_path is available (may be None if resuming after Stage 3)
        if not optimized_path and len(state.stages) > 2:
            stage3_data = state.stages[2].data
            if stage3_data and "optimized_file" in stage3_data:
                optimized_path = Path(stage3_data["optimized_file"])
                _rlog(run_id, 5, logging.INFO, f"Retrieved optimized_path from Stage 3: {optimized_path}")
        
        if not optimized_path:
            _rlog(run_id, 5, logging.ERROR, "Stage 5 cannot proceed: optimized_path is None")
            _fail_stage(run_id, state, 5, "optimized_path is None - cannot run portfolio competition")
            return
        
        # Run joint portfolio backtest with capital constraints
        portfolio_result = await _stage_joint_portfolio_backtest(run_id, state, out_dir, optimized_path)
        if portfolio_result is None:
            _rlog(run_id, 5, logging.ERROR, "Stage 5 FAILED — portfolio backtest did not pass.")
            return

        # ── Stage 6: Delivery ─────────────────────────────────────────────
        _rlog(run_id, 6, logging.INFO, "── ENTERING Stage 6: Delivery ──")
        
        # Ensure optimized_path is available (may be None if resuming after Stage 3)
        if not optimized_path and len(state.stages) > 2:
            stage3_data = state.stages[2].data
            if stage3_data and "optimized_file" in stage3_data:
                optimized_path = Path(stage3_data["optimized_file"])
                _rlog(run_id, 6, logging.INFO, f"Retrieved optimized_path from Stage 3: {optimized_path}")
        
        if not optimized_path:
            _rlog(run_id, 6, logging.ERROR, "Stage 6 cannot proceed: optimized_path is None")
            _fail_stage(run_id, state, 6, "optimized_path is None - cannot run delivery")
            return
        
        await _stage_delivery(run_id, state, out_dir, optimized_path, best_params,
                              s1_result, stage4_result or {}, stage4_result or {}, portfolio_result)

        state.status = "completed"
        state.completed_at = _now()
        _save_state_to_disk(state)
        _rlog(run_id, 6, logging.INFO,
              f"══ PIPELINE COMPLETED SUCCESSFULLY ══  run={run_id}  "
              f"strategy={state.strategy}  completed_at={state.completed_at}")
        _emit(run_id, 6, "passed", "Pipeline completed successfully.", 100,
              {"report": state.report})

    except _Cancelled:
        state.status = "cancelled"
        state.completed_at = _now()
        _save_state_to_disk(state)
        _rlog(run_id, state.current_stage, logging.WARNING,
              f"Pipeline CANCELLED by user at stage {state.current_stage}.")
        _emit(run_id, state.current_stage, "failed", "Pipeline cancelled by user.", -1)
    except Exception as exc:
        state.status = "failed"
        state.error = str(exc)
        state.completed_at = _now()
        _save_state_to_disk(state)
        _rlog(run_id, state.current_stage, logging.ERROR,
              f"UNEXPECTED EXCEPTION at stage {state.current_stage}: {exc}",
              exc_info=True)
        _emit(run_id, state.current_stage, "failed", f"Unexpected error: {exc}", -1)
    finally:
        _rlog(run_id, state.current_stage if state else 0, logging.DEBUG,
              "Sending sentinel to all WebSocket subscribers.")
        # Send sentinel to close all WebSocket connections
        for q in list(get_queues().get(run_id, [])):
            try:
                q.put_nowait(None)
            except Exception as exc:
                logger.warning("Orchestrator | failed to send sentinel to queue: %s", exc)
