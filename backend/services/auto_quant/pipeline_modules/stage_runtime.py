"""Structured runtime state helpers for AutoQuant pipeline stages.

This module keeps the legacy stage contract intact (`status`, `message`, `data`)
while adding a stable UI-facing envelope inside every stage payload. The frontend
can render rich workflow step cards from these fields without reverse-engineering
raw Freqtrade output or interpreting Python exceptions as validation crashes.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .logging import get_queues, logger
from .state import PipelineState, StageState, _now, record_event

_STAGE_SCHEMA_VERSION = "stage_payload_v1"


_STAGE_INPUT_KEYS: dict[int, tuple[str, ...]] = {
    1: (
        "strategy",
        "strategy_source",
        "timeframe",
        "in_sample_range",
        "pair_universe_count",
        "trading_style",
        "risk_profile",
    ),
    2: ("strategy", "selected_pairs_count", "max_open_trades", "config_file"),
    3: (
        "strategy",
        "selected_pairs_count",
        "hyperopt_loss",
        "hyperopt_spaces",
        "hyperopt_epochs",
        "wfo_enabled",
    ),
    4: (
        "strategy",
        "optimized_strategy",
        "out_sample_range",
        "selected_pairs_count",
        "thresholds",
    ),
    5: ("optimized_strategy", "selected_pairs_count", "max_open_trades"),
    6: ("optimized_strategy", "artifact_versions"),
}

_METRIC_KEYS = (
    "profit_total",
    "profit_total_abs",
    "profit_mean_pct",
    "max_drawdown_account",
    "total_trades",
    "wins",
    "losses",
    "draws",
    "win_rate",
    "win_rate_pct",
    "profit_factor",
    "sharpe_ratio",
    "calmar_ratio",
    "sortino_ratio",
    "baseline_attempts",
    "weighted_profit",
    "portfolio_profit",
    "score",
)


# ── Public stage lifecycle helpers ─────────────────────────────────────────────


def _start_stage(run_id: str, state: PipelineState, stage_idx: int) -> None:
    """Mark a stage as running and persist a structured stage envelope."""
    state.current_stage = stage_idx
    total_stages = len(state.stages)
    state.progress_percent = int((stage_idx - 1) / total_stages * 100) if total_stages else 0
    s = state.stages[stage_idx - 1]
    s.status = "running"
    s.message = ""
    s.started_at = _now()
    s.duration_s = None
    s.data = build_stage_payload(
        state,
        s,
        status="running",
        message="",
        raw_data={},
    )
    logger.info("[%s] ▶ STAGE %d/%d STARTED: %s", run_id, stage_idx, total_stages, s.name)
    from .state import _save_state_to_disk

    _save_state_to_disk(state)
    _emit(run_id, stage_idx, "running", "", -1, s.data, started_at=s.started_at)



def _pass_stage(
    run_id: str,
    state: PipelineState,
    stage_idx: int,
    message: str,
    data: dict | None = None,
) -> None:
    """Mark a stage as passed while preserving raw result fields."""
    s = state.stages[stage_idx - 1]
    s.status = "passed"
    s.message = message
    if s.started_at:
        try:
            started = datetime.fromisoformat(s.started_at)
            s.duration_s = round((datetime.now(timezone.utc) - started).total_seconds(), 1)
        except Exception:
            s.duration_s = None
    s.data = build_stage_payload(
        state,
        s,
        status="passed",
        message=message,
        raw_data=data or {},
    )
    total_stages = len(state.stages)
    progress = int(stage_idx / total_stages * 100) if total_stages else 100
    state.progress_percent = progress
    logger.info(
        "[%s] ✔ STAGE %d/%d PASSED: %s  progress=%d%%",
        run_id,
        stage_idx,
        total_stages,
        s.name,
        progress,
    )
    from .state import _save_state_to_disk

    _save_state_to_disk(state)
    _emit(run_id, stage_idx, "passed", message, progress, s.data, duration_s=s.duration_s)


def is_validate_existing(state: PipelineState) -> bool:
    return getattr(state, "workflow_mode", "auto_quant") == "validate_existing"


def ensure_validation_attempt(
    state: PipelineState,
    *,
    reason: str = "initial",
    trigger: str | None = None,
) -> dict[str, Any] | None:
    """Ensure one user-facing validation attempt exists for the current retry.

    Internal stage retries (data healing, baseline mutations, WFO windows, or
    hyperopt subprocess retries) do not call this. For validate-existing runs,
    attempt N is the initial full validation pass plus each approved AI retry.
    """
    if not is_validate_existing(state):
        return None
    attempt_number = min(
        max(1, int(getattr(state, "retry_count", 0) or 0) + 1),
        max(1, int(getattr(state, "max_attempts", 3) or 3)),
    )
    attempts = list(getattr(state, "validation_attempts", []) or [])
    existing = next((item for item in attempts if item.get("attempt") == attempt_number), None)
    if existing is None:
        existing = {
            "attempt": attempt_number,
            "kind": "full_validation",
            "status": "running",
            "reason": reason,
            "trigger": trigger or reason,
            "retry_count_at_start": int(getattr(state, "retry_count", 0) or 0),
            "started_at": _now(),
            "notes": [],
        }
        attempts.append(existing)
        state.validation_attempts = attempts
    elif existing.get("status") in {"pending", "awaiting_retry"}:
        existing["status"] = "running"
        existing.setdefault("started_at", _now())
    return existing


def update_validation_attempt(
    state: PipelineState,
    *,
    status: str,
    stage_idx: int | None = None,
    reason: str | None = None,
    metrics: dict[str, Any] | None = None,
    ai_suggestion_id: str | None = None,
) -> None:
    if not is_validate_existing(state):
        return
    attempt = ensure_validation_attempt(state)
    if attempt is None:
        return
    attempt["status"] = status
    if stage_idx is not None:
        attempt["stage"] = stage_idx
        if 0 < stage_idx <= len(state.stages):
            attempt["stage_name"] = state.stages[stage_idx - 1].name
    if reason:
        attempt["reason"] = reason
    if metrics:
        attempt["metrics"] = metrics
        _record_best_observed(state, metrics, attempt.get("attempt"))
    if ai_suggestion_id:
        attempt["ai_suggestion_id"] = ai_suggestion_id
    if status in {"failed", "rejected", "passed"}:
        attempt["completed_at"] = _now()


def finalize_rejection_report(
    state: PipelineState,
    *,
    stage_idx: int,
    message: str,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the validate-existing rejection report used by state and report.json."""
    raw = dict(data or {})
    failed_stages = [
        {
            "index": stage.index,
            "name": stage.name,
            "message": stage.message,
            "data": stage.data,
        }
        for stage in state.stages
        if stage.status == "failed"
    ]
    if not failed_stages and 0 < stage_idx <= len(state.stages):
        stage = state.stages[stage_idx - 1]
        failed_stages.append(
            {"index": stage.index, "name": stage.name, "message": message, "data": raw}
        )

    suggestions = list(getattr(state, "ai_suggestions", []) or [])
    approved = [item for item in suggestions if item.get("status") == "approved"]
    rejected = [item for item in suggestions if item.get("status") == "rejected"]

    update_validation_attempt(
        state,
        status="rejected",
        stage_idx=stage_idx,
        reason=message,
        metrics=_metrics_from(raw),
    )

    report = {
        "schema_version": "validate_existing_rejection_v1",
        "final_verdict": "rejected",
        "candidate_label": "Rejected",
        "reason": message,
        "failed_stages": failed_stages,
        "repairs_attempted": {
            "validation_attempts": getattr(state, "validation_attempts", []),
            "internal_baseline_heal_attempts": getattr(state, "phase1_heal_attempts", 0),
            "approved_retry_history": getattr(state, "retry_history", []),
            "strategy_variants": getattr(state, "strategy_variants", []),
        },
        "ai_suggestions": {
            "approved": approved,
            "rejected": rejected,
            "pending": [item for item in suggestions if item.get("status") == "pending"],
        },
        "best_observed_result": getattr(state, "best_observed_result", {}) or {},
        "recommended_next_experiment": _recommended_next_experiment(state, message, raw),
    }
    state.final_verdict = "rejected"
    state.candidate_label = "Rejected"
    state.validation_status = "Rejected"
    state.readiness_label = "Rejected"
    state.rejection_report = report
    state.report = {
        "run_id": state.run_id,
        "strategy": state.strategy,
        "original_strategy": state.original_strategy,
        "original_strategy_hash": state.original_strategy_hash,
        "workflow_mode": state.workflow_mode,
        "status": "rejected",
        "validation_status": state.validation_status,
        "readiness_label": state.readiness_label,
        "final_verdict": state.final_verdict,
        "candidate_label": state.candidate_label,
        "created_at": state.created_at,
        "completed_at": _now(),
        "stages": [
            {"index": s.index, "name": s.name, "status": s.status, "message": s.message, "data": s.data}
            for s in state.stages
        ],
        "thresholds": {
            "max_drawdown": state.max_drawdown_threshold,
            "min_win_rate": state.min_win_rate,
            "min_profit_factor": state.min_profit_factor,
            "min_sharpe": state.min_sharpe,
            "min_oos_profit": state.min_oos_profit,
            "monte_carlo_threshold": state.monte_carlo_threshold,
        },
        "validation_attempts": state.validation_attempts,
        "retry_history": state.retry_history,
        "ai_assistance": {
            "suggestions": suggestions,
            "pending_ai_suggestion_id": getattr(state, "pending_ai_suggestion_id", None),
        },
        "rejection_report": report,
        "best_observed_result": state.best_observed_result,
        "strategy_variants": state.strategy_variants,
        "artifact_versions": state.artifact_versions,
    }
    try:
        from .state import _write_versioned_json

        run_dir = Path(state.user_data_dir) / "auto_quant" / state.run_id
        state.artifact_versions.update(
            _write_versioned_json(run_dir, "report", state.report, legacy_name="report.json")
        )
        state.report["artifact_versions"] = state.artifact_versions
        _write_versioned_json(run_dir, "report", state.report, legacy_name="report.json")
    except Exception:
        logger.exception("[%s] Failed to write validate-existing rejection report.", state.run_id)
    return report


