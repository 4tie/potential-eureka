"""Stage implementations for validation stages (1, 3)."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from ..policy import load_policy
from ..profit_lockin import compute_profit_giveback_metrics, extract_strategy_trades
from ..variants import (
    active_strategy_path,
    clone_with_class_name,
    create_variant,
    read_strategy_source,
    strategy_path_args,
)
from .config import get_timeframe_thresholds, TOP_PAIRS_SELECTION_COUNT
from .data_healer import _stage_data_healing
from .helpers import _extract_trade_distribution
from .filters import _analyze_trading_windows, _filter_winning_pairs
from .helpers import (
    _backtest_cmd,
    _classify_subprocess_error,
    _create_temp_config_with_fee_override,
    _create_temp_config_with_max_open_trades,
    _emit,
    _extract_backtest_summary,
    _extract_per_pair_results,
    _extract_trade_count,
    _fail_stage,
    _find_backtest_result,
    _pass_stage,
    _run_subprocess,
    _start_stage,
)
from .logging import _rlog
from .oos_guard import extract_pure_is_range, log_oos_contamination_warning
from .state import PipelineState, _Cancelled, _cancelled, _save_state_to_disk


async def _stage_pre_selection(
    run_id: str, state: PipelineState, out_dir: Path
) -> dict | None:
    _start_stage(run_id, state, 1)
    pairs_to_test = state.pair_universe
    _rlog(run_id, 1, logging.INFO,
          f"Stage 1 | Pre-Selection | strategy={state.strategy} | range={state.in_sample_range} | tf={state.timeframe} | pairs={len(pairs_to_test)}")
    _emit(run_id, 1, "running", f"Running pre-selection backtest across {len(pairs_to_test)} pairs...", 5)

    result_prefix = str(out_dir / "stage1_result")
    cmd = _backtest_cmd(
        state,
        strategy=state.strategy,
        timerange=state.in_sample_range,
        result_prefix=result_prefix,
        pairs=pairs_to_test,
    )
    _rlog(run_id, 1, logging.DEBUG, f"Stage 1 | Spawning subprocess: {' '.join(cmd)}")

    rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=1)
    _rlog(run_id, 1, logging.DEBUG, f"Stage 1 | Subprocess exited with rc={rc}")

    if _cancelled(run_id):
        raise _Cancelled()

    if rc != 0:
        msg = _classify_subprocess_error(rc, stdout, "Stage 1 (Pre-Selection)")
        _rlog(run_id, 1, logging.ERROR, f"Stage 1 | FAIL | {msg}")
        _fail_stage(run_id, state, 1, msg)
        return None

    result_data = _find_backtest_result(out_dir, "stage1_result", state.user_data_dir)
    per_pair = _extract_per_pair_results(result_data, state.strategy)

    # Apply dynamic pair filtering based on timeframe-specific thresholds
    winning_pairs = _filter_winning_pairs(per_pair, state.timeframe)
    failing_pairs = [p for p in per_pair if p not in winning_pairs]

    # Sort winning pairs by profitability (profit_total descending)
    winning_pairs_sorted = sorted(winning_pairs, key=lambda p: p.get("profit_total", 0), reverse=True)

    # Select top N pairs
    top_pairs = winning_pairs_sorted[:TOP_PAIRS_SELECTION_COUNT]
    state.selected_pairs = top_pairs

    _rlog(run_id, 1, logging.INFO,
          f"Stage 1 | Filtered {len(winning_pairs)}/{len(per_pair)} winning pairs, selected top {len(top_pairs)}: {[p['key'] for p in top_pairs]}")

    # Check minimum profitable pairs requirement (at least TOP_PAIRS_SELECTION_COUNT)
    if len(winning_pairs) < TOP_PAIRS_SELECTION_COUNT:
        msg = (f"Insufficient profitable pairs ({len(winning_pairs)} < {TOP_PAIRS_SELECTION_COUNT}). "
               f"Strategy may not be generalizable. Consider adjusting parameters or timeframe.")
        _rlog(run_id, 1, logging.WARNING, f"Stage 1 | {msg}")
        summary = _extract_backtest_summary(result_data, state.strategy)
        summary["per_pair"] = per_pair
        summary["winning_pairs"] = [p["key"] for p in winning_pairs]
        summary["failing_pairs"] = [p["key"] for p in failing_pairs]
        summary["selected_pairs"] = [p["key"] for p in top_pairs]
        summary["insufficient_pairs"] = True
        _fail_stage(run_id, state, 1, msg, summary)
        return None

    summary = _extract_backtest_summary(result_data, state.strategy)
    summary["per_pair"] = per_pair
    summary["winning_pairs"] = [p["key"] for p in winning_pairs]
    summary["failing_pairs"] = [p["key"] for p in failing_pairs]
    summary["selected_pairs"] = [p["key"] for p in top_pairs]

    _rlog(run_id, 1, logging.INFO,
          f"Stage 1 | PASS | selected={len(top_pairs)} winning_pairs filtered={len(failing_pairs)} total={len(per_pair)}")
    _pass_stage(run_id, state, 1,
                f"Pre-selection complete — {len(top_pairs)} top pairs selected for optimization.",
                summary)
    return summary


async def _stage_pre_flight_filtering(
    run_id: str, state: PipelineState, out_dir: Path
) -> dict | None:
    """Stage 1: Pre-Flight Filtering - Data Healing + Baseline Backtest & Pre-Filtering.
    
    This unified stage combines:
    - Sub-step 1: Data Healing (validate and auto-download historical data)
    - Sub-step 2: Baseline Backtest with strict filtering and self-healing
    
    Implements defensive filtering with profit_factor and total_trades checks,
    and self-healing logic with Hard Mutation when insufficient pairs pass.
    """
    _start_stage(run_id, state, 1)
    
    # OOS Isolation Check - ensure OOS never contaminates validation
    log_oos_contamination_warning(run_id, state, "validation")
    
    # ── Sub-step 1: Data Healing ─────────────────────────────────────────────
    _rlog(run_id, 1, logging.INFO, "── Stage 1 Sub-step 1: Data Healing ──")
    _emit(run_id, 1, "running", "Validating and downloading historical data...", 5)
    
    try:
        data_healing_result = await _stage_data_healing(run_id, state, out_dir)
    except Exception as exc:
        msg = f"Data Healing failed: {exc}"
        _rlog(run_id, 1, logging.ERROR, f"Stage 1 | FAIL | {msg}")
        _fail_stage(run_id, state, 1, msg)
        return None
    
    if _cancelled(run_id):
        raise _Cancelled()
    
    # Get surviving pairs from data healing
    surviving_pairs = state.pair_universe or []
    _rlog(run_id, 1, logging.INFO,
          f"Stage 1 | Data Healing complete: {len(surviving_pairs)} pairs survived")
    
    # ── Sub-step 2: Baseline Backtest & Pre-Filtering ───────────────────────
    _rlog(run_id, 1, logging.INFO, "── Stage 1 Sub-step 2: Baseline Backtest & Pre-Filtering ──")
    _emit(run_id, 1, "running", f"Running baseline backtest on {len(surviving_pairs)} pairs...", 10)
    
    # Self-healing loop for baseline backtest
    max_baseline_retries = 3
    baseline_attempt = 0
    policy = load_policy()
    discovery_gates = policy.thresholds_for(state.trading_style, state.risk_profile, "discovery")
    min_discovery_trades = int(discovery_gates.get("min_trades") or 15)
    min_discovery_pf = float(discovery_gates.get("min_profit_factor") or 1.0)
    min_pairs_required = min(3, max(1, len(surviving_pairs)))
    
    while baseline_attempt <= max_baseline_retries:
        baseline_attempt += 1
        state.phase1_heal_attempts = baseline_attempt - 1
        
        # Build backtest command with comma-separated pairs
        result_prefix = str(out_dir / f"stage1_baseline_attempt{baseline_attempt}")
        cmd = _backtest_cmd(
            state,
            strategy=state.strategy,
            timerange=state.in_sample_range,
            result_prefix=result_prefix,
            pairs=surviving_pairs,
        )
        _rlog(run_id, 1, logging.DEBUG, f"Stage 1 | Spawning baseline backtest subprocess: {' '.join(cmd)}")
        
        rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=1)
        _rlog(run_id, 1, logging.DEBUG, f"Stage 1 | Baseline backtest exited with rc={rc}")
        
        if _cancelled(run_id):
            raise _Cancelled()
        
        if rc != 0:
            msg = _classify_subprocess_error(rc, stdout, "Stage 1 (Baseline Backtest)")
            _rlog(run_id, 1, logging.ERROR, f"Stage 1 | FAIL | {msg}")
            _fail_stage(run_id, state, 1, msg)
            return None
        
        # Parse backtest results
        result_data = _find_backtest_result(out_dir, f"stage1_baseline_attempt{baseline_attempt}", state.user_data_dir)
        per_pair = _extract_per_pair_results(result_data, state.strategy)
        _rlog(run_id, 1, logging.DEBUG,
              f"Stage 1 | parsed {len(per_pair)} per-pair results: "
              f"{[(p.get('key'), p.get('profit_factor')) for p in per_pair]}")
        
        # ── Defensive Filtering & Division-by-Zero Guard ───────────────────
        passing_pairs = []
        filtered_pairs = []
        
        for pair_data in per_pair:
            pair_key = pair_data.get("key", "")
            profit_factor = pair_data.get("profit_factor", 0.0)
            total_trades = pair_data.get("trades", 0)
            
            # Discovery gates are sourced from policy and are intentionally permissive.
            if total_trades < min_discovery_trades:
                _rlog(run_id, 1, logging.DEBUG,
                      f"Stage 1 | {pair_key}: evicted (insufficient trades: {total_trades} < {min_discovery_trades})")
                filtered_pairs.append({
                    "key": pair_key,
                    "reason": "insufficient_trades",
                    "total_trades": total_trades,
                    "profit_factor": profit_factor,
                })
                continue
            
            # Division-by-zero guard: handle cases where total losses are 0
            # profit_factor is already calculated by freqtrade, but we validate it
            if profit_factor < min_discovery_pf:
                _rlog(run_id, 1, logging.DEBUG,
                      f"Stage 1 | {pair_key}: evicted (profit_factor {profit_factor:.2f} < {min_discovery_pf})")
                filtered_pairs.append({
                    "key": pair_key,
                    "reason": "low_profit_factor",
                    "total_trades": total_trades,
                    "profit_factor": profit_factor,
                })
                continue
            
            # Pair passed all filters
            passing_pairs.append(pair_data)
            _rlog(run_id, 1, logging.DEBUG,
                  f"Stage 1 | {pair_key}: passed (trades={total_trades}, profit_factor={profit_factor:.2f})")
        
        _rlog(run_id, 1, logging.INFO,
              f"Stage 1 | Baseline filtering: {len(passing_pairs)}/{len(per_pair)} pairs passed")
        
        # ── Fail-Safe Gateway & Self-Healing Restart ───────────────────────
        if len(passing_pairs) >= min_pairs_required or state.auto_discovery_enabled:
            if len(passing_pairs) < min_pairs_required:
                fallback_pairs = sorted(
                    per_pair,
                    key=lambda p: (
                        p.get("profit_factor", 0.0),
                        p.get("profit_total", 0.0),
                        p.get("trades", 0),
                    ),
                    reverse=True,
                )[:min_pairs_required]
                passing_pairs = passing_pairs or fallback_pairs
                note = (
                    f"Discovery found {len(passing_pairs)} candidate pair(s), below the "
                    f"{min_pairs_required} pair target; validation will continue with notes."
                )
                state.validation_notes.append(note)
                _rlog(run_id, 1, logging.WARNING, f"Stage 1 | {note}")
            # Success: emit pair selection request and pause for user approval
            _rlog(run_id, 1, logging.INFO,
                  f"Stage 1 | Baseline complete: {len(per_pair)} pairs tested, {len(passing_pairs)} passed thresholds")
            
            summary = _extract_backtest_summary(result_data, state.strategy)
            summary["per_pair"] = per_pair
            summary["passing_pairs"] = [p["key"] for p in passing_pairs]
            summary["filtered_pairs"] = filtered_pairs
            summary["baseline_attempts"] = baseline_attempt
            summary["discovery_gates"] = discovery_gates
            summary["validation_notes"] = state.validation_notes
            
            # Pre-select pairs that pass thresholds for user convenience
            pre_selected = [p["key"] for p in passing_pairs]
            
            # Emit WebSocket event with all pair results for user selection
            _emit(run_id, 1, "running",
                  f"Baseline complete: {len(per_pair)} pairs tested. Please select pairs to continue.",
                  15,
                  {
                      "type": "pair_selection_request",
                      "all_pairs": per_pair,
                      "pre_selected": pre_selected,
                      "min_trades": min_discovery_trades,
                      "min_profit_factor": min_discovery_pf,
                      "total_tested": len(per_pair),
                      "total_passed": len(passing_pairs),
                  },
                  msg_type="pair_selection_request")
            
            # Set status to awaiting user approval and save state
            state.status = "awaiting_user_approval"
            state.current_stage = 1
            state.stages[0].data = summary
            state.stages[0].status = "running"  # Keep as running, not passed
            _save_state_to_disk(state)
            
            _rlog(run_id, 1, logging.INFO,
                  f"Stage 1 | PAUSED: Awaiting user approval for pair selection")
            return summary
        
        # Insufficient pairs - trigger self-healing
        if baseline_attempt < max_baseline_retries:
            _rlog(run_id, 1, logging.WARNING,
                  f"Stage 1 | Only {len(passing_pairs)} pairs passed (< {min_pairs_required}). "
                  f"Triggering self-healing attempt {baseline_attempt}/{max_baseline_retries}")

            # Apply Hard Mutation: force core boolean switches to True
            try:
                source = read_strategy_source(state)
                mutation_name = f"{state.original_strategy or state.strategy}_BaselineMutation{baseline_attempt}"
                source = clone_with_class_name(source, mutation_name)
                
                # Force boolean indicators to True
                mutations = {
                    "use_ema_cross": False,
                    "use_atr": False,
                    "use_adx": False,
                    "use_rsi": False,
                    "use_macd": False,
                    "use_bollinger": False,
                }
                
                # Check which indicators exist and force them to True
                for indicator in mutations:
                    if f"{indicator} = " in source:
                        source = re.sub(
                            rf"{indicator}\s*=\s*(True|False)",
                            f"{indicator} = True",
                            source
                        )
                        mutations[indicator] = True
                
                mutation_path = create_variant(
                    state,
                    role="mutation",
                    strategy_name=mutation_name,
                    source=source,
                )
                state.strategy = mutation_name
                _rlog(run_id, 1, logging.INFO,
                      f"Stage 1 | Hard Mutation variant applied: {mutation_path.name}")
                
                # Emit WebSocket event
                _emit(run_id, 1, "running",
                      f"Self-healing attempt {baseline_attempt}/{max_baseline_retries}: "
                      f"Applying Hard Mutation to strategy...",
                      -1,
                      {
                          "type": "phase1_self_heal",
                          "attempt": baseline_attempt,
                          "surviving_count": len(passing_pairs),
                          "mutation_applied": "Hard Mutation Framework",
                          "mutations_applied": [k for k, v in mutations.items() if v],
                          "variant_path": str(mutation_path),
                      },
                      msg_type="phase1_self_heal")
                
                # Restart from Sub-step 1 (Data Healing) with mutated strategy
                _rlog(run_id, 1, logging.INFO,
                      f"Stage 1 | Restarting from Data Healing with mutated strategy...")
                continue
                
            except Exception as exc:
                _rlog(run_id, 1, logging.ERROR,
                      f"Stage 1 | Failed to apply Hard Mutation: {exc}")
                # Fall through to failure
                break
        else:
            # Max retries exceeded - fail the pipeline
            _rlog(run_id, 1, logging.ERROR,
                  f"Stage 1 | FAIL: Strategy failed to find 3 viable trading pairs after "
                  f"{max_baseline_retries} self-healing attempts")
            
            summary = _extract_backtest_summary(result_data, state.strategy)
            summary["per_pair"] = per_pair
            summary["passing_pairs"] = [p["key"] for p in passing_pairs]
            summary["filtered_pairs"] = filtered_pairs
            summary["baseline_attempts"] = baseline_attempt
            summary["healing_exhausted"] = True
            
            msg = (f"Strategy failed to find 3 viable trading pairs after "
                   f"{max_baseline_retries} self-healing attempts. "
                   f"Only {len(passing_pairs)} pairs passed baseline filtering.")
            _fail_stage(run_id, state, 1, msg, summary)
            return None
    
    # Should not reach here, but handle gracefully
    msg = "Stage 1: Unexpected exit from baseline backtest loop"
    _rlog(run_id, 1, logging.ERROR, msg)
    _fail_stage(run_id, state, 1, msg)
    return None


# Legacy function for backward compatibility
async def _stage_sanity_backtest(
    run_id: str, state: PipelineState, out_dir: Path
) -> dict | None:
    _start_stage(run_id, state, 1)
    _rlog(run_id, 1, logging.INFO,
          f"Stage 1 | Sanity Backtest (Legacy) | strategy={state.strategy} | range={state.in_sample_range} | tf={state.timeframe}")
    _emit(run_id, 1, "running", f"Running sanity backtest for {state.strategy} on {state.in_sample_range}...", 5)

    result_prefix = str(out_dir / "stage1_result")
    cmd = _backtest_cmd(
        state,
        strategy=state.strategy,
        timerange=state.in_sample_range,
        result_prefix=result_prefix,
        pairs=[state.pair] if state.pair else None,
    )
    _rlog(run_id, 1, logging.DEBUG, f"Stage 1 | Spawning subprocess: {' '.join(cmd)}")

    rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=1)
    _rlog(run_id, 1, logging.DEBUG, f"Stage 1 | Subprocess exited with rc={rc}")

    if _cancelled(run_id):
        raise _Cancelled()

    if rc != 0:
        msg = _classify_subprocess_error(rc, stdout, "Stage 1 (Sanity Backtest)")
        _rlog(run_id, 1, logging.ERROR, f"Stage 1 | FAIL | {msg}")
        _fail_stage(run_id, state, 1, msg)
        return None

    # Look for a result file
    result_data = _find_backtest_result(out_dir, "stage1_result", state.user_data_dir)
    trade_count = _extract_trade_count(result_data, state.strategy)
    _rlog(run_id, 1, logging.DEBUG, f"Stage 1 | Parsed result file: trade_count={trade_count}")

    if trade_count == 0:
        msg = "Sanity backtest produced 0 trades. Strategy has no signals in this timerange."
        _rlog(run_id, 1, logging.ERROR, f"Stage 1 | FAIL | {msg}")
        _fail_stage(run_id, state, 1, msg)
        return None

    summary = _extract_backtest_summary(result_data, state.strategy)
    trade_dist = _extract_trade_distribution(result_data, state.strategy)
    summary["trade_distribution"] = trade_dist
    _rlog(run_id, 1, logging.INFO,
          f"Stage 1 | PASS | trades={trade_count}  profit_abs={summary.get('profit_total_abs', 0):.4f}"
          f"  max_dd={summary.get('max_drawdown_account', 0) * 100:.1f}%")
    _pass_stage(run_id, state, 1,
                f"Sanity backtest passed — {trade_count} trades, "
                f"profit {summary.get('profit_total_abs', 0):.2f}",
                summary)
    return summary


async def _stage_oos_validation(
    run_id: str, state: PipelineState, out_dir: Path, optimized_path: Path
) -> dict | None:
    _start_stage(run_id, state, 3)  # Stage 3 in new workflow
    strategy_name = optimized_path.stem
    # Use selected_pairs from Stage 1 pre-selection
    pairs_to_test = [p["key"] for p in state.selected_pairs] if state.selected_pairs else ([state.pair] if state.pair else None)
    _rlog(run_id, 3, logging.INFO,
          f"Stage 3 | OOS Validation | strategy={strategy_name} | range={state.out_sample_range}"
          f" | pairs={len(pairs_to_test) if pairs_to_test else 'all'}"
          f" | min_profit_threshold={state.min_oos_profit} | max_dd_threshold={state.max_drawdown_threshold:.2f}")
    _emit(run_id, 3, "running",
          f"Running out-of-sample validation on {state.out_sample_range}...", 55)

    result_prefix = str(out_dir / "stage3_result")
    cmd = _backtest_cmd(
        state,
        strategy=strategy_name,
        timerange=state.out_sample_range,
        result_prefix=result_prefix,
        pairs=pairs_to_test,
    )
    _rlog(run_id, 3, logging.DEBUG, f"Stage 3 | Spawning subprocess: {' '.join(cmd)}")

    rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=3)
    _rlog(run_id, 3, logging.DEBUG, f"Stage 3 | Subprocess exited with rc={rc}")

    if _cancelled(run_id):
        raise _Cancelled()

    if rc != 0:
        msg = _classify_subprocess_error(rc, stdout, "Stage 3 (OOS Validation)")
        _rlog(run_id, 3, logging.ERROR, f"Stage 3 | FAIL | {msg}")
        _fail_stage(run_id, state, 3, msg)
        return None

    result_data = _find_backtest_result(out_dir, "stage3_result", state.user_data_dir)
    summary = _extract_backtest_summary(result_data, strategy_name)
    trade_dist = _extract_trade_distribution(result_data, strategy_name)
    summary["trade_distribution"] = trade_dist
    profit_giveback = compute_profit_giveback_metrics(
        extract_strategy_trades(result_data, strategy_name)
    )
    summary["profit_giveback"] = profit_giveback

    profit_total = summary.get("profit_total", 0.0)
    max_dd = summary.get("max_drawdown_account", 0.0) * 100
    trade_count = _extract_trade_count(result_data, strategy_name)
    _rlog(run_id, 3, logging.DEBUG,
          f"Stage 3 | Parsed OOS result: profit={profit_total:.4f} max_dd={max_dd:.2f}% trades={trade_count}")

    if trade_count == 0:
        _rlog(run_id, 3, logging.WARNING,
              "Stage 3 | NO TRADES | OOS backtest produced zero trades — signalling retry loop")
        state.stages[2].data = {
            "_failed_metrics": {"profit": profit_total, "drawdown": max_dd, "trades": trade_count, "reason": "no_trades"}
        }
        return "retry"  # type: ignore[return-value]

    if profit_giveback["peak_to_loss_count"] > 0:
        _rlog(run_id, 3, logging.WARNING,
              "Stage 3 | PROFIT GIVEBACK | "
              f"{profit_giveback['peak_to_loss_count']} trade(s) reached tier-1 profit "
              "then closed negative — signalling retry loop")
        state.stages[2].data = {
            "_failed_metrics": {
                "profit": profit_total,
                "drawdown": max_dd,
                "trades": trade_count,
                "reason": "profit_giveback",
                "profit_giveback": profit_giveback,
            }
        }
        return "retry"  # type: ignore[return-value]

    _profit_fail = profit_total < state.min_oos_profit
    _dd_fail = max_dd > state.max_drawdown_threshold

    if _profit_fail and _dd_fail:
        _rlog(run_id, 3, logging.WARNING,
              f"Stage 3 | COMPOUND FAIL | profit={profit_total:.4f} < {state.min_oos_profit} AND "
              f"max_dd={max_dd:.2f} > {state.max_drawdown_threshold:.2f} — signalling retry loop")
        state.stages[2].data = {
            "_failed_metrics": {"profit": profit_total, "drawdown": max_dd, "trades": trade_count, "reason": "both"}
        }
        return "retry"  # type: ignore[return-value]

    if _profit_fail:
        _rlog(run_id, 3, logging.WARNING,
              f"Stage 3 | OVERFIT | profit={profit_total:.4f} < threshold={state.min_oos_profit}"
              f" — signalling retry loop")
        state.stages[2].data = {
            "_failed_metrics": {"profit": profit_total, "drawdown": max_dd, "trades": trade_count, "reason": "profit"}
        }
        return "retry"  # type: ignore[return-value]

    if _dd_fail:
        _rlog(run_id, 3, logging.WARNING,
              f"Stage 3 | HIGH DD | max_dd={max_dd:.2f} > threshold={state.max_drawdown_threshold:.2f}"
              f" — signalling retry loop")
        state.stages[2].data = {
            "_failed_metrics": {"profit": profit_total, "drawdown": max_dd, "trades": trade_count, "reason": "drawdown"}
        }
        return "retry"  # type: ignore[return-value]

    _rlog(run_id, 3, logging.INFO,
          f"Stage 3 | PASS | profit={profit_total:.4f}  max_dd={max_dd:.2f}  trades={trade_count}")
    _pass_stage(run_id, state, 3,
                f"OOS validation passed — profit {profit_total:.4f}, "
                f"drawdown {max_dd:.2f}, trades {trade_count}",
                summary)
    return summary


async def _stage_stress_test(
    run_id: str, state: PipelineState, out_dir: Path, optimized_path: Path
) -> dict | None:
    _start_stage(run_id, state, 5)
    strategy_name = optimized_path.stem
    # Use configured pair universe (default BROAD_UNIVERSE_PAIRS for Omni-Strategy)
    pairs_to_test = state.pair_universe
    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | Multi-Pair Stress Test | strategy={strategy_name}"
          f" | pairs={len(pairs_to_test)} | range={state.in_sample_range}")
    _emit(run_id, 5, "running",
          f"Running multi-pair stress test across {len(pairs_to_test)} USDT pairs...", 65)

    result_prefix = str(out_dir / "stage5_result")
    cmd = _backtest_cmd(
        state,
        strategy=strategy_name,
        timerange=state.in_sample_range,
        result_prefix=result_prefix,
        pairs=pairs_to_test,
    )
    _rlog(run_id, 5, logging.DEBUG,
          f"Stage 5 | Pairs: {', '.join(pairs_to_test)}")
    _rlog(run_id, 5, logging.DEBUG, f"Stage 5 | Spawning subprocess: {' '.join(cmd)}")

    rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=5)
    _rlog(run_id, 5, logging.DEBUG, f"Stage 5 | Subprocess exited with rc={rc}")

    if _cancelled(run_id):
        raise _Cancelled()

    if rc != 0:
        msg = _classify_subprocess_error(rc, stdout, "Stage 5 (Multi-Pair Stress Test)")
        _rlog(run_id, 5, logging.ERROR, f"Stage 5 | FAIL | {msg}")
        _fail_stage(run_id, state, 5, msg)
        return None

    result_data = _find_backtest_result(out_dir, "stage5_result", state.user_data_dir)
    per_pair = _extract_per_pair_results(result_data, strategy_name)

    # Apply dynamic pair filtering based on timeframe-specific thresholds
    winning_pairs = _filter_winning_pairs(per_pair, state.timeframe)
    failing_pairs = [p for p in per_pair if p not in winning_pairs]

    # Store winning pairs in state for later use in strategy generation
    state.winning_pairs = winning_pairs
    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | Filtered {len(winning_pairs)}/{len(per_pair)} winning pairs based on timeframe thresholds")

    # Analyze trading windows to identify losing time blocks
    trading_windows = _analyze_trading_windows(per_pair)
    state.excluded_time_windows = {
        "excluded_hours": trading_windows["excluded_hours"],
        "excluded_days": trading_windows["excluded_days"],
    }
    if trading_windows["excluded_hours"] or trading_windows["excluded_days"]:
        _rlog(run_id, 5, logging.INFO,
              f"Stage 5 | Trading window analysis: excluded_hours={trading_windows['excluded_hours']}, "
              f"excluded_days={trading_windows['excluded_days']}")

    # Check minimum profitable pairs requirement (at least 3)
    if len(winning_pairs) < 3:
        msg = (f"Insufficient profitable pairs ({len(winning_pairs)} < 3). "
               f"Strategy may not be generalizable. Consider adjusting parameters or timeframe.")
        _rlog(run_id, 5, logging.WARNING, f"Stage 5 | {msg}")
        # Note: This will trigger self-healing in the main pipeline loop
        summary = _extract_backtest_summary(result_data, strategy_name)
        summary["per_pair"] = per_pair
        summary["winning_pairs"] = [p["key"] for p in winning_pairs]
        summary["failing_pairs"] = [p["key"] for p in failing_pairs]
        summary["insufficient_pairs"] = True
        _fail_stage(run_id, state, 5, msg, summary)
        return None

    summary = _extract_backtest_summary(result_data, strategy_name)
    summary["per_pair"] = per_pair
    summary["winning_pairs"] = [p["key"] for p in winning_pairs]
    summary["failing_pairs"] = [p["key"] for p in failing_pairs]

    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | Stress result: {len(winning_pairs)}/{len(per_pair)} pairs passed filtering"
          f"  winning={[p['key'] for p in winning_pairs]}")
    _emit(run_id, 5, "running",
          f"Stress test: {len(winning_pairs)} winning pairs, {len(failing_pairs)} filtered out.", 72)

    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | PASS | winning={len(winning_pairs)} filtered={len(failing_pairs)} total={len(per_pair)}")
    _pass_stage(run_id, state, 5,
                f"Stress test complete — {len(winning_pairs)}/{len(per_pair)} pairs passed filtering.",
                summary)
    return summary


async def _stage_robustness_feature_injection(
    run_id: str, state: PipelineState, out_dir: Path, optimized_path: Path
) -> dict | None:
    """Stage 4: Robustness & Feature Injection (Slippage/Fee Stress Testing).

    Performs:
    1. Losing windows analysis from Hyperopt backtest trades
    2. Three global portfolio backtests with fee multipliers (1x, 2x, 3x)
    3. Stability score computation with division-by-zero guard
    4. Real-time WebSocket streaming of stability scores
    5. Safe feature injection (custom_stoploss + trading windows)
    """
    _start_stage(run_id, state, 4)  # Stage 4: Robustness & Feature Injection
    strategy_name = optimized_path.stem
    pairs_to_test = [p["key"] for p in state.selected_pairs] if state.selected_pairs else None

    if not pairs_to_test:
        _rlog(run_id, 4, logging.WARNING, "Stage 4 | No selected_pairs available, skipping stress testing")
        state.stability_scores = {}
        _pass_stage(run_id, state, 4, "No pairs to test for stress testing", {"stability_scores": {}})
        return {"stability_scores": {}}

    _rlog(run_id, 4, logging.INFO,
          f"Stage 4 | Robustness & Feature Injection | strategy={strategy_name} | pairs={len(pairs_to_test)}")
    _emit(run_id, 4, "running", f"Running slippage/fee stress testing on {len(pairs_to_test)} pairs...", 55)

    # ── Sub-step 4.1: Losing windows analysis from Hyperopt backtest trades ─────────
    _rlog(run_id, 4, logging.INFO, "Stage 4 | Analyzing losing windows from Hyperopt backtest...")
    try:
        # Load Hyperopt backtest result (stage2_result)
        hyperopt_result_data = _find_backtest_result(out_dir, "stage2_result", state.user_data_dir)
        if hyperopt_result_data:
            per_pair = _extract_per_pair_results(hyperopt_result_data, strategy_name)
            trading_windows = _analyze_trading_windows(per_pair)
            state.excluded_time_windows = {
                "excluded_hours": trading_windows["excluded_hours"],
                "excluded_days": trading_windows["excluded_days"],
            }
            _rlog(run_id, 4, logging.INFO,
                  f"Stage 4 | Trading window analysis: excluded_hours={trading_windows['excluded_hours']}, "
                  f"excluded_days={trading_windows['excluded_days']}")
        else:
            _rlog(run_id, 4, logging.WARNING, "Stage 4 | No Hyperopt backtest result found, skipping window analysis")
            state.excluded_time_windows = {"excluded_hours": [], "excluded_days": []}
    except Exception as exc:
        _rlog(run_id, 4, logging.WARNING, f"Stage 4 | Losing windows analysis failed: {exc}")
        state.excluded_time_windows = {"excluded_hours": [], "excluded_days": []}

    # ── Sub-step 4.2: Run 3 fee stress tests (1x, 2x, 3x) using temp configs ─────────
    fee_multipliers = [1.0, 2.0, 3.0]
    stress_results = {}  # {multiplier: {pair: profit}}
    temp_configs = []

    try:
        for multiplier in fee_multipliers:
            _rlog(run_id, 4, logging.INFO, f"Stage 4 | Running stress test with {multiplier}x fees...")
            _emit(run_id, 4, "running", f"Running stress test with {multiplier}x fees...", 55 + (multiplier * 5))

            # Create temporary config with fee override
            temp_config = _create_temp_config_with_fee_override(
                state.config_file, multiplier, out_dir
            )
            temp_configs.append(temp_config)

            # Run backtest with temp config
            result_prefix = str(out_dir / f"stage4_stress_{multiplier}x")
            cmd = _backtest_cmd(
                state,
                strategy=strategy_name,
                timerange=state.in_sample_range,  # Use in-sample for stress testing
                result_prefix=result_prefix,
                pairs=pairs_to_test,
            )

            # Override config path in cmd to use temp config
            cmd = [state.freqtrade_path, "backtesting",
                    "--config", str(temp_config),
                    "--strategy", strategy_name,
                    "--timerange", state.in_sample_range,
                    "--timeframe", state.timeframe,
                    "--user-data-dir", state.user_data_dir,
                    "--export", "trades",
                    "--export-filename", result_prefix + ".json",
                    "--no-color",
                    "--cache", "none"]
            cmd += strategy_path_args(state)
            if pairs_to_test:
                cmd += ["--pairs"] + pairs_to_test

            _rlog(run_id, 4, logging.DEBUG, f"Stage 4 | Spawning subprocess: {' '.join(cmd)}")
            rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=4)

            if rc != 0:
                msg = _classify_subprocess_error(rc, stdout, f"Stage 4 (Stress Test {multiplier}x)")
                _rlog(run_id, 4, logging.ERROR, f"Stage 4 | FAIL | {msg}")
                _fail_stage(run_id, state, 4, msg)
                return None

            # Extract per-pair results
            result_data = _find_backtest_result(out_dir, f"stage4_stress_{multiplier}x", state.user_data_dir)
            per_pair = _extract_per_pair_results(result_data, strategy_name)

            # Store profits for each pair (use profit_total which is what _extract_per_pair_results returns)
            pair_profits = {p["key"]: p.get("profit_total", 0.0) for p in per_pair}
            stress_results[multiplier] = pair_profits

            _rlog(run_id, 4, logging.INFO,
                  f"Stage 4 | {multiplier}x stress test complete: {len(pair_profits)} pairs")

    finally:
        # Cleanup temporary config files
        for temp_config in temp_configs:
            try:
                Path(temp_config).unlink(missing_ok=True)
                _rlog(run_id, 4, logging.DEBUG, f"Stage 4 | Deleted temp config: {temp_config}")
            except Exception as exc:
                _rlog(run_id, 4, logging.WARNING, f"Stage 4 | Failed to delete temp config {temp_config}: {exc}")

    # ── Sub-step 4.3: Compute stability scores with division-by-zero guard ─────────
    _rlog(run_id, 4, logging.INFO, "Stage 4 | Computing stability scores...")
    state.stability_scores = {}

    for pair in pairs_to_test:
        profit_1x = stress_results.get(1.0, {}).get(pair, 0.0)
        profit_2x = stress_results.get(2.0, {}).get(pair, 0.0)
        profit_3x = stress_results.get(3.0, {}).get(pair, 0.0)

        # CRITICAL BUG GUARD: If profit at 1x fees <= 0, set stability_score = 0
        if profit_1x <= 0:
            stability_score = 0.0
        else:
            stability_score = 100 * (profit_3x / profit_1x)

        # Enforce strict clamping to [0, 100]
        stability_score = max(0.0, min(100.0, stability_score))

        state.stability_scores[pair] = stability_score

        # ── Sub-step 4.4: Emit WebSocket event for each pair ─────────────────────
        _emit(run_id, 4, "running",
              f"Stability score for {pair}: {stability_score:.1f}",
              65,
              msg_type="stability_score_result",
              data={
                  "pair_name": pair,
                  "stability_score": round(stability_score, 2),
                  "profit_1x": round(profit_1x, 4),
                  "profit_2x": round(profit_2x, 4),
                  "profit_3x": round(profit_3x, 4),
              })

        _rlog(run_id, 4, logging.DEBUG,
              f"Stage 4 | {pair}: stability={stability_score:.1f} "
              f"profits=[1x={profit_1x:.4f}, 2x={profit_2x:.4f}, 3x={profit_3x:.4f}]")

    _rlog(run_id, 4, logging.INFO,
          f"Stage 4 | Stability scores computed for {len(state.stability_scores)} pairs")

    # ── Sub-step 4.5: Failure-driven feature injection ───────────────────────────────
    _rlog(run_id, 4, logging.INFO, "Stage 4 | Analyzing failure patterns for feature injection...")
    injection_success = True
    injection_error = None
    features_injected = []
    failure_reasons = []

    try:
        strategy_content = optimized_path.read_text(encoding="utf-8")

        # ── Analyze failure patterns from stress test results ─────────────────────
        # Pattern 1: Liquidity weakness (low volume periods) → volume filter
        liquidity_weakness = False
        avg_profit_1x = sum(stress_results.get(1.0, {}).values()) / len(stress_results.get(1.0, {})) if stress_results.get(1.0) else 0
        avg_profit_3x = sum(stress_results.get(3.0, {}).values()) / len(stress_results.get(3.0, {})) if stress_results.get(3.0) else 0
        
        # If profit degrades significantly under high fees, indicates sensitivity to execution quality
        if avg_profit_1x > 0 and (avg_profit_3x / avg_profit_1x) < 0.5:
            liquidity_weakness = True
            failure_reasons.append("liquidity_weakness")
            _rlog(run_id, 4, logging.INFO, "Stage 4 | Detected liquidity weakness - injecting volume filter")

        # Pattern 2: High drawdown during volatility → ATR volatility guard
        high_drawdown = False
        # Check if any pair has low stability score (indicates sensitivity to stress)
        low_stability_pairs = [p for p, score in state.stability_scores.items() if score < 50]
        if len(low_stability_pairs) / len(state.stability_scores) > 0.3:
            high_drawdown = True
            failure_reasons.append("high_drawdown")
            _rlog(run_id, 4, logging.INFO, "Stage 4 | Detected high drawdown sensitivity - injecting ATR volatility guard")

        # Pattern 3: Bad trades in specific hours → blocked_hours (already analyzed)
        blocked_hours = state.excluded_time_windows.get("excluded_hours", [])
        blocked_days = state.excluded_time_windows.get("excluded_days", [])
        if blocked_hours or blocked_days:
            failure_reasons.append("time_window_failures")
            _rlog(run_id, 4, logging.INFO, f"Stage 4 | Detected time window failures - injecting blocked_hours={blocked_hours}, blocked_days={blocked_days}")

        # ── Inject features based on detected failures ─────────────────────────────
        
        # Feature 1: Volume filter (for liquidity weakness)
        if liquidity_weakness:
            volume_filter_code = '''
    def confirm_trade_entry(self, pair: str, order_type: str, rate: float, time_in_force: str, 
                           current_time: datetime, entry_tag: str | None, side: str, **kwargs) -> bool:
        """Volume filter: only enter trades when volume is above threshold."""
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        last_candle = dataframe.iloc[-1]
        
        # Skip if volume is too low (liquidity weakness)
        min_volume = last_candle['volume'].rolling(24).mean().iloc[-1] * 0.5
        if last_candle['volume'] < min_volume:
            return False
            
        return True
'''
            class_pattern = rf'(class {re.escape(strategy_name)}\(IStrategy\):)'
            if re.search(class_pattern, strategy_content):
                strategy_content = re.sub(
                    class_pattern,
                    f'\\1\n{volume_filter_code}',
                    strategy_content,
                    count=1,
                )
                features_injected.append("volume_filter")
                _rlog(run_id, 4, logging.DEBUG, "Stage 4 | Injected volume_filter method")

        # Feature 2: ATR volatility guard (for high drawdown)
        if high_drawdown:
            atr_guard_code = '''
    def confirm_trade_exit(self, pair: str, trade: Trade, order_type: str, amount: float, rate: float,
                          time_in_force: str, exit_reason: str, current_time: datetime, **kwargs) -> bool:
        """ATR volatility guard: reduce position size during high volatility."""
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        last_candle = dataframe.iloc[-1]
        
        # Calculate ATR-based volatility
        atr = last_candle['atr'] if 'atr' in last_candle else 0
        avg_atr = dataframe['atr'].rolling(24).mean().iloc[-1] if 'atr' in dataframe else 0
        
        # If volatility is extremely high, skip exit (let trailing stop handle it)
        if atr > avg_atr * 2.0:
            return False
            
        return True
'''
            class_pattern = rf'(class {re.escape(strategy_name)}\(IStrategy\):)'
            if re.search(class_pattern, strategy_content) and 'confirm_trade_exit' not in strategy_content:
                strategy_content = re.sub(
                    class_pattern,
                    f'\\1\n{atr_guard_code}',
                    strategy_content,
                    count=1,
                )
                features_injected.append("atr_volatility_guard")
                _rlog(run_id, 4, logging.DEBUG, "Stage 4 | Injected atr_volatility_guard method")

        # Feature 3: Trading window filters (for time-based failures)
        if blocked_hours or blocked_days:
            class_line = f"class {strategy_name}(IStrategy):"
            if class_line in strategy_content:
                lines = strategy_content.split('\n')
                for i, line in enumerate(lines):
                    if class_line in line:
                        # Insert after INTERFACE_VERSION line (typically 2 lines after class)
                        insert_idx = i + 2
                        lines.insert(insert_idx, f"    blocked_hours = {blocked_hours}")
                        lines.insert(insert_idx + 1, f"    blocked_days = {blocked_days}")
                        break
                strategy_content = '\n'.join(lines)
                features_injected.append("trading_windows")
                _rlog(run_id, 4, logging.DEBUG,
                      f"Stage 4 | Injected trading window filters: hours={blocked_hours}, days={blocked_days}")

        # Feature 4: Custom stoploss (always inject for robustness)
        custom_stoploss_code = '''
    def custom_stoploss(self, pair: str, trade, current_time, current_rate: float,
                        current_profit: float, after_fill: bool, **kwargs) -> float | None:
        """Three-tier aggressive trailing stoploss with profit lock-in.
        
        Tier 1: If profit >= 2%, lock stoploss at +0.5%
        Tier 2: If profit >= 4%, lock stoploss at +1.5%
        Tier 3: If profit >= 8%, lock stoploss at +3.0%
        """
        from freqtrade.strategy import stoploss_from_open
        
        if current_profit >= 0.08:  # 8%
            return stoploss_from_open(0.03, current_profit, is_short=trade.is_short, leverage=trade.leverage) or 1
        if current_profit >= 0.04:  # 4%
            return stoploss_from_open(0.015, current_profit, is_short=trade.is_short, leverage=trade.leverage) or 1
        if current_profit >= 0.02:  # 2%
            return stoploss_from_open(0.005, current_profit, is_short=trade.is_short, leverage=trade.leverage) or 1
        return None
'''
        class_pattern = rf'(class {re.escape(strategy_name)}\(IStrategy\):)'
        if re.search(class_pattern, strategy_content) and 'custom_stoploss' not in strategy_content:
            strategy_content = re.sub(
                class_pattern,
                f'\\1\n{custom_stoploss_code}',
                strategy_content,
                count=1,
            )
            features_injected.append("custom_stoploss")
            _rlog(run_id, 4, logging.DEBUG, "Stage 4 | Injected custom_stoploss method")

        # Feature 5: Custom stake amount (for risk management)
        # Inject if high drawdown detected or if stability scores are low
        if high_drawdown or len(low_stability_pairs) > 0:
            custom_stake_code = '''
    def custom_stake_amount(self, pair: str, current_time: datetime, current_rate: float,
                           proposed_stake: float, min_stake: float, max_stake: float,
                           leverage: float, entry_tag: str | None, side: str, **kwargs) -> float:
        """Dynamic stake sizing based on volatility and recent performance."""
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        last_candle = dataframe.iloc[-1]
        
        # Calculate ATR-based volatility
        atr = last_candle['atr'] if 'atr' in last_candle else 0
        avg_atr = dataframe['atr'].rolling(24).mean().iloc[-1] if 'atr' in dataframe else 0
        
        # Reduce stake size during high volatility
        if atr > avg_atr * 1.5:
            return proposed_stake * 0.5  # 50% reduction
        
        return proposed_stake
'''
            class_pattern = rf'(class {re.escape(strategy_name)}\(IStrategy\):)'
            if re.search(class_pattern, strategy_content) and 'custom_stake_amount' not in strategy_content:
                strategy_content = re.sub(
                    class_pattern,
                    f'\\1\n{custom_stake_code}',
                    strategy_content,
                    count=1,
                )
                features_injected.append("custom_stake_amount")
                _rlog(run_id, 4, logging.DEBUG, "Stage 4 | Injected custom_stake_amount method")

        # Feature 6: Risk guard (max drawdown protection)
        # Always inject for safety
        risk_guard_code = '''
    def confirm_trade_entry(self, pair: str, order_type: str, rate: float, time_in_force: str, 
                           current_time: datetime, entry_tag: str | None, side: str, **kwargs) -> bool:
        """Risk guard: prevent over-trading and excessive drawdown."""
        # Get current open trades
        open_trades = len(self.trade_handler.order_open_trades)
        
        # Limit concurrent trades to prevent overexposure
        max_open_trades = 5
        if open_trades >= max_open_trades:
            return False
            
        return True
'''
        # Check if confirm_trade_entry already exists (from volume filter)
        if 'confirm_trade_entry' not in strategy_content:
            class_pattern = rf'(class {re.escape(strategy_name)}\(IStrategy\):)'
            if re.search(class_pattern, strategy_content):
                strategy_content = re.sub(
                    class_pattern,
                    f'\\1\n{risk_guard_code}',
                    strategy_content,
                    count=1,
                )
                features_injected.append("risk_guard")
                _rlog(run_id, 4, logging.DEBUG, "Stage 4 | Injected risk_guard method")

        # Write modified strategy back
        optimized_path.write_text(strategy_content, encoding="utf-8")
        _rlog(run_id, 4, logging.INFO, f"Stage 4 | Feature injection successful - injected: {features_injected}")

    except Exception as exc:
        injection_success = False
        injection_error = str(exc)
        _rlog(run_id, 4, logging.ERROR,
              f"Stage 4 | Feature injection failed: {injection_error} | Continuing with unmodified strategy")
        _emit(run_id, 4, "running",
              f"Warning: Feature injection failed ({exc}), continuing with unmodified strategy",
              70)

    # ── Stage completion ───────────────────────────────────────────────────────────
    # Format output to match user's expected format
    # features_injected is already built during the injection process
    
    # Compute actual metrics from stress results (no fake placeholders)
    stress_tests = {}
    warnings = []
    
    # Calculate total profit by fee multiplier
    total_profit_by_fee_multiplier = {}
    for multiplier in [1.0, 2.0, 3.0]:
        if multiplier in stress_results:
            pair_profits = stress_results[multiplier]
            total_profit = sum(pair_profits.values())
            total_profit_by_fee_multiplier[f"fee_{multiplier}x_total_profit"] = total_profit
    
    # Calculate profit retention if baseline exists
    if 1.0 in stress_results and 2.0 in stress_results:
        profit_1x = sum(stress_results[1.0].values())
        profit_2x = sum(stress_results[2.0].values())
        if profit_1x > 0:
            profit_retention_2x = (profit_2x / profit_1x) * 100
            stress_tests["profit_retention_2x_pct"] = round(profit_retention_2x, 2)
    
    if 1.0 in stress_results and 3.0 in stress_results:
        profit_1x = sum(stress_results[1.0].values())
        profit_3x = sum(stress_results[3.0].values())
        if profit_1x > 0:
            profit_retention_3x = (profit_3x / profit_1x) * 100
            stress_tests["profit_retention_3x_pct"] = round(profit_retention_3x, 2)
    
    # Add computed metrics
    stress_tests.update(total_profit_by_fee_multiplier)
    stress_tests["pairs_tested"] = len(pairs_to_test) if pairs_to_test else 0
    
    # Add note about unavailable PF/drawdown metrics
    stress_tests["note"] = (
        "Profit factor and drawdown metrics not computed - raw trade-level data unavailable. "
        "Stability scores and profit retention by fee multiplier are reported instead."
    )
    
    # Add warning if stress results are incomplete
    if not stress_results or len(stress_results) < 3:
        warnings.append("Stress test results incomplete - some fee multiplier tests may have failed.")
    
    summary = {
        "status": "passed",
        "stress_tests": stress_tests,
        "features_injected": features_injected,
        "failure_reasons": failure_reasons,
        "stability_scores": state.stability_scores,
        "stress_results": stress_results,
        "excluded_time_windows": state.excluded_time_windows,
        "injection_success": injection_success,
        "injection_error": injection_error,
        "warnings": warnings,
    }
    _pass_stage(run_id, state, 4, "Robustness & Feature Injection complete", summary)
    return summary


async def _stage_portfolio_baseline(
    run_id: str,
    state: PipelineState,
    out_dir: Path,
) -> dict | None:
    """Stage 2: Portfolio Baseline Backtest with capital constraints.

    Performs:
    1. Joint portfolio backtest with max_open_trades constraint on user-approved pairs
    2. Portfolio and per-pair metrics extraction
    3. Store baseline trade counts for capital starvation detection later
    4. Pause for second user approval to review portfolio baseline results
    """
    _start_stage(run_id, state, 2)
    strategy_name = state.strategy
    pairs_to_test = [p["key"] for p in state.selected_pairs] if state.selected_pairs else None

    if not pairs_to_test:
        _rlog(run_id, 2, logging.WARNING, "Stage 2 | No selected_pairs available, skipping portfolio baseline")
        state.portfolio_weights = {}
        _pass_stage(run_id, state, 2, "No pairs to test for portfolio baseline", {"portfolio_weights": {}})
        return {"portfolio_weights": {}}

    _rlog(run_id, 2, logging.INFO,
          f"Stage 2 | Portfolio Baseline | strategy={strategy_name} | pairs={len(pairs_to_test)} | "
          f"max_open_trades={state.max_open_trades}")
    _emit(run_id, 2, "running",
          f"Running portfolio baseline backtest with {state.max_open_trades} max open trades...",
          20)

    # ── Sub-step 2.1: Joint Portfolio Backtest Execution ───────────────────────
    try:
        # Create temporary config with max_open_trades constraint
        temp_config = _create_temp_config_with_max_open_trades(
            state.config_file, state.max_open_trades, out_dir
        )

        result_prefix = str(out_dir / "stage2_portfolio_baseline")
        cmd = [state.freqtrade_path, "backtesting",
                "--config", str(temp_config),
                "--strategy", strategy_name,
                "--timerange", state.in_sample_range,
                "--timeframe", state.timeframe,
                "--user-data-dir", state.user_data_dir,
                "--export", "trades",
                "--export-filename", result_prefix + ".json",
                "--no-color",
                "--cache", "none"]
        cmd += strategy_path_args(state)
        if pairs_to_test:
            cmd += ["--pairs"] + pairs_to_test

        _rlog(run_id, 2, logging.DEBUG, f"Stage 2 | Spawning subprocess: {' '.join(cmd)}")
        rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=2)

        # Cleanup temp config
        try:
            Path(temp_config).unlink(missing_ok=True)
        except Exception as exc:
            _rlog(run_id, 2, logging.WARNING, f"Stage 2 | Failed to delete temp config: {exc}")

        if _cancelled(run_id):
            raise _Cancelled()

        if rc != 0:
            msg = _classify_subprocess_error(rc, stdout, "Stage 2 (Portfolio Baseline)")
            _rlog(run_id, 2, logging.ERROR, f"Stage 2 | FAIL | {msg}")
            _fail_stage(run_id, state, 2, msg)
            return None

    except Exception as exc:
        msg = f"Portfolio baseline backtest failed: {exc}"
        _rlog(run_id, 2, logging.ERROR, f"Stage 2 | FAIL | {msg}")
        _fail_stage(run_id, state, 2, msg)
        return None

    # ── Sub-step 2.2: Portfolio Metrics Extraction ───────────────────────────
    result_data = _find_backtest_result(out_dir, "stage2_portfolio_baseline", state.user_data_dir)
    portfolio_summary = _extract_backtest_summary(result_data, strategy_name)
    per_pair = _extract_per_pair_results(result_data, strategy_name)

    portfolio_profit = portfolio_summary.get("profit_total_abs", 0.0)
    portfolio_max_dd = portfolio_summary.get("max_drawdown_account", 0.0)
    portfolio_trades = portfolio_summary.get("total_trades", 0)

    _rlog(run_id, 2, logging.INFO,
          f"Stage 2 | Portfolio baseline metrics: profit={portfolio_profit:.4f} max_dd={portfolio_max_dd:.4f} trades={portfolio_trades}")

    # Store baseline trade counts for capital starvation detection later
    for pair_data in per_pair:
        pair_key = pair_data.get("key", "")
        trade_count = pair_data.get("trades", 0)
        state.baseline_trade_counts[pair_key] = trade_count

    # Store portfolio baseline result in state
    state.portfolio_baseline_result = {
        "portfolio_summary": portfolio_summary,
        "per_pair": per_pair,
        "portfolio_profit": portfolio_profit,
        "portfolio_max_dd": portfolio_max_dd,
        "portfolio_trades": portfolio_trades,
    }

    # ── Sub-step 2.3: Pause for second user approval ─────────────────────────
    summary = {
        "portfolio_summary": portfolio_summary,
        "per_pair": per_pair,
        "portfolio_profit": portfolio_profit,
        "portfolio_max_dd": portfolio_max_dd,
        "portfolio_trades": portfolio_trades,
        "baseline_trade_counts": state.baseline_trade_counts,
    }
    
    # Emit WebSocket event with portfolio baseline results for user review
    _emit(run_id, 2, "running",
          f"Portfolio baseline complete: profit={portfolio_profit:.2f}, max_dd={portfolio_max_dd:.2%}. Please review and confirm pair selection.",
          25,
          {
              "type": "portfolio_baseline_review",
              "portfolio_summary": portfolio_summary,
              "per_pair": per_pair,
              "current_pairs": pairs_to_test,
              "portfolio_profit": portfolio_profit,
              "portfolio_max_dd": portfolio_max_dd,
              "portfolio_trades": portfolio_trades,
          },
          msg_type="portfolio_baseline_review")
    
    # Set status to awaiting user approval and save state
    state.status = "awaiting_user_approval"
    state.current_stage = 2
    state.stages[1].data = summary
    state.stages[1].status = "running"  # Keep as running, not passed
    _save_state_to_disk(state)
    
    _rlog(run_id, 2, logging.INFO,
          f"Stage 2 | PAUSED: Awaiting user approval for portfolio baseline review")
    return summary
