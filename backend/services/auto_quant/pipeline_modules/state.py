"""Data structures and persistence for the Auto-Quant pipeline."""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import (
    BROAD_UNIVERSE_PAIRS,
    MAX_DRAWDOWN_THRESHOLD,
    MIN_OOS_PROFIT,
    MIN_PROFIT_FACTOR,
    MIN_SHARPE,
    MIN_WIN_RATE,
    MONTE_CARLO_THRESHOLD,
    STAGE_NAMES,
    TOP_PAIRS_SELECTION_COUNT,
)
from .logging import _rlog, get_queues, logger
from ..policy import get_policy_versions, load_policy, normalize_decimal

# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class StageState:
    index: int          # 1-based
    name: str
    status: str = "pending"   # pending | running | passed | failed | skipped
    message: str = ""
    data: dict = field(default_factory=dict)
    started_at: str | None = None
    duration_s: float | None = None


@dataclass
class PipelineState:
    run_id: str
    strategy: str
    timeframe: str
    in_sample_range: str
    out_sample_range: str
    exchange: str
    config_file: str
    freqtrade_path: str
    user_data_dir: str
    original_strategy: str | None = None
    original_strategy_hash: str | None = None
    status: str = "pending"   # pending | running | completed | failed | cancelled | interrupted | awaiting_user_approval
    current_stage: int = 0   # 0 = not started, 1-7 = active stage
    stages: list[StageState] = field(default_factory=list)
    report: dict | None = None
    error: str | None = None
    created_at: str = ""
    completed_at: str | None = None
    # Per-run risk thresholds (fall back to module-level defaults if not set)
    max_drawdown_threshold: float = MAX_DRAWDOWN_THRESHOLD  # 0.30 = 30%
    min_win_rate: float = MIN_WIN_RATE  # 0.40 = 40%
    min_profit_factor: float = MIN_PROFIT_FACTOR
    min_sharpe: float = MIN_SHARPE
    monte_carlo_threshold: float = MONTE_CARLO_THRESHOLD
    # Per-run hyperopt settings
    hyperopt_loss: str = "OnlyProfitHyperOptLoss"
    hyperopt_spaces: list = field(default_factory=lambda: ["buy", "stoploss", "roi"])
    hyperopt_epochs: int = 200
    hyperopt_workers: int = 1
    # Per-run OOS profit gate (Stage 4)
    min_oos_profit: float = 0.0
    # Self-healing retry state
    retry_count: int = 0
    max_retries: int = 3
    retry_history: list = field(default_factory=list)
    generalization_failure: dict | None = None
    sensitivity: dict | None = None
    # Walk-Forward Optimization settings
    wfo_enabled: bool = False
    wfo_is_months: int = 3
    wfo_oos_months: int = 1
    wfo_recency_weight: float = 1.0
    planned_wfo_windows: list = field(default_factory=list)  # Planned windows from policy
    wfo_windows: list = field(default_factory=list)  # Executed window results
    wfo_skip_reason: str | None = None
    # Alpha Ensemble Voting
    ensemble_enabled: bool = False
    # Optional single-pair override (set via the Pair Screener; if provided,
    # passed as --pairs <pair> to Stage 1 and Stage 4 backtests)
    pair: str | None = None
    # Dynamic Pair-list Whitelisting
    pair_universe: list = field(default_factory=lambda: BROAD_UNIVERSE_PAIRS)
    winning_pairs: list = field(default_factory=list)  # Legacy: from Stage 5 stress test
    selected_pairs: list = field(default_factory=list)  # New: top pairs from Stage 1 pre-selection
    excluded_time_windows: dict = field(default_factory=dict)
    # Ollama AI Integration
    ai_enabled: bool = True  # Per-run AI toggle
    ai_suggestions: dict = field(default_factory=dict)  # Store AI suggestions for review
    ai_interactions: list = field(default_factory=list)  # Log all AI interactions
    ai_metrics: dict = field(default_factory=dict)  # Track AI performance metrics
    ollama_available: bool = False  # Cached availability check
    # Data Healing Configuration
    data_healing_warmup_candles: int = 200  # Indicator warm-up period in candles
    data_healing_timeout: int = 300  # Subprocess timeout in seconds
    # Phase 1 Self-Healing Attempts
    phase1_heal_attempts: int = 0  # Counter for Stage 1 baseline backtest self-healing retries
    # Phase 3 Stability Scores (Slippage/Fee Stress Testing)
    stability_scores: dict = field(default_factory=dict)  # {pair_name: stability_score}
    # Phase 4 Portfolio Competition
    portfolio_weights: dict = field(default_factory=dict)  # {pair_name: normalized_weight}
    baseline_trade_counts: dict = field(default_factory=dict)  # {pair_name: trade_count_from_stage2}
    max_open_trades: int = 5  # Capital constraint for portfolio competition
    # Robustness-first workflow configuration
    strategy_source: str = "existing"
    trading_style: str = "swing"
    risk_profile: str = "balanced"
    analysis_depth: str = "deep"
    uploaded_strategy_id: str | None = None
    advanced_overrides: dict = field(default_factory=dict)
    auto_discovery_enabled: bool = False
    discovery_results: dict = field(default_factory=dict)
    validation_notes: list = field(default_factory=list)
    run_config_snapshot: dict = field(default_factory=dict)
    policy_versions: dict = field(default_factory=dict)
    selected_timeframe: str | None = None
    selected_pair_universe: list = field(default_factory=list)
    score: dict = field(default_factory=dict)
    validation_status: str = "Candidate"
    readiness_label: str = "Candidate"
    score_explanation: list = field(default_factory=list)
    progress_percent: int = 0
    eta_seconds: int | None = None
    progress_counters: dict = field(default_factory=lambda: {
        "strategies_generated": 0,
        "strategies_tested": 0,
        "strategies_rejected": 0,
        "strategies_surviving": 0,
    })
    strategy_runtime_dir: str | None = None
    strategy_variants: list = field(default_factory=list)
    artifact_versions: dict = field(default_factory=dict)
    # User approval workflow
    user_approved_pairs: list = field(default_factory=list)  # User-selected pairs after approval
    portfolio_baseline_result: dict = field(default_factory=dict)  # Portfolio baseline backtest results
    # Regime Detection
    regime_detection_enabled: bool = True  # Enable/disable regime detection
    current_regime: str = None  # Current market regime
    regime_probabilities: dict = field(default_factory=dict)  # Regime posterior probabilities
    regime_history: list = field(default_factory=list)  # Historical regime classifications
    regime_model_path: str = None  # Path to trained HMM model
    # Genetic Algorithm Evolution
    genetic_evolution_enabled: bool = False  # Enable/disable genetic evolution
    best_dna: dict = field(default_factory=dict)  # Best DNA from evolution
    ga_history: list = field(default_factory=list)  # Evolution history across generations
    ga_generations: int = 20  # Number of GA generations
    ga_population_size: int = 50  # GA population size
    ga_converged: bool = False  # Whether GA converged
    # Reinforcement Learning
    rl_training_enabled: bool = False  # Enable/disable RL training
    rl_deployment_enabled: bool = False  # Enable/disable RL deployment
    rl_algorithm: str = "ppo"  # RL algorithm (ppo, sac, a2c)
    rl_total_timesteps: int = 1000000  # Total RL training timesteps
    rl_model_path: str = None  # Path to trained RL model
    rl_performance: dict = field(default_factory=dict)  # RL performance metrics
    rl_trades: list = field(default_factory=list)  # RL agent trades