def _record_best_observed(state: PipelineState, metrics: dict[str, Any], attempt_number: int | None) -> None:
    if not metrics:
        return
    current = getattr(state, "best_observed_result", {}) or {}
    current_score = _best_observed_sort_key(current.get("metrics", {}))
    candidate_score = _best_observed_sort_key(metrics)
    if not current or candidate_score > current_score:
        state.best_observed_result = {
            "attempt": attempt_number,
            "metrics": metrics,
            "recorded_at": _now(),
        }


def _best_observed_sort_key(metrics: dict[str, Any]) -> tuple[float, float, float]:
    profit = _first_number(metrics, "profit_total", "profit_total_abs", "portfolio_profit", "oos_profit")
    profit_factor = _first_number(metrics, "profit_factor")
    drawdown = _first_number(metrics, "max_drawdown_account", "drawdown", "failed_drawdown")
    return (
        profit if profit is not None else -999999.0,
        profit_factor if profit_factor is not None else 0.0,
        -(drawdown if drawdown is not None else 999999.0),
    )


def _first_number(metrics: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        if key not in metrics:
            continue
        try:
            return float(metrics[key])
        except (TypeError, ValueError):
            continue
    return None


def _recommended_next_experiment(state: PipelineState, message: str, raw: dict[str, Any]) -> str:
    text = f"{message} {raw.get('_failed_metrics', '')}".lower()
    if "pair" in text:
        return "Try a different pair universe or run pair screening before another validation attempt."
    if "drawdown" in text:
        return "Try a more conservative risk profile, drawdown-aware loss function, or wider timeframe."
    if "profit" in text or "expectancy" in text:
        return "Try a different timeframe, pair universe, or base strategy logic before increasing optimization budget."
    if "sharp peak" in text or "sensitivity" in text:
        return "Enable or widen WFO and reduce parameter search aggressiveness before retrying."
    return "Start a new validation run with different strategy, timeframe, risk profile, or pair universe."



def _fail_stage(
    run_id: str,
    state: PipelineState,
    stage_idx: int,
    message: str,
    data: dict | None = None,
    *,
    controlled: bool = True,
    code: str | None = None,
    suggestions: list[str] | None = None,
) -> None:
    """Mark a stage as failed using a clean structured error object.

    `controlled=True` means the pipeline reached a validation decision or a
    known execution failure. Unexpected Python exceptions are represented as
    system errors by `derive_error_object` when no controlled stage error exists.
    """
    s = state.stages[stage_idx - 1]
    s.status = "failed"
    s.message = message
    if s.started_at:
        try:
            started = datetime.fromisoformat(s.started_at)
            s.duration_s = round((datetime.now(timezone.utc) - started).total_seconds(), 1)
        except Exception:
            s.duration_s = None

    raw_data = dict(data or {})
    error_object = make_error_object(
        stage_idx,
        s.name,
        message,
        kind="controlled_validation" if controlled else "system_error",
        code=code,
        recoverable=controlled,
        suggestions=suggestions,
        details=_error_details_from_data(raw_data),
    )
    raw_data.setdefault("errors", [])
    if isinstance(raw_data["errors"], list):
        raw_data["errors"].append(error_object)
    else:
        raw_data["errors"] = [error_object]
    raw_data["failure_type"] = error_object["kind"]
    raw_data["controlled_failure"] = controlled

    s.data = build_stage_payload(
        state,
        s,
        status="failed",
        message=message,
        raw_data=raw_data,
        error_object=error_object,
    )
    state.status = "failed"
    state.error = message
    if controlled:
        state.validation_status = "Rejected"
        state.readiness_label = "Rejected"
    if controlled and is_validate_existing(state):
        finalize_rejection_report(state, stage_idx=stage_idx, message=message, data=raw_data)
    state.completed_at = _now()
    total_stages = len(state.stages)
    state.progress_percent = int((stage_idx - 1) / total_stages * 100) if total_stages else 0
    logger.error(
        "[%s] ✘ STAGE %d/%d FAILED: %s | kind=%s | error=%r",
        run_id,
        stage_idx,
        total_stages,
        s.name,
        error_object["kind"],
        message,
    )
    from .state import _save_state_to_disk

    _save_state_to_disk(state)
    _emit(run_id, stage_idx, "failed", message, -1, s.data, duration_s=s.duration_s)



def _emit(
    run_id: str,
    stage: int,
    status: str,
    message: str,
    progress: int,
    data: dict | None = None,
    msg_type: str | None = None,
    started_at: str | None = None,
    duration_s: float | None = None,
) -> None:
    """Emit a WebSocket event with a small UI delta alongside legacy fields."""
    event_data = data or {}
    payload: dict[str, Any] = {
        "stage": stage,
        "status": status,
        "message": message,
        "progress": progress,
        "data": event_data,
        "ts": _now(),
    }
    if msg_type is not None:
        payload["type"] = msg_type
    if started_at is not None:
        payload["started_at"] = started_at
    if duration_s is not None:
        payload["duration_s"] = duration_s
    if stage >= 1:
        payload["ui"] = {
            "stage_progress": event_data.get("stage_progress", {"percent": _event_stage_percent(status)}),
            "errors": event_data.get("errors", []),
            "warnings": event_data.get("warnings", []),
            "suggestions": event_data.get("suggestions", []),
        }
    record_event(run_id, {"run_id": run_id, **payload})
    for q in list(get_queues().get(run_id, [])):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass
        except Exception:
            pass


# ── API-facing normalization ──────────────────────────────────────────────────


def build_stage_cards(state: PipelineState) -> list[dict[str, Any]]:
    """Return UI-ready cards for all pipeline stages."""
    return [build_stage_card(state, stage) for stage in state.stages]



def build_workflow_summary(state: PipelineState) -> dict[str, Any]:
    """Return a compact workflow summary for status responses."""
    total = max(1, len(state.stages))
    completed = sum(1 for s in state.stages if s.status == "passed")
    failed = sum(1 for s in state.stages if s.status == "failed")
    running = next((s for s in state.stages if s.status == "running"), None)
    return {
        "schema_version": "workflow_summary_v1",
        "status": state.status,
        "validation_status": state.validation_status,
        "readiness_label": state.readiness_label,
        "current_stage": state.current_stage,
        "total_stages": total,
        "completed_stages": completed,
        "failed_stages": failed,
        "running_stage": running.index if running else None,
        "progress_percent": state.progress_percent,
        "retry_count": state.retry_count,
        "max_retries": state.max_retries,
        "has_controlled_failure": bool(derive_error_object(state, prefer_controlled=True)),
    }



def derive_error_object(
    state: PipelineState,
    *,
    prefer_controlled: bool = False,
) -> dict[str, Any] | None:
    """Derive a top-level clean error object from the failed stage or state error."""
    failed_stage = next((s for s in state.stages if s.status == "failed"), None)
    if failed_stage is not None:
        data = failed_stage.data if isinstance(failed_stage.data, dict) else {}
        errors = data.get("errors") or []
        if errors and isinstance(errors, list) and isinstance(errors[0], dict):
            return errors[0]
        kind = "controlled_validation" if prefer_controlled else "stage_failure"
        return make_error_object(
            failed_stage.index,
            failed_stage.name,
            failed_stage.message or state.error or "Stage failed.",
            kind=kind,
            recoverable=True,
        )
    if state.status == "failed" and state.error:
        stage_idx = state.current_stage or 0
        stage_name = state.stages[stage_idx - 1].name if 0 < stage_idx <= len(state.stages) else "Pipeline"
        return make_error_object(
            stage_idx,
            stage_name,
            str(state.error),
            kind="system_error",
            recoverable=False,
            suggestions=[
                "Check backend logs for the traceback.",
                "Retry the run after fixing the system error.",
            ],
        )
    return None



def build_stage_card(state: PipelineState, stage: StageState) -> dict[str, Any]:
    """Normalize a StageState into a stable card shape for the frontend."""
    raw_data = stage.data if isinstance(stage.data, dict) else {}
    status = stage.status
    message = stage.message
    synthetic_stage = StageState(
        index=stage.index,
        name=stage.name,
        status=status,
        message=message,
        data=raw_data,
        started_at=stage.started_at,
        duration_s=stage.duration_s,
    )
    payload = build_stage_payload(
        state,
        synthetic_stage,
        status=status,
        message=message,
        raw_data=raw_data,
    )
    return {
        "index": stage.index,
        "name": stage.name,
        "status": status,
        "message": message,
        "started_at": stage.started_at,
        "duration_s": stage.duration_s,
        "input_summary": payload["input_summary"],
        "output_summary": payload["output_summary"],
        "metrics": payload["metrics"],
        "warnings": payload["warnings"],
        "errors": payload["errors"],
        "retry_attempts": payload["retry_attempts"],
        "suggestions": payload["suggestions"],
        "auto_fix": payload["auto_fix"],
        "stage_progress": payload["stage_progress"],
        "status_kind": payload["status_kind"],
        "raw_data": _strip_ui_keys(raw_data),
    }



def build_stage_payload(
    state: PipelineState,
    stage: StageState,
    *,
    status: str,
    message: str,
    raw_data: dict[str, Any] | None = None,
    error_object: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge legacy raw data with required UI-facing stage fields."""
    raw = dict(raw_data or {})
    existing_errors = raw.get("errors") if isinstance(raw.get("errors"), list) else []
    errors = [e for e in existing_errors if isinstance(e, dict)]
    if error_object and error_object not in errors:
        errors.append(error_object)

    warnings = _coerce_string_list(raw.get("warnings")) + _derive_warnings(raw)
    suggestions = _coerce_string_list(raw.get("suggestions")) + _suggestions_for(
        stage.index,
        message,
        raw,
        errors,
        state,
    )

    payload = raw
    payload.update(
        {
            "schema_version": _STAGE_SCHEMA_VERSION,
            "status_kind": _status_kind(status, errors),
            "input_summary": raw.get("input_summary") or _input_summary_for(state, stage.index, raw),
            "output_summary": raw.get("output_summary") or _output_summary_for(stage.index, raw),
            "metrics": raw.get("metrics") or _metrics_from(raw),
            "warnings": _dedupe(warnings),
            "errors": errors,
            "retry_attempts": raw.get("retry_attempts") or _retry_attempts_for(state, stage.index, raw),
            "suggestions": _dedupe(suggestions),
            "auto_fix": raw.get("auto_fix") or _auto_fix_for(state, stage.index, raw),
            "stage_progress": raw.get("stage_progress")
            or _stage_progress_for(state, stage.index, status),
        }
    )
    return payload


# ── Error and summary helpers ─────────────────────────────────────────────────


def make_error_object(
    stage_idx: int,
    stage_name: str,
    message: str,
    *,
    kind: str,
    code: str | None = None,
    severity: str = "error",
    recoverable: bool = True,
    suggestions: list[str] | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a clean machine-readable error object."""
    return {
        "schema_version": "auto_quant_error_v1",
        "code": code or _slug_code(message),
        "kind": kind,
        "severity": severity,
        "controlled": kind != "system_error",
        "recoverable": recoverable,
        "message": message,
        "stage": {"index": stage_idx, "name": stage_name},
        "details": details or {},
        "suggestions": _dedupe(suggestions or _suggestions_for(stage_idx, message, {}, [], None)),
        "ts": _now(),
    }



def _input_summary_for(state: PipelineState, stage_idx: int, raw: dict[str, Any]) -> dict[str, Any]:
    pair_universe = state.selected_pair_universe or state.pair_universe or []
    selected_pairs = state.selected_pairs or []
    optimized_strategy = raw.get("optimized_strategy") or raw.get("optimized_strategy_name")
    optimized_file = raw.get("optimized_file") or raw.get("optimized_path")
    if not optimized_strategy and optimized_file:
        optimized_strategy = str(optimized_file).rsplit("/", 1)[-1].replace(".py", "")

    base: dict[str, Any] = {
        "strategy": state.strategy,
        "strategy_source": state.strategy_source,
        "timeframe": state.selected_timeframe or state.timeframe,
        "in_sample_range": state.in_sample_range,
        "out_sample_range": state.out_sample_range,
        "pair_universe_count": len(pair_universe),
        "selected_pairs_count": len(selected_pairs),
        "selected_pairs": [p.get("key", p) if isinstance(p, dict) else p for p in selected_pairs][:12],
        "trading_style": state.trading_style,
        "risk_profile": state.risk_profile,
        "analysis_depth": state.analysis_depth,
        "config_file": state.config_file,
        "hyperopt_loss": state.hyperopt_loss,
        "hyperopt_spaces": list(state.hyperopt_spaces),
        "hyperopt_epochs": state.hyperopt_epochs,
        "wfo_enabled": state.wfo_enabled,
        "max_open_trades": state.max_open_trades,
        "optimized_strategy": optimized_strategy,
        "artifact_versions": state.artifact_versions,
        "thresholds": {
            "max_drawdown": state.max_drawdown_threshold,
            "min_win_rate": state.min_win_rate,
            "min_profit_factor": state.min_profit_factor,
            "min_sharpe": state.min_sharpe,
            "min_oos_profit": state.min_oos_profit,
            "monte_carlo_threshold": state.monte_carlo_threshold,
        },
    }
    keys = _STAGE_INPUT_KEYS.get(stage_idx, tuple(base.keys()))
    return {key: base.get(key) for key in keys if key in base}



def _output_summary_for(stage_idx: int, raw: dict[str, Any]) -> dict[str, Any]:
    if not raw:
        return {}
    per_pair = raw.get("per_pair") or raw.get("all_pairs") or []
    passing = raw.get("passing_pairs") or raw.get("winning_pairs") or []
    filtered = raw.get("filtered_pairs") or raw.get("failing_pairs") or []
    artifacts = {
        key: value
        for key, value in raw.items()
        if key.endswith("_file") or key.endswith("_path") or key in {"report", "export_zip"}
    }
    summary = {
        "pairs_tested": len(per_pair) if isinstance(per_pair, list) else None,
        "pairs_passed": len(passing) if isinstance(passing, list) else None,
        "pairs_filtered": len(filtered) if isinstance(filtered, list) else None,
        "baseline_attempts": raw.get("baseline_attempts"),
        "selected_pairs": raw.get("selected_pairs") or raw.get("passing_pairs") or raw.get("winning_pairs"),
        "artifacts": artifacts,
    }
    if raw.get("_failed_metrics"):
        summary["failed_metrics"] = raw["_failed_metrics"]
    if raw.get("validation_notes"):
        summary["validation_notes"] = raw["validation_notes"]
    return {key: value for key, value in summary.items() if value not in (None, {}, [])}



def _metrics_from(raw: dict[str, Any]) -> dict[str, Any]:
    metrics = {key: raw[key] for key in _METRIC_KEYS if key in raw}
    failed_metrics = raw.get("_failed_metrics")
    if isinstance(failed_metrics, dict):
        metrics.update({f"failed_{k}": v for k, v in failed_metrics.items()})
    sensitivity = raw.get("sensitivity")
    if isinstance(sensitivity, dict):
        for key in ("score", "p_best", "p_minus", "p_plus", "passed"):
            if key in sensitivity:
                metrics[f"sensitivity_{key}"] = sensitivity[key]
    monte_carlo = raw.get("monte_carlo")
    if isinstance(monte_carlo, dict):
        for key in ("p95_drawdown", "median_final_return", "passed"):
            if key in monte_carlo:
                metrics[f"monte_carlo_{key}"] = monte_carlo[key]
    return metrics



def _derive_warnings(raw: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    if raw.get("validation_notes"):
        warnings.extend(_coerce_string_list(raw.get("validation_notes")))
    filtered_pairs = raw.get("filtered_pairs")
    if isinstance(filtered_pairs, list) and filtered_pairs:
        warnings.append(f"{len(filtered_pairs)} pair(s) were filtered out before validation.")
    if raw.get("insufficient_pairs"):
        warnings.append("The strategy did not pass the required number of profitable pairs.")
    if raw.get("healing_exhausted"):
        warnings.append("Auto-fix attempts were exhausted before a robust candidate was found.")
    failed_metrics = raw.get("_failed_metrics")
    if isinstance(failed_metrics, dict) and failed_metrics.get("reason"):
        warnings.append(f"Validation retry was triggered by: {failed_metrics['reason']}.")
    return warnings



def _retry_attempts_for(state: PipelineState, stage_idx: int, raw: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(raw.get("retry_history"), list):
        return raw["retry_history"]
    if stage_idx == 1:
        attempts = int(raw.get("baseline_attempts") or state.phase1_heal_attempts or 0)
        return [
            {
                "attempt": idx + 1,
                "stage": 1,
                "type": "baseline_auto_fix",
                "status": "applied" if idx < attempts - 1 else "latest",
            }
            for idx in range(max(0, attempts))
        ]
    if stage_idx in (3, 4):
        return list(state.retry_history or [])
    return []



def _auto_fix_for(state: PipelineState, stage_idx: int, raw: dict[str, Any]) -> dict[str, Any]:
    hooks: list[dict[str, Any]] = []
    if stage_idx == 1:
        hooks.append(
            {
                "name": "baseline_hard_mutation",
                "enabled": True,
                "attempts": state.phase1_heal_attempts,
                "description": "Force available Boolean indicator switches and rerun pair filtering.",
            }
        )
    if stage_idx in (3, 4):
        hooks.append(
            {
                "name": "sensitivity_self_heal",
                "enabled": True,
                "attempts": state.retry_count,
                "max_attempts": state.max_retries,
                "description": "Adjust hyperopt loss, spaces, epochs, or AI-proposed overrides after robustness failure.",
            }
        )
        hooks.append(
            {
                "name": "ollama_sensitivity_fix",
                "enabled": bool(raw.get("ollama_suggestions") or state.ai_enabled),
                "description": "Optional AI suggestion hook; backend still validates every proposed change.",
            }
        )
    return {"hooks": hooks, "last_action": raw.get("mutation_applied") or raw.get("auto_fix_action")}



def _suggestions_for(
    stage_idx: int,
    message: str,
    raw: dict[str, Any],
    errors: list[dict[str, Any]],
    state: PipelineState | None,
) -> list[str]:
    suggestions: list[str] = []
    text = f"{message} {raw.get('_failed_metrics', '')}".lower()
    for error in errors:
        suggestions.extend(_coerce_string_list(error.get("suggestions")))

    if "no market data" in text or "no data" in text:
        suggestions.append("Download OHLCV data for the selected timeframe and timerange before rerunning.")
    if "0 trades" in text or "zero trades" in text or "no signals" in text:
        suggestions.append("Widen the timerange, change timeframe, or verify entry conditions produce signals.")
    if "insufficient" in text and "pair" in text:
        suggestions.append("Expand the pair universe or loosen discovery gates before rerunning validation.")
    if "drawdown" in text:
        suggestions.append("Try a drawdown-aware loss function such as Calmar or ProfitDrawDown.")
    if "sharp peak" in text or "sensitivity" in text or "robustness" in text:
        suggestions.append("Enable WFO or increase in-sample coverage to reduce overfit parameter peaks.")
    if "negative baseline" in text:
        suggestions.append("Review the base strategy logic before optimizing; hyperopt cannot repair a structurally losing signal.")
    if raw.get("suggestions"):
        suggestions.extend(_coerce_string_list(raw.get("suggestions")))
    if state is not None and stage_idx in (3, 4) and state.retry_count >= state.max_retries:
        suggestions.append("Stop retrying this configuration and test a different strategy/timeframe/pair universe.")
    return suggestions



def _stage_progress_for(state: PipelineState, stage_idx: int, status: str) -> dict[str, Any]:
    return {
        "percent": _event_stage_percent(status),
        "global_percent": state.progress_percent,
        "is_current": state.current_stage == stage_idx,
        "current_stage": state.current_stage,
    }



def _status_kind(status: str, errors: list[dict[str, Any]]) -> str:
    if status == "failed" and errors:
        return errors[0].get("kind", "controlled_validation")
    if status == "failed":
        return "stage_failure"
    return status



def _event_stage_percent(status: str) -> int:
    if status == "passed":
        return 100
    if status == "failed":
        return 100
    if status == "running":
        return 50
    return 0



def _error_details_from_data(raw: dict[str, Any]) -> dict[str, Any]:
    details: dict[str, Any] = {}
    for key in ("_failed_metrics", "thresholds", "baseline_attempts", "healing_exhausted"):
        if key in raw:
            details[key] = raw[key]
    return details



def _slug_code(message: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "_", message.strip().lower()).strip("_")
    if not text:
        return "auto_quant_stage_failure"
    return text[:80]



def _strip_ui_keys(raw: dict[str, Any]) -> dict[str, Any]:
    ui_keys = {
        "schema_version",
        "status_kind",
        "input_summary",
        "output_summary",
        "metrics",
        "warnings",
        "errors",
        "retry_attempts",
        "suggestions",
        "auto_fix",
        "stage_progress",
    }
    return {key: value for key, value in raw.items() if key not in ui_keys}



def _coerce_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    if isinstance(value, tuple | set):
        return [str(item) for item in value if item is not None]
    if isinstance(value, str):
        return [value]
    return [str(value)]



def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        text = str(item).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result