# ── Global in-memory registry ─────────────────────────────────────────────────

_states: dict[str, PipelineState] = {}
_queues: dict[str, list[asyncio.Queue]] = get_queues()
_cancel_flags: dict[str, bool] = {}
_EVENT_HISTORY_MAX = 500
_event_history: dict[str, deque[dict[str, Any]]] = {}


def get_states() -> dict[str, PipelineState]:
    """Return the in-memory state registry."""
    return _states


def get_cancel_flags() -> dict[str, bool]:
    """Return the in-memory cancel flag registry."""
    return _cancel_flags


def record_event(run_id: str, event: dict[str, Any]) -> None:
    """Keep a bounded per-run event history for observability clients."""
    history = _event_history.setdefault(run_id, deque(maxlen=_EVENT_HISTORY_MAX))
    history.append(event)


def get_event_history(run_id: str, limit: int = 200) -> list[dict[str, Any]]:
    """Return recent events emitted for a pipeline run."""
    history = list(_event_history.get(run_id, []))
    return history[-max(1, limit):]


# ── Disk persistence ───────────────────────────────────────────────────────────

def _state_file(state: PipelineState) -> Path:
    return Path(state.user_data_dir) / "auto_quant" / state.run_id / "state.json"


def _run_dir(state: PipelineState) -> Path:
    return Path(state.user_data_dir) / "auto_quant" / state.run_id


def _write_versioned_json(
    run_dir: Path,
    stem: str,
    payload: dict[str, Any],
    *,
    legacy_name: str | None = None,
) -> dict[str, str]:
    run_dir.mkdir(parents=True, exist_ok=True)
    versioned = run_dir / f"{stem}_v1.json"
    latest = run_dir / f"{stem}_latest.json"
    versioned.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    latest.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    artifacts = {f"{stem}_v1": versioned.name, f"{stem}_latest": latest.name}
    if legacy_name:
        legacy = run_dir / legacy_name
        legacy.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        artifacts[legacy_name.rsplit(".", 1)[0]] = legacy.name
    return artifacts


def _save_state_to_disk(state: PipelineState) -> None:
    """Persist current pipeline state to disk so it survives restarts."""
    try:
        path = _state_file(state)
        run_dir = path.parent
        run_dir.mkdir(parents=True, exist_ok=True)
        logger.debug(
            "[%s] Writing state.json → %s  (status=%s, stage=%d)",
            state.run_id, path, state.status, state.current_stage,
        )
        payload: dict[str, Any] = {
            "run_id": state.run_id,
            "strategy": state.strategy,
            "original_strategy": state.original_strategy,
            "original_strategy_hash": state.original_strategy_hash,
            "timeframe": state.timeframe,
            "in_sample_range": state.in_sample_range,
            "out_sample_range": state.out_sample_range,
            "exchange": state.exchange,
            "config_file": state.config_file,
            "freqtrade_path": state.freqtrade_path,
            "user_data_dir": state.user_data_dir,
            "status": state.status,
            "current_stage": state.current_stage,
            "stages": [
                {"index": s.index, "name": s.name, "status": s.status,
                 "message": s.message, "data": s.data,
                 "started_at": s.started_at, "duration_s": s.duration_s}
                for s in state.stages
            ],
            "error": state.error,
            "created_at": state.created_at,
            "completed_at": state.completed_at,
            "report": state.report,
            "max_drawdown_threshold": state.max_drawdown_threshold,
            "min_win_rate": state.min_win_rate,
            "min_profit_factor": state.min_profit_factor,
            "min_sharpe": state.min_sharpe,
            "monte_carlo_threshold": state.monte_carlo_threshold,
            "hyperopt_loss": state.hyperopt_loss,
            "hyperopt_spaces": state.hyperopt_spaces,
            "hyperopt_epochs": state.hyperopt_epochs,
            "hyperopt_workers": state.hyperopt_workers,
            "min_oos_profit": state.min_oos_profit,
            "retry_count": state.retry_count,
            "max_retries": state.max_retries,
            "retry_history": state.retry_history,
            "generalization_failure": state.generalization_failure,
            "sensitivity": state.sensitivity,
            "wfo_enabled": state.wfo_enabled,
            "wfo_is_months": state.wfo_is_months,
            "wfo_oos_months": state.wfo_oos_months,
            "wfo_recency_weight": state.wfo_recency_weight,
            "wfo_windows": state.wfo_windows,
            "wfo_skip_reason": state.wfo_skip_reason,
            "ensemble_enabled": state.ensemble_enabled,
            "pair_universe": state.pair_universe,
            "winning_pairs": state.winning_pairs,
            "selected_pairs": state.selected_pairs,
            "excluded_time_windows": state.excluded_time_windows,
            "ai_enabled": state.ai_enabled,
            "ai_suggestions": state.ai_suggestions,
            "ai_interactions": state.ai_interactions,
            "ollama_available": state.ollama_available,
            "data_healing_warmup_candles": state.data_healing_warmup_candles,
            "data_healing_timeout": state.data_healing_timeout,
            "phase1_heal_attempts": state.phase1_heal_attempts,
            "stability_scores": state.stability_scores,
            "portfolio_weights": state.portfolio_weights,
            "baseline_trade_counts": state.baseline_trade_counts,
            "max_open_trades": state.max_open_trades,
            "strategy_source": state.strategy_source,
            "trading_style": state.trading_style,
            "risk_profile": state.risk_profile,
            "analysis_depth": state.analysis_depth,
            "uploaded_strategy_id": state.uploaded_strategy_id,
            "advanced_overrides": state.advanced_overrides,
            "auto_discovery_enabled": state.auto_discovery_enabled,
            "discovery_results": state.discovery_results,
            "validation_notes": state.validation_notes,
            "run_config_snapshot": state.run_config_snapshot,
            "policy_versions": state.policy_versions or get_policy_versions(),
            "selected_timeframe": state.selected_timeframe,
            "selected_pair_universe": state.selected_pair_universe,
            "score": state.score,
            "validation_status": state.validation_status,
            "readiness_label": state.readiness_label,
            "score_explanation": state.score_explanation,
            "progress_percent": state.progress_percent,
            "eta_seconds": state.eta_seconds,
            "progress_counters": state.progress_counters,
            "strategy_runtime_dir": state.strategy_runtime_dir,
            "strategy_variants": state.strategy_variants,
            "artifact_versions": state.artifact_versions,
            "user_approved_pairs": state.user_approved_pairs,
            "portfolio_baseline_result": state.portfolio_baseline_result,
        }
        state.artifact_versions.update(
            _write_versioned_json(run_dir, "state", payload, legacy_name="state.json")
        )
    except Exception:
        logger.exception("[%s] FAILED to write state.json — state will not survive restart.", state.run_id)


def load_runs_from_disk(user_data_dir: str) -> None:
    """Scan user_data/auto_quant/ and populate the in-memory registry.

    Two-pass strategy so every historical run surfaces in the Run History
    dashboard after a backend restart:

    Pass 1 — state.json files (authoritative, written by this pipeline on
              every state transition).  Provides the full picture including
              in-progress / failed / cancelled runs.

    Pass 2 — report.json files in any run directory that has NO state.json
              (legacy runs created before state persistence was introduced, or
              runs whose state.json was accidentally deleted).  Only completed
              runs produce a report.json so these are always marked
              "completed".

    Called once at app startup.  Running/pending runs found on disk are
    marked as 'failed' (their subprocess is gone and cannot be resumed).
    """
    base = Path(user_data_dir) / "auto_quant"
    if not base.exists():
        logger.info("load_runs_from_disk: base dir does not exist yet (%s)", base)
        return

    logger.info("load_runs_from_disk: scanning %s for persisted pipeline runs…", base)

    # ── Pass 1: state.json (preferred, full fidelity) ─────────────────────────
    for state_file in sorted(base.glob("*/state.json")):
        try:
            data = json.loads(state_file.read_text(encoding="utf-8"))
            run_id = data["run_id"]
            if run_id in _states:
                logger.debug("load_runs_from_disk: run %s already in memory, skipping.", run_id)
                continue

            stages = [
                StageState(
                    index=s["index"],
                    name=s["name"],
                    status=s["status"],
                    message=s.get("message", ""),
                    data=s.get("data", {}),
                    started_at=s.get("started_at"),
                    duration_s=s.get("duration_s"),
                )
                for s in data.get("stages", [])
            ]
            if not stages:
                stages = [StageState(index=i + 1, name=STAGE_NAMES[i]) for i in range(len(STAGE_NAMES))]

            status = data.get("status", "failed")
            if status in ("running", "pending"):
                status = "interrupted"

            state = PipelineState(
                run_id=run_id,
                strategy=data.get("strategy", ""),
                original_strategy=data.get("original_strategy"),
                original_strategy_hash=data.get("original_strategy_hash"),
                timeframe=data.get("timeframe", ""),
                in_sample_range=data.get("in_sample_range", ""),
                out_sample_range=data.get("out_sample_range", ""),
                exchange=data.get("exchange", ""),
                config_file=data.get("config_file", ""),
                freqtrade_path=data.get("freqtrade_path", ""),
                user_data_dir=data.get("user_data_dir", user_data_dir),
                status=status,
                current_stage=data.get("current_stage", 0),
                stages=stages,
                report=data.get("report"),
                error=data.get("error"),
                created_at=data.get("created_at", ""),
                completed_at=data.get("completed_at"),
                max_drawdown_threshold=data.get("max_drawdown_threshold", MAX_DRAWDOWN_THRESHOLD),
                min_win_rate=data.get("min_win_rate", MIN_WIN_RATE),
                min_profit_factor=data.get("min_profit_factor", MIN_PROFIT_FACTOR),
                min_sharpe=data.get("min_sharpe", MIN_SHARPE),
                monte_carlo_threshold=data.get("monte_carlo_threshold", MONTE_CARLO_THRESHOLD),
                hyperopt_loss=data.get("hyperopt_loss", "ProfitLockinHyperOptLoss"),
                hyperopt_spaces=data.get("hyperopt_spaces", ["stoploss", "roi"]),
                hyperopt_epochs=data.get("hyperopt_epochs", 100),
                hyperopt_workers=data.get("hyperopt_workers", 2),
                min_oos_profit=data.get("min_oos_profit", 0.0),
                retry_count=data.get("retry_count", 0),
                max_retries=data.get("max_retries", 3),
                retry_history=data.get("retry_history", []),
                generalization_failure=data.get("generalization_failure"),
                sensitivity=data.get("sensitivity"),
                wfo_enabled=data.get("wfo_enabled", False),
                wfo_is_months=data.get("wfo_is_months", 3),
                wfo_oos_months=data.get("wfo_oos_months", 1),
                wfo_recency_weight=data.get("wfo_recency_weight", 1.0),
                planned_wfo_windows=data.get("planned_wfo_windows", []),
                wfo_windows=data.get("wfo_windows", []),
                wfo_skip_reason=data.get("wfo_skip_reason"),
                ensemble_enabled=data.get("ensemble_enabled", False),
                pair_universe=data.get("pair_universe", BROAD_UNIVERSE_PAIRS),
                winning_pairs=data.get("winning_pairs", []),
                selected_pairs=data.get("selected_pairs", []),
                excluded_time_windows=data.get("excluded_time_windows", {}),
                ai_enabled=data.get("ai_enabled", True),
                ai_suggestions=data.get("ai_suggestions", {}),
                ai_interactions=data.get("ai_interactions", []),
                ollama_available=data.get("ollama_available", False),
                data_healing_warmup_candles=data.get("data_healing_warmup_candles", 200),
                data_healing_timeout=data.get("data_healing_timeout", 300),
                phase1_heal_attempts=data.get("phase1_heal_attempts", 0),
                stability_scores=data.get("stability_scores", {}),
                portfolio_weights=data.get("portfolio_weights", {}),
                baseline_trade_counts=data.get("baseline_trade_counts", {}),
                max_open_trades=data.get("max_open_trades", 5),
                strategy_source=data.get("strategy_source", "existing"),
                trading_style=data.get("trading_style", "swing"),
                risk_profile=data.get("risk_profile", "balanced"),
                analysis_depth=data.get("analysis_depth", "deep"),
                uploaded_strategy_id=data.get("uploaded_strategy_id"),
                advanced_overrides=data.get("advanced_overrides", {}),
                auto_discovery_enabled=data.get("auto_discovery_enabled", False),
                discovery_results=data.get("discovery_results", {}),
                validation_notes=data.get("validation_notes", []),
                run_config_snapshot=data.get("run_config_snapshot", {}),
                policy_versions=data.get("policy_versions", {}),
                selected_timeframe=data.get("selected_timeframe"),
                selected_pair_universe=data.get("selected_pair_universe", []),
                score=data.get("score", {}),
                validation_status=data.get("validation_status", "Candidate"),
                readiness_label=data.get("readiness_label", "Candidate"),
                score_explanation=data.get("score_explanation", []),
                progress_percent=data.get("progress_percent", 0),
                eta_seconds=data.get("eta_seconds"),
                progress_counters=data.get("progress_counters", {}),
                strategy_runtime_dir=data.get("strategy_runtime_dir"),
                strategy_variants=data.get("strategy_variants", []),
                artifact_versions=data.get("artifact_versions", {}),
                user_approved_pairs=data.get("user_approved_pairs", []),
                portfolio_baseline_result=data.get("portfolio_baseline_result", {}),
            )
            _states[run_id] = state
            _queues[run_id] = []
            _cancel_flags[run_id] = False
            _event_history.setdefault(run_id, deque(maxlen=_EVENT_HISTORY_MAX))
            logger.info("load_runs_from_disk: restored run %s  strategy=%s  status=%s",
                        run_id, state.strategy, state.status)
        except Exception:
            logger.exception("load_runs_from_disk: failed to load %s — skipping.", state_file)
            continue

    # ── Pass 2: report.json fallback for legacy / state-less run dirs ─────────
    for report_file in sorted(base.glob("*/report.json")):
        run_dir = report_file.parent
        if (run_dir / "state.json").exists():
            continue  # already handled in Pass 1
        try:
            data = json.loads(report_file.read_text(encoding="utf-8"))
            run_id = data.get("run_id", run_dir.name)
            if run_id in _states:
                logger.debug(
                    "load_runs_from_disk: run %s already in memory (report.json), skipping.",
                    run_id,
                )
                continue

            stages = [
                StageState(
                    index=s["index"],
                    name=s["name"],
                    status=s.get("status", "passed"),
                    message=s.get("message", ""),
                    data=s.get("data", {}),
                    started_at=s.get("started_at"),
                    duration_s=s.get("duration_s"),
                )
                for s in data.get("stages", [])
            ]
            if not stages:
                stages = [
                    StageState(index=i + 1, name=STAGE_NAMES[i], status="passed")
                    for i in range(len(STAGE_NAMES))
                ]

            state = PipelineState(
                run_id=run_id,
                strategy=data.get("strategy", ""),
                timeframe=data.get("timeframe", ""),
                in_sample_range=data.get("in_sample_range", ""),
                out_sample_range=data.get("out_sample_range", ""),
                exchange=data.get("exchange", ""),
                config_file="",
                freqtrade_path="",
                user_data_dir=user_data_dir,
                status="completed",
                current_stage=len(STAGE_NAMES),
                stages=stages,
                report=data,
                error=None,
                created_at=data.get("created_at", ""),
                completed_at=data.get("completed_at"),
            )
            _states[run_id] = state
            _queues[run_id] = []
            _cancel_flags[run_id] = False
            _event_history.setdefault(run_id, deque(maxlen=_EVENT_HISTORY_MAX))
            logger.info(
                "load_runs_from_disk: restored legacy run %s from report.json  strategy=%s",
                run_id, state.strategy,
            )
        except Exception:
            logger.exception(
                "load_runs_from_disk: failed to load report.json from %s — skipping.", run_dir,
            )
            continue


# ── Public helpers ─────────────────────────────────────────────────────────────

def create_run(
    *,
    strategy: str,
    timeframe: str,
    in_sample_range: str,
    out_sample_range: str,
    exchange: str,
    config_file: str,
    freqtrade_path: str,
    user_data_dir: str,
    max_drawdown_threshold: float = MAX_DRAWDOWN_THRESHOLD,  # 0.30 = 30%
    min_win_rate: float = MIN_WIN_RATE,  # 0.40 = 40%
    min_profit_factor: float = MIN_PROFIT_FACTOR,
    min_sharpe: float = MIN_SHARPE,
    monte_carlo_threshold: float = MONTE_CARLO_THRESHOLD,
    hyperopt_loss: str = "ProfitLockinHyperOptLoss",
    hyperopt_spaces: list | None = None,
    hyperopt_epochs: int = 100,
    hyperopt_workers: int = 2,
    min_oos_profit: float = 0.0,
    wfo_enabled: bool = False,
    wfo_is_months: int = 3,
    wfo_oos_months: int = 1,
    wfo_recency_weight: float = 1.0,
    planned_wfo_windows: list | None = None,
    ensemble_enabled: bool = False,
    pair: str | None = None,
    pair_universe: list | None = None,
    ai_enabled: bool = True,
    data_healing_warmup_candles: int = 200,
    data_healing_timeout: int = 300,
    strategy_source: str = "existing",
    trading_style: str = "swing",
    risk_profile: str = "balanced",
    analysis_depth: str = "deep",
    uploaded_strategy_id: str | None = None,
    advanced_overrides: dict | None = None,
    auto_discovery_enabled: bool = False,
    discovery_results: dict | None = None,
    validation_notes: list | None = None,
    run_config_snapshot: dict | None = None,
    policy_versions: dict | None = None,
    selected_timeframe: str | None = None,
    selected_pair_universe: list | None = None,
) -> str:
    import uuid
    run_id = str(uuid.uuid4())
    stages = [StageState(index=i + 1, name=STAGE_NAMES[i]) for i in range(len(STAGE_NAMES))]
    state = PipelineState(
        run_id=run_id,
        strategy=strategy,
        timeframe=timeframe,
        in_sample_range=in_sample_range,
        out_sample_range=out_sample_range,
        exchange=exchange,
        config_file=config_file,
        freqtrade_path=freqtrade_path,
        user_data_dir=user_data_dir,
        stages=stages,
        created_at=_now(),
        max_drawdown_threshold=normalize_decimal(max_drawdown_threshold, MAX_DRAWDOWN_THRESHOLD),
        min_win_rate=normalize_decimal(min_win_rate, MIN_WIN_RATE),
        min_profit_factor=min_profit_factor,
        min_sharpe=min_sharpe,
        monte_carlo_threshold=normalize_decimal(monte_carlo_threshold, MONTE_CARLO_THRESHOLD),
        hyperopt_loss=hyperopt_loss,
        hyperopt_spaces=hyperopt_spaces if hyperopt_spaces is not None else ["stoploss", "roi"],
        hyperopt_epochs=hyperopt_epochs,
        hyperopt_workers=hyperopt_workers,
        min_oos_profit=normalize_decimal(min_oos_profit, MIN_OOS_PROFIT),
        wfo_enabled=wfo_enabled,
        wfo_is_months=wfo_is_months,
        wfo_oos_months=wfo_oos_months,
        wfo_recency_weight=wfo_recency_weight,
        planned_wfo_windows=planned_wfo_windows if planned_wfo_windows is not None else [],
        ensemble_enabled=ensemble_enabled,
        pair=pair or None,
        pair_universe=pair_universe if pair_universe is not None else BROAD_UNIVERSE_PAIRS,
        ai_enabled=ai_enabled,
        data_healing_warmup_candles=data_healing_warmup_candles,
        data_healing_timeout=data_healing_timeout,
        phase1_heal_attempts=0,
        strategy_source=strategy_source,
        trading_style=trading_style,
        risk_profile=risk_profile,
        analysis_depth=analysis_depth,
        uploaded_strategy_id=uploaded_strategy_id,
        advanced_overrides=advanced_overrides or {},
        auto_discovery_enabled=auto_discovery_enabled,
        discovery_results=discovery_results or {},
        validation_notes=validation_notes or [],
        run_config_snapshot=run_config_snapshot or {},
        policy_versions=policy_versions or get_policy_versions(),
        selected_timeframe=selected_timeframe or timeframe,
        selected_pair_universe=selected_pair_universe or (pair_universe if pair_universe is not None else BROAD_UNIVERSE_PAIRS),
    )
    _states[run_id] = state
    _queues[run_id] = []
    _cancel_flags[run_id] = False
    _event_history[run_id] = deque(maxlen=_EVENT_HISTORY_MAX)
    logger.info(
        "create_run: new run %s | strategy=%s | tf=%s | IS=%s | OOS=%s | exchange=%s | config=%s",
        run_id, strategy, timeframe, in_sample_range, out_sample_range, exchange, config_file,
    )
    if state.run_config_snapshot:
        state.artifact_versions.update(
            _write_versioned_json(
                _run_dir(state),
                "run_config_snapshot",
                state.run_config_snapshot,
                legacy_name="run_config_snapshot.json",
            )
        )
    _save_state_to_disk(state)
    return run_id


def get_state(run_id: str) -> PipelineState | None:
    return _states.get(run_id)


def get_queue(run_id: str) -> asyncio.Queue:
    """Subscribe to a pipeline's event stream. Returns a dedicated Queue."""
    q: asyncio.Queue = asyncio.Queue(maxsize=2000)
    _queues.setdefault(run_id, []).append(q)
    return q


def release_queue(run_id: str, q: asyncio.Queue) -> None:
    try:
        _queues[run_id].remove(q)
    except (KeyError, ValueError):
        pass


def request_cancel(run_id: str) -> bool:
    if run_id not in _states:
        return False
    _cancel_flags[run_id] = True
    return True


def list_runs() -> list[dict]:
    result = []
    for state in _states.values():
        result.append(_state_snapshot(state))
    return result


def _state_snapshot(state: PipelineState) -> dict:
    total_stages = max(1, len(state.stages))
    progress = state.progress_percent
    if not progress and state.current_stage:
        progress = int(state.current_stage / total_stages * 100)
    return {
        "run_id": state.run_id,
        "strategy": state.strategy,
        "original_strategy": state.original_strategy,
        "original_strategy_hash": state.original_strategy_hash,
        "timeframe": state.timeframe,
        "selected_timeframe": state.selected_timeframe or state.timeframe,
        "in_sample_range": state.in_sample_range,
        "out_sample_range": state.out_sample_range,
        "exchange": state.exchange,
        "status": state.status,
        "current_stage": state.current_stage,
        "total_stages": total_stages,
        "progress": progress,
        "progress_percent": progress,
        "eta_seconds": state.eta_seconds,
        "progress_counters": state.progress_counters,
        "stages": [
            {"index": s.index, "name": s.name, "status": s.status,
             "message": s.message, "data": s.data,
             "started_at": s.started_at, "duration_s": s.duration_s}
            for s in state.stages
        ],
        "error": state.error,
        "created_at": state.created_at,
        "completed_at": state.completed_at,
        "report": state.report,
        "hyperopt_loss": state.hyperopt_loss,
        "hyperopt_spaces": state.hyperopt_spaces,
        "hyperopt_epochs": state.hyperopt_epochs,
        "thresholds": {
            "max_drawdown": state.max_drawdown_threshold,
            "min_win_rate": state.min_win_rate,
            "min_profit_factor": state.min_profit_factor,
            "min_sharpe": state.min_sharpe,
            "min_oos_profit": state.min_oos_profit,
            "monte_carlo_threshold": state.monte_carlo_threshold,
        },
        "thresholds_display": {
            "max_drawdown": round(state.max_drawdown_threshold * 100, 4),
            "min_win_rate": round(state.min_win_rate * 100, 4),
            "min_profit_factor": state.min_profit_factor,
            "min_sharpe": state.min_sharpe,
            "min_oos_profit": state.min_oos_profit,
            "monte_carlo_threshold": state.monte_carlo_threshold,
        },
        "config": {
            "strategy": state.strategy,
            "original_strategy": state.original_strategy,
            "timeframe": state.timeframe,
            "selected_timeframe": state.selected_timeframe or state.timeframe,
            "in_sample_range": state.in_sample_range,
            "out_sample_range": state.out_sample_range,
            "exchange": state.exchange,
            "strategy_source": state.strategy_source,
            "trading_style": state.trading_style,
            "risk_profile": state.risk_profile,
            "analysis_depth": state.analysis_depth,
            "hyperopt_loss": state.hyperopt_loss,
            "hyperopt_spaces": state.hyperopt_spaces,
            "hyperopt_epochs": state.hyperopt_epochs,
            "wfo_enabled": state.wfo_enabled,
            "wfo_is_months": state.wfo_is_months,
            "wfo_oos_months": state.wfo_oos_months,
            "wfo_recency_weight": state.wfo_recency_weight,
            "ensemble_enabled": state.ensemble_enabled,
            "pair_universe": state.pair_universe,
            "selected_pair_universe": state.selected_pair_universe,
            "thresholds": {
                "max_drawdown": state.max_drawdown_threshold,
                "min_win_rate": state.min_win_rate,
                "min_profit_factor": state.min_profit_factor,
                "min_sharpe": state.min_sharpe,
                "min_oos_profit": state.min_oos_profit,
                "monte_carlo_threshold": state.monte_carlo_threshold,
            },
        },
        "wfo_enabled": state.wfo_enabled,
        "wfo_is_months": state.wfo_is_months,
        "wfo_oos_months": state.wfo_oos_months,
        "wfo_recency_weight": state.wfo_recency_weight,
        "wfo_windows": state.wfo_windows,
        "ensemble_enabled": state.ensemble_enabled,
        "winning_pairs": state.winning_pairs,
        "selected_pairs": state.selected_pairs,
        "user_approved_pairs": state.user_approved_pairs,
        "portfolio_baseline_result": state.portfolio_baseline_result,
        "retry_history": state.retry_history,
        "generalization_failure": state.generalization_failure,
        "sensitivity": state.sensitivity,
        "ai_enabled": state.ai_enabled,
        "ai_suggestions": state.ai_suggestions,
        "ai_interactions": state.ai_interactions,
        "ollama_available": state.ollama_available,
        "data_healing_warmup_candles": state.data_healing_warmup_candles,
        "data_healing_timeout": state.data_healing_timeout,
        "portfolio_weights": state.portfolio_weights,
        "baseline_trade_counts": state.baseline_trade_counts,
        "max_open_trades": state.max_open_trades,
        "strategy_source": state.strategy_source,
        "trading_style": state.trading_style,
        "risk_profile": state.risk_profile,
        "analysis_depth": state.analysis_depth,
        "uploaded_strategy_id": state.uploaded_strategy_id,
        "advanced_overrides": state.advanced_overrides,
        "auto_discovery_enabled": state.auto_discovery_enabled,
        "discovery_results": state.discovery_results,
        "validation_notes": state.validation_notes,
        "run_config_snapshot": state.run_config_snapshot,
        "policy_versions": state.policy_versions,
        "selected_pair_universe": state.selected_pair_universe,
        "score": state.score,
        "validation_status": state.validation_status,
        "readiness_label": state.readiness_label,
        "score_explanation": state.score_explanation,
        "strategy_runtime_dir": state.strategy_runtime_dir,
        "strategy_variants": state.strategy_variants,
        "artifact_versions": state.artifact_versions,
    }


def _cancelled(run_id: str) -> bool:
    return _cancel_flags.get(run_id, False)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class _Cancelled(Exception):
    pass
