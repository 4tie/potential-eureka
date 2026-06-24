"""Router: /api/auto-quant/*

  POST /api/auto-quant/start                     — launch pipeline, returns run_id
  POST /api/auto-quant/generate-template         — generate CatFactory strategy file
  POST /api/auto-quant/screen-pairs              — quick sequential backtests to rank pairs
  GET  /api/auto-quant/status/{run_id}           — current pipeline state snapshot
  POST /api/auto-quant/cancel/{run_id}           — request cancellation
  GET  /api/auto-quant/report/{run_id}           — final report JSON
  GET  /api/auto-quant/report/{run_id}/html      — download self-contained HTML summary report
  GET  /api/auto-quant/download/{run_id}/{file}  — download output file
  POST /api/auto-quant/export/{run_id}           — download Freqtrade-ready zip bundle
  GET  /api/auto-quant/ws/{run_id}               — WebSocket event stream
  GET  /api/auto-quant/runs                      — list all pipeline runs
"""

from __future__ import annotations

import asyncio
import io
import json
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from ...services.auto_quant import pipeline as _pl
from ...services.auto_quant.generator import (
    generate_strategy_source,
    generate_strategy_source_adaptive,
    generate_strategy_source_ensemble,
    generate_strategy_source_momentum,
    generate_strategy_source_omni,
)
from ...services.auto_quant.pipeline import get_timeframe_thresholds
from ...services.auto_quant.api_service import (
    get_pipeline_status,
    list_pipeline_runs,
    load_options_data,
    request_pipeline_cancel,
    save_options_data,
)
from ...services.auto_quant.policy import (
    build_run_config,
    date_ranges_for_depth,
    latest_complete_day,
)
from ...services.auto_quant.variants import copy_to_output
from ...services.auto_quant.strategy_designer import generate_strategy_spec
from ...services.auto_quant.ollama_service import create_strategy_lab_client

router = APIRouter(prefix="/api/auto-quant", tags=["Auto-Quant Factory"])

# ── Request / response models ─────────────────────────────────────────────────

class StartAutoQuantRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strategy: str | None = Field(None, description="Strategy name (without .py extension)")
    timeframe: str | None = Field(None, description="Candle timeframe, e.g. '5m', '1h'")
    in_sample_range: str | None = Field(None, description="In-sample timerange, e.g. '20230101-20240101'")
    out_sample_range: str | None = Field(None, description="Out-of-sample timerange, e.g. '20240101-20240601'")
    exchange: str = Field("binance", description="Exchange name")
    config_file: str | None = Field(None, description="Path to config.json (optional, uses default)")
    max_drawdown_threshold: float = Field(30.0, description="Max allowed drawdown % (Stage 4 & 6)")
    min_win_rate: float = Field(40.0, description="Min required win rate % (Stage 6)")
    min_profit_factor: float = Field(1.0, description="Min required profit factor (Stage 6)")
    min_sharpe: float = Field(0.5, description="Min required Sharpe ratio (Stage 6)")
    min_oos_profit: float = Field(0.0, description="Min required OOS total profit fraction (Stage 4)")
    monte_carlo_threshold: float = Field(0.35, description="Max allowed Monte Carlo p95 drawdown (fraction, Stage 6)")
    hyperopt_loss: str = Field("ProfitLockinHyperOptLoss", description="Hyperopt loss function")
    hyperopt_spaces: list[str] = Field(default_factory=lambda: ["stoploss", "roi"], description="Hyperopt search spaces")
    hyperopt_epochs: int = Field(100, description="Number of hyperopt epochs")
    # Walk-Forward Optimization
    wfo_enabled: bool = Field(False, description="Enable Walk-Forward Optimization")
    wfo_is_months: int = Field(3, description="IS window size in months")
    wfo_oos_months: int = Field(1, description="OOS window size in months")
    wfo_recency_weight: float = Field(1.0, description="Recency weight multiplier (>1 favours recent windows)")
    # Alpha Ensemble Voting
    ensemble_enabled: bool = Field(False, description="Enable Alpha Consensus Voting (ensemble strategy)")
    # Optional single-pair override selected from the Pair Screener
    pair: str | None = Field(None, description="Target pair override (e.g. 'BTC/USDT'); passed as --pairs to Stage 1 & 4 backtests")
    # Dynamic Pair-list Whitelisting
    pair_universe: list[str] | None = Field(None, description="Custom pair universe for multi-pair backtesting (default: Top 50 by volume)")
    # Robustness-first workflow fields
    strategy_source: str | None = Field(None, description="Source mode: existing, uploaded, generated, or template")
    trading_style: str | None = Field(None, description="Trading style: scalping, intraday, swing, position")
    risk_profile: str | None = Field(None, description="Risk profile: conservative, balanced, aggressive")
    analysis_depth: str | None = Field(None, description="Analysis depth: quick, standard, deep")
    uploaded_strategy_id: str | None = Field(None, description="Uploaded/generated strategy identifier")
    generated_by: str | None = Field(None, description="AI provider that generated the strategy (e.g., 'hermes')")
    advanced_overrides: dict[str, Any] | None = Field(default_factory=dict, description="Advanced compatibility overrides")


class StartAutoQuantResponse(BaseModel):
    run_id: str
    status: str
    message: str


class ResumePipelineRequest(BaseModel):
    approved_pairs: list[str] = Field(..., description="List of approved pair names")


class GenerateTemplateRequest(BaseModel):
    strategy_name: str = Field("CatFactory", description="Class name for the generated strategy")
    adaptive: bool = Field(False, description="Generate adaptive regime-switching template")
    ensemble: bool = Field(False, description="Generate Alpha Consensus Voting (ensemble) template")
    momentum: bool = Field(False, description="Generate Momentum / EMA Crossover + ATR filter template")
    omni: bool = Field(False, description="Generate Omni-Strategy with Boolean indicator switches")
    timeframe: str = Field("5m", description="Target timeframe — used by Omni template to calibrate ROI/stoploss defaults")


class GenerateTemplateResponse(BaseModel):
    strategy_name: str
    file_path: str


class ScreenPairsRequest(BaseModel):
    strategy: str = Field(..., description="Strategy name (without .py extension)")
    timeframe: str = Field("5m", description="Candle timeframe, e.g. '5m', '1h'")
    date_range: str = Field(..., description="Timerange to backtest, e.g. '20230101-20240101'")
    pairs: list[str] = Field(..., min_length=1, description="List of pairs to screen")
    exchange: str = Field("binance", description="Exchange name")
    config_file: str | None = Field(None, description="Path to config.json (optional)")


class GenerateStrategySpecRequest(BaseModel):
    """Request model for generating a StrategySpec via Hermes AI."""
    trading_style: str = Field(..., description="Trading style: scalping, intraday, swing, position")
    direction: str = Field(..., description="Direction: long, short, both")
    risk_profile: str = Field(..., description="Risk profile: conservative, balanced, aggressive")
    timeframe_preference: str = Field(..., description="Preferred timeframe, e.g. '5m', '1h'")
    user_notes: str | None = Field(None, description="Optional user notes for the AI")


class GenerateStrategySpecResponse(BaseModel):
    """Response model for generating a StrategySpec via Hermes AI."""
    spec: dict[str, Any] | None = Field(None, description="Generated StrategySpec JSON")
    errors: list[str] = Field(default_factory=list, description="Validation errors if any")
    raw_response: str = Field("", description="Raw AI response for debugging")


class AutoQuantOptions(BaseModel):
    """Model for Auto-Quant form options persistence."""
    model_config = ConfigDict(extra="ignore")

    strategy: str = Field("", description="Strategy name")
    strategy_source: str = Field("existing", description="Strategy source mode")
    trading_style: str = Field("swing", description="Trading style")
    risk_profile: str = Field("balanced", description="Risk profile")
    analysis_depth: str = Field("deep", description="Analysis depth")
    uploaded_strategy_id: str | None = Field(None, description="Uploaded strategy id")
    advanced_overrides: dict[str, Any] = Field(default_factory=dict, description="Advanced overrides")
    timeframe: str = Field("5m", description="Candle timeframe")
    in_sample_range: str = Field("20230101-20240101", description="In-sample timerange")
    out_sample_range: str = Field("20240101-20241201", description="Out-of-sample timerange")
    exchange: str = Field("binance", description="Exchange name")
    pair: str = Field("", description="Target pair override")
    pair_universe: str = Field("", description="Custom pair list for multi-pair backtesting")
    max_drawdown_threshold: float = Field(30, description="Max allowed drawdown %")
    min_win_rate: float = Field(40, description="Min required win rate %")
    min_profit_factor: float = Field(1.0, description="Min required profit factor")
    min_sharpe: float = Field(0.5, description="Min required Sharpe ratio")
    min_oos_profit: float = Field(0.0, description="Min required OOS total profit fraction")
    monte_carlo_threshold: float = Field(0.35, description="Max allowed Monte Carlo p95 drawdown")
    hyperopt_loss: str = Field("ProfitLockinHyperOptLoss", description="Hyperopt loss function")
    hyperopt_spaces: list[str] = Field(default_factory=lambda: ["buy", "stoploss", "roi"], description="Hyperopt search spaces")
    hyperopt_epochs: int = Field(100, description="Number of hyperopt epochs")
    wfo_enabled: bool = Field(False, description="Enable Walk-Forward Optimization")
    wfo_is_months: int = Field(3, description="IS window size in months")
    wfo_oos_months: int = Field(1, description="OOS window size in months")
    wfo_recency_weight: float = Field(1.0, description="Recency weight multiplier")
    ensemble_enabled: bool = Field(False, description="Enable Alpha Consensus Voting")


# ── REST endpoints ────────────────────────────────────────────────────────────


@router.get(
    "/default-ranges",
    summary="Get dynamic default date ranges for AutoQuant",
)
async def get_default_ranges() -> dict[str, Any]:
    """Return current dynamic default date ranges from policy.

    Returns ranges for quick, standard, and deep analysis depths,
    all calculated relative to the latest complete day.
    """
    from datetime import datetime

    latest_day = latest_complete_day()
    generated_at = latest_day.strftime("%Y-%m-%d")

    quick_is, quick_oos = date_ranges_for_depth("quick")
    standard_is, standard_oos = date_ranges_for_depth("standard")
    deep_is, deep_oos = date_ranges_for_depth("deep")

    return {
        "quick": {
            "in_sample_range": quick_is,
            "out_sample_range": quick_oos,
        },
        "standard": {
            "in_sample_range": standard_is,
            "out_sample_range": standard_oos,
        },
        "deep": {
            "in_sample_range": deep_is,
            "out_sample_range": deep_oos,
        },
        "latest_complete_day": generated_at,
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.post(
    "/start",
    response_model=StartAutoQuantResponse,
    status_code=202,
    summary="Launch Auto-Quant Factory pipeline",
)
async def start_pipeline(body: StartAutoQuantRequest, request: Request) -> StartAutoQuantResponse:
    return await _start_pipeline_from_body(body, request)


async def _start_pipeline_from_body(
    body: StartAutoQuantRequest,
    request: Request,
) -> StartAutoQuantResponse:
    services = request.app.state.services
    settings = services.settings_store.load()
    normalized = build_run_config(body.model_dump(exclude_none=True), settings)

    # Resolve config file
    config_file = normalized.get("config_file") or settings.default_config_file_path
    if not Path(config_file).exists():
        raise HTTPException(status_code=400, detail=f"Config file not found: {config_file}")

    # Validate strategy exists
    strategy_name = normalized.get("strategy")
    if not strategy_name:
        raise HTTPException(status_code=422, detail="strategy or uploaded_strategy_id is required.")
    strategies_dir = Path(settings.strategies_directory_path)
    strategy_path = strategies_dir / f"{strategy_name}.py"
    if not strategy_path.exists():
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_name}' not found.")

    thresholds = normalized["thresholds"]
    run_config_snapshot = {
        "schema_version": "run_config_snapshot_v1",
        "policy_versions": normalized["policy_versions"],
        "strategy": strategy_name,
        "strategy_source": normalized["strategy_source"],
        "uploaded_strategy_id": normalized.get("uploaded_strategy_id"),
        "generated_by": normalized.get("generated_by"),
        "trading_style": normalized["trading_style"],
        "risk_profile": normalized["risk_profile"],
        "analysis_depth": normalized["analysis_depth"],
        "timeframe": normalized["timeframe"],
        "configured_timeframes": normalized["configured_timeframes"],
        "unsupported_timeframes": normalized["unsupported_timeframes"],
        "selected_pairs": normalized["selected_pair_universe"],
        "date_ranges": {
            "in_sample": normalized["in_sample_range"],
            "out_of_sample": normalized["out_sample_range"],
        },
        "optimization": {
            "hyperopt_loss": normalized["hyperopt_loss"],
            "hyperopt_spaces": normalized["hyperopt_spaces"],
            "hyperopt_epochs": normalized["hyperopt_epochs"],
            "wfo_enabled": normalized["wfo_enabled"],
            "wfo_is_months": normalized["wfo_is_months"],
            "wfo_oos_months": normalized["wfo_oos_months"],
            "wfo_recency_weight": normalized["wfo_recency_weight"],
            "planned_wfo_windows": normalized.get("planned_wfo_windows", []),
        },
        "thresholds": thresholds,
        "exchange": normalized["exchange"],
        "advanced_overrides": normalized["advanced_overrides"],
    }

    run_id = _pl.create_run(
        strategy=strategy_name,
        timeframe=normalized["timeframe"],
        in_sample_range=normalized["in_sample_range"],
        out_sample_range=normalized["out_sample_range"],
        exchange=normalized["exchange"],
        config_file=config_file,
        freqtrade_path=settings.freqtrade_executable_path,
        user_data_dir=settings.user_data_directory_path,
        max_drawdown_threshold=thresholds["max_drawdown"],
        min_win_rate=thresholds["min_win_rate"],
        min_profit_factor=thresholds["min_profit_factor"],
        min_sharpe=thresholds["min_sharpe"],
        min_oos_profit=thresholds["min_oos_profit"],
        monte_carlo_threshold=thresholds["monte_carlo_threshold"],
        hyperopt_loss=normalized["hyperopt_loss"],
        hyperopt_spaces=normalized["hyperopt_spaces"],
        hyperopt_epochs=normalized["hyperopt_epochs"],
        hyperopt_workers=settings.hyperopt_workers,
        wfo_enabled=normalized["wfo_enabled"],
        wfo_is_months=normalized["wfo_is_months"],
        wfo_oos_months=normalized["wfo_oos_months"],
        wfo_recency_weight=normalized["wfo_recency_weight"],
        planned_wfo_windows=normalized.get("planned_wfo_windows", []),
        ensemble_enabled=normalized["ensemble_enabled"],
        pair=normalized["pair"] or None,
        pair_universe=normalized["pair_universe"],
        strategy_source=normalized["strategy_source"],
        trading_style=normalized["trading_style"],
        risk_profile=normalized["risk_profile"],
        analysis_depth=normalized["analysis_depth"],
        uploaded_strategy_id=normalized.get("uploaded_strategy_id"),
        advanced_overrides=normalized["advanced_overrides"],
        auto_discovery_enabled=bool(body.trading_style or body.risk_profile or body.analysis_depth),
        validation_notes=normalized["validation_notes"],
        run_config_snapshot=run_config_snapshot,
        policy_versions=normalized["policy_versions"],
        selected_timeframe=normalized["timeframe"],
        selected_pair_universe=normalized["selected_pair_universe"],
    )

    asyncio.create_task(_pl.run_pipeline(run_id))

    return StartAutoQuantResponse(
        run_id=run_id,
        status="running",
        message=(
            f"Auto-Quant Factory started for '{strategy_name}'. "
            f"Connect to /api/auto-quant/ws/{run_id} for live progress."
        ),
    )


@router.post(
    "/runs",
    response_model=StartAutoQuantResponse,
    status_code=202,
    summary="Compatibility alias for launching Auto-Quant runs",
)
async def start_pipeline_runs_alias(
    body: StartAutoQuantRequest,
    request: Request,
) -> StartAutoQuantResponse:
    return await _start_pipeline_from_body(body, request)


@router.post(
    "/generate-template",
    response_model=GenerateTemplateResponse,
    status_code=201,
    summary="Generate a CategoricalParameter strategy template",
)
async def generate_template(
    body: GenerateTemplateRequest, request: Request
) -> GenerateTemplateResponse:
    name = body.strategy_name.strip()

    if not name:
        raise HTTPException(status_code=422, detail="strategy_name must not be empty.")

    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(
            status_code=422,
            detail="strategy_name must not contain path separators.",
        )

    services = request.app.state.services
    settings = services.settings_store.load()
    strategies_dir = Path(settings.strategies_directory_path)
    strategies_dir.mkdir(parents=True, exist_ok=True)

    target = strategies_dir / f"{name}.py"
    if target.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Strategy '{name}' already exists. Choose a different name.",
        )

    if body.omni:
        source = generate_strategy_source_omni(name, timeframe=body.timeframe)
    elif body.momentum:
        source = generate_strategy_source_momentum(name)
    elif body.ensemble:
        source = generate_strategy_source_ensemble(name)
    elif body.adaptive:
        source = generate_strategy_source_adaptive(name)
    else:
        source = generate_strategy_source(name)
    target.write_text(source, encoding="utf-8")

    return GenerateTemplateResponse(
        strategy_name=name,
        file_path=str(target),
    )


@router.post(
    "/generate-strategy-spec",
    response_model=GenerateStrategySpecResponse,
    summary="Generate a StrategySpec using Hermes AI",
)
async def generate_strategy_spec_endpoint(
    body: GenerateStrategySpecRequest, request: Request
) -> GenerateStrategySpecResponse:
    """Generate a structured StrategySpec using the Hermes AI model.

    This endpoint uses the configured strategy lab model (ollama_model_strategylab)
    to generate a StrategySpec based on user inputs. The AI only generates the
    structured spec, not actual strategy code or profitability decisions.
    """
    services = request.app.state.services
    settings = services.settings_store.load()

    # Create Ollama client with strategy lab model override
    client = create_strategy_lab_client(settings.user_data_directory_path)
    if client is None:
        return GenerateStrategySpecResponse(
            spec=None,
            errors=["OLLAMA_CLIENT_NOT_AVAILABLE"],
            raw_response="",
        )

    # Generate the strategy spec
    result = await generate_strategy_spec(
        client,
        trading_style=body.trading_style,
        timeframe=body.timeframe_preference,
        direction=body.direction,
        risk_profile=body.risk_profile,
        description=body.user_notes,
    )

    # Convert StrategySpec to dict if successful
    spec_dict = None
    if result["spec"] is not None:
        spec_dict = result["spec"].model_dump(mode="json")

    return GenerateStrategySpecResponse(
        spec=spec_dict,
        errors=result["errors"],
        raw_response=result.get("raw_response", ""),
    )


@router.get(
    "/timeframe-thresholds/{timeframe}",
    summary="Return dynamic profitability thresholds for a given timeframe",
)
async def timeframe_thresholds(timeframe: str) -> dict:
    """Return the recommended success thresholds for *timeframe*.

    The frontend uses this to auto-populate the risk-threshold fields whenever
    the user changes the Timeframe dropdown so that scalping and swing runs are
    evaluated against appropriately calibrated criteria.
    """
    return get_timeframe_thresholds(timeframe)


@router.post(
    "/screen-pairs",
    summary="Run quick sequential backtests to rank a list of pairs",
)
async def screen_pairs(body: ScreenPairsRequest, request: Request) -> dict:
    services = request.app.state.services
    settings = services.settings_store.load()

    config_file = body.config_file or settings.default_config_file_path
    if not Path(config_file).exists():
        raise HTTPException(status_code=400, detail=f"Config file not found: {config_file}")

    strategies_dir = Path(settings.strategies_directory_path)
    strategy_path = strategies_dir / f"{body.strategy}.py"
    if not strategy_path.exists():
        raise HTTPException(status_code=404, detail=f"Strategy '{body.strategy}' not found.")

    freqtrade_path = settings.freqtrade_executable_path
    user_data_dir = settings.user_data_directory_path

    results: list[dict] = []
    errors: list[str] = []

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        for pair in body.pairs:
            pair_clean = pair.replace("/", "_")
            export_file = tmp_path / f"{pair_clean}.json"
            cmd = [
                freqtrade_path, "backtesting",
                "--config", config_file,
                "--strategy", body.strategy,
                "--timerange", body.date_range,
                "--timeframe", body.timeframe,
                "--user-data-dir", user_data_dir,
                "--export", "trades",
                "--export-filename", str(export_file),
                "--no-color",
                "--cache", "none",
                "--pairs", pair,
            ]
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                )
                try:
                    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=300)
                except asyncio.TimeoutError:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    errors.append(f"{pair}: timed out after 5 minutes")
                    continue

                if proc.returncode != 0:
                    stderr_text = stdout.decode("utf-8", errors="replace") if stdout else ""
                    tail = "\n".join(stderr_text.splitlines()[-5:])
                    errors.append(f"{pair}: backtest exited with rc={proc.returncode} — {tail[:200]}")
                    continue

                data = _pl._find_backtest_result(tmp_path, pair_clean, user_data_dir)
                if not data:
                    errors.append(f"{pair}: result JSON not found after backtest")
                    continue

                summary = _pl._extract_backtest_summary(data, body.strategy)
                trade_count = int(summary.get("total_trades", 0))

                if trade_count == 0:
                    results.append({
                        "pair": pair,
                        "profit_pct": None,
                        "trade_count": 0,
                        "win_rate": None,
                        "max_dd": None,
                    })
                    continue

                wins = summary.get("wins", 0)
                losses = summary.get("losses", 0)
                draws = summary.get("draws", 0)
                total = wins + losses + draws
                win_rate = round(wins / total * 100, 1) if total > 0 else None

                results.append({
                    "pair": pair,
                    "profit_pct": round(float(summary.get("profit_total", 0.0)) * 100, 2),
                    "trade_count": trade_count,
                    "win_rate": win_rate,
                    "max_dd": round(float(summary.get("max_drawdown_account", 0.0)) * 100, 2),
                })

            except Exception as exc:
                errors.append(f"{pair}: {exc}")

    results.sort(key=lambda r: (r["profit_pct"] is None, -(r["profit_pct"] or 0.0)))

    return {
        "results": results,
        "screened": len(body.pairs),
        "errors": errors,
    }


@router.get(
    "/status/{run_id}",
    summary="Get current pipeline state",
)
async def get_status(run_id: str) -> dict:
    return get_pipeline_status(run_id)


@router.post(
    "/cancel/{run_id}",
    summary="Request pipeline cancellation",
)
async def cancel_pipeline(run_id: str) -> dict:
    return request_pipeline_cancel(run_id)


@router.post(
    "/resume/{run_id}",
    summary="Resume pipeline after user approval",
)
async def resume_pipeline(run_id: str, body: ResumePipelineRequest) -> dict:
    """Resume a paused pipeline with user-approved pairs."""
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    if state.status != "awaiting_user_approval":
        raise HTTPException(
            status_code=409,
            detail=f"Pipeline is not awaiting user approval (current status: {state.status})"
        )

    # Update state with approved pairs
    state.user_approved_pairs = body.approved_pairs
    # Also populate selected_pairs directly to ensure pipeline can proceed
    state.selected_pairs = [{"key": pair} for pair in body.approved_pairs]
    # Advance current_stage to avoid getting stuck in resume logic
    if state.current_stage == 1:
        state.current_stage = 2
    elif state.current_stage == 2:
        # Stage 2 (Portfolio Baseline) approval - advance to Stage 3
        state.current_stage = 3
        # Mark Stage 2 as passed since user approved the baseline
        if len(state.stages) > 1:
            state.stages[1].status = "passed"
    state.status = "running"
    _pl._save_state_to_disk(state)

    # Resume the pipeline (this will trigger the next stage)
    asyncio.create_task(_pl.run_pipeline(run_id))

    return {
        "run_id": run_id,
        "status": "running",
        "approved_pairs": body.approved_pairs,
        "message": f"Pipeline resumed with {len(body.approved_pairs)} approved pairs"
    }


@router.get(
    "/report/{run_id}",
    summary="Get final pipeline report",
)
async def get_report(run_id: str) -> dict:
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    if state.status not in ("completed", "failed", "interrupted"):
        raise HTTPException(status_code=409,
                            detail="Pipeline has not completed yet. Poll /status first.")
    if state.report is None:
        # Try loading from disk
        out_dir = Path(state.user_data_dir) / "auto_quant" / run_id
        for report_path in (out_dir / "report_latest.json", out_dir / "report.json"):
            if report_path.exists():
                return json.loads(report_path.read_text(encoding="utf-8"))
        raise HTTPException(status_code=404, detail="Report not found.")
    return state.report


@router.get(
    "/report/{run_id}/html",
    summary="Download HTML summary report for a completed pipeline run",
)
async def get_report_html(run_id: str) -> Response:
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    if state.status not in ("completed", "failed", "interrupted"):
        raise HTTPException(status_code=409,
                            detail="Pipeline has not completed yet. Poll /status first.")

    report: dict[str, Any] | None = state.report
    if report is None:
        out_dir = Path(state.user_data_dir) / "auto_quant" / run_id
        for report_path in (out_dir / "report_latest.json", out_dir / "report.json"):
            if report_path.exists():
                report = json.loads(report_path.read_text(encoding="utf-8"))
                break
        if report is None:
            raise HTTPException(status_code=404, detail="Report not found.")

    wfo_windows: list = state.wfo_windows or report.get("wfo_windows") or []
    html = _build_html_report(report, wfo_windows)
    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": f'attachment; filename="report-{run_id}.html"'},
    )


def _fmt(val: Any, decimals: int = 2, suffix: str = "") -> str:
    if val is None:
        return "—"
    try:
        return f"{float(val):.{decimals}f}{suffix}"
    except (TypeError, ValueError):
        return str(val)


def _val_class(ok: bool | None) -> str:
    if ok is True:
        return "pass-val"
    if ok is False:
        return "fail-val"
    return "neutral-val"


def _build_html_report(report: dict[str, Any], wfo_windows: list) -> str:
    run_id    = report.get("run_id", "\u2014")
    strategy  = report.get("strategy", "\u2014")
    opt_strat = report.get("optimized_strategy", "\u2014")
    status    = report.get("status", "\u2014")
    created   = report.get("created_at") or report.get("started_at") or "\u2014"
    completed = report.get("completed_at") or "\u2014"

    stages     = report.get("stages") or []
    oos        = report.get("oos_validation") or {}
    risk       = report.get("risk") or {}
    mc         = report.get("monte_carlo") or risk.get("monte_carlo") or {}
    stress     = report.get("stress_test") or {}
    thresholds = report.get("thresholds") or {}
    sanity     = report.get("sanity_backtest") or {}

    max_dd_thr = thresholds.get("max_drawdown", 30)
    min_wr_thr = thresholds.get("min_win_rate", 40)
    min_pf_thr = thresholds.get("min_profit_factor", 1.0)
    min_sh_thr = thresholds.get("min_sharpe", 0.5)
    mc_thr     = thresholds.get("monte_carlo_threshold", 0.35)
    min_oos_pr = thresholds.get("min_oos_profit", 0)

    NA = "\u2014"  # em dash used as a "no data" placeholder

    # ── Stages table ──────────────────────────────────────────────────────────
    stage_rows = ""
    for s in stages:
        st = s.get("status", "pending")
        color = {"passed": "#22c55e", "failed": "#ef4444", "running": "#f59e0b",
                 "pending": "#94a3b8"}.get(st, "#94a3b8")
        icon = {"passed": "\u2714", "failed": "\u2718", "running": "\u25b6",
                "pending": "\u25cb"}.get(st, "\u25cb")
        s_msg = s.get("message") or NA
        s_idx = s.get("index", "")
        s_name = s.get("name", "")
        stage_rows += (
            "<tr>"
            + f"<td>{s_idx}</td>"
            + f"<td>{s_name}</td>"
            + f'<td style="color:{color};font-weight:600">{icon} {st.capitalize()}</td>'
            + f"<td>{s_msg}</td>"
            + "</tr>\n"
        )
    if not stage_rows:
        stage_rows = "<tr><td colspan='4' style='color:#64748b'>No stage data</td></tr>"

    # ── Risk checks ───────────────────────────────────────────────────────────
    checks = risk.get("checks") or []
    check_rows = ""
    for c in checks:
        ok       = c.get("passed")
        color    = "#22c55e" if ok else "#ef4444"
        icon     = "\u2714" if ok else "\u2718"
        c_val    = c.get("value")
        c_val_s  = str(c_val) if c_val is not None else NA
        c_name   = c.get("name") or NA
        c_thr    = c.get("threshold") or NA
        c_msg    = c.get("message") or NA
        check_rows += (
            "<tr>"
            + f"<td>{c_name}</td>"
            + f'<td style="color:{color}">{icon}</td>'
            + f"<td>{c_val_s}</td>"
            + f"<td>{c_thr}</td>"
            + f"<td>{c_msg}</td>"
            + "</tr>\n"
        )

    check_table = ""
    if check_rows:
        check_table = (
            '<div class="table-wrap"><table>'
            "<thead><tr><th>Check</th><th>Result</th><th>Value</th>"
            "<th>Threshold</th><th>Notes</th></tr></thead>"
            f"<tbody>{check_rows}</tbody></table></div>"
        )

    # ── Stress test pairs ─────────────────────────────────────────────────────
    passing = stress.get("passing_pairs") or []
    failing = stress.get("failing_pairs") or []

    def pair_spans(pairs: list, css_class: str) -> str:
        if not pairs:
            return '<span style="color:#94a3b8">none</span>'
        return " ".join(
            f'<span class="pair {css_class}">{p}</span>' for p in pairs
        )

    stress_section = ""
    if passing or failing:
        stress_section = (
            "<section>"
            "<h2>Stress Test Pairs</h2>"
            '<div style="margin-bottom:10px">'
            f'<div style="font-size:0.72rem;color:#94a3b8;margin-bottom:4px">Passing ({len(passing)})</div>'
            f"<div>{pair_spans(passing, 'pass')}</div>"
            "</div><div>"
            f'<div style="font-size:0.72rem;color:#94a3b8;margin-bottom:4px">Failing ({len(failing)})</div>'
            f"<div>{pair_spans(failing, 'fail')}</div>"
            "</div></section>"
        )

    # ── Monte Carlo ───────────────────────────────────────────────────────────
    mc_p95    = mc.get("p95_drawdown")
    mc_p5     = mc.get("p5_drawdown")
    mc_median = mc.get("median_final_return")
    mc_passed = mc.get("passed")

    mc_section = ""
    if mc:
        mc_p95_val    = _fmt(mc_p95 * 100 if mc_p95 is not None else None, 1, "%")
        mc_p5_val     = _fmt(mc_p5 * 100 if mc_p5 is not None else None, 1, "%")
        mc_med_val    = _fmt(mc_median * 100 if mc_median is not None else None, 2, "%")
        mc_verdict    = ("PASS" if mc_passed else "FAIL") if mc_passed is not None else "\u2014"
        mc_p95_cls    = _val_class(mc_passed)
        mc_verd_cls   = _val_class(mc_passed)
        mc_thr_pct    = f"{mc_thr * 100:.1f}"
        mc_section = (
            "<section><h2>Monte Carlo Stress Test</h2>"
            '<div class="metrics-grid">'
            f'<div class="metric-card"><div class="label">p95 Drawdown</div>'
            f'<div class="value {mc_p95_cls}">{mc_p95_val}</div>'
            f"<div class=\"threshold\">&lt; {mc_thr_pct}%</div></div>"
            f'<div class="metric-card"><div class="label">p5 Drawdown</div>'
            f'<div class="value neutral-val">{mc_p5_val}</div></div>'
            f'<div class="metric-card"><div class="label">Median Return</div>'
            f'<div class="value neutral-val">{mc_med_val}</div></div>'
            f'<div class="metric-card"><div class="label">Verdict</div>'
            f'<div class="value {mc_verd_cls}">{mc_verdict}</div></div>'
            "</div></section>"
        )

    # ── WFO table ─────────────────────────────────────────────────────────────
    wfo_section = ""
    if wfo_windows:
        wfo_rows = ""
        for w in wfo_windows:
            profit     = w.get("profit")
            st         = w.get("status") or NA
            color      = {"passed": "#22c55e", "warning": "#f59e0b",
                          "failed": "#ef4444"}.get(st, "#94a3b8")
            profit_str = _fmt(profit, 2, "%") if profit is not None else NA
            w_win      = w.get("window", "?")
            w_is       = w.get("is_range") or NA
            w_oos      = w.get("oos_range") or NA
            w_dd       = _fmt(w.get("max_dd"), 2, "%")
            w_trades   = str(w.get("trades")) if w.get("trades") is not None else NA
            w_rw       = _fmt(w.get("recency_weight"), 3)
            w_wp       = _fmt(w.get("weighted_profit"), 2, "%")
            wfo_rows += (
                "<tr>"
                + f"<td>W{w_win}</td>"
                + f"<td>{w_is}</td>"
                + f"<td>{w_oos}</td>"
                + f"<td>{profit_str}</td>"
                + f"<td>{w_dd}</td>"
                + f"<td>{w_trades}</td>"
                + f"<td>{w_rw}</td>"
                + f"<td>{w_wp}</td>"
                + f'<td style="color:{color};font-weight:600">{st.capitalize()}</td>'
                + "</tr>\n"
            )
        wfo_section = (
            "<section><h2>Walk-Forward Optimization Windows</h2>"
            '<div class="table-wrap"><table><thead><tr>'
            "<th>Window</th><th>IS Range</th><th>OOS Range</th>"
            "<th>OOS Profit</th><th>Max DD</th><th>Trades</th>"
            "<th>Recency W</th><th>Weighted Profit</th><th>Status</th>"
            f"</tr></thead><tbody>{wfo_rows}</tbody></table></div></section>"
        )

    # ── OOS metrics ───────────────────────────────────────────────────────────
    oos_profit    = oos.get("profit_total")
    oos_profit_ok = oos_profit is not None and oos_profit >= min_oos_pr
    oos_max_dd    = oos.get("max_drawdown_account")
    oos_trades    = oos.get("total_trades") or "\u2014"

    oos_profit_str = _fmt(oos_profit * 100 if oos_profit is not None else None, 2, "%")
    oos_dd_str     = _fmt(oos_max_dd * 100 if oos_max_dd is not None else None, 2, "%")
    is_profit_str  = _fmt(sanity.get("profit_total_abs"), 2, " USDT")
    oos_profit_cls = _val_class(oos_profit_ok if oos_profit is not None else None)

    # ── Risk metrics ──────────────────────────────────────────────────────────
    risk_max_dd = risk.get("max_drawdown_pct")
    risk_wr     = risk.get("win_rate_pct")
    risk_pf     = risk.get("profit_factor")
    risk_sharpe = risk.get("sharpe_ratio")

    dd_ok = risk_max_dd is not None and risk_max_dd < max_dd_thr
    wr_ok = risk_wr is not None and risk_wr >= min_wr_thr
    pf_ok = risk_pf is not None and risk_pf >= min_pf_thr
    sh_ok = risk_sharpe is not None and risk_sharpe >= min_sh_thr

    dd_val  = _fmt(risk_max_dd, 1, "%")
    wr_val  = _fmt(risk_wr, 1, "%")
    pf_val  = _fmt(risk_pf, 2)
    sh_val  = _fmt(risk_sharpe, 2)
    mc_pct  = f"{mc_thr * 100:.1f}"

    # ── Assemble HTML ─────────────────────────────────────────────────────────
    parts = [
        "<!DOCTYPE html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        f"<title>Auto-Quant Report \u2014 {run_id}</title>",
        "<style>",
        "  *, *::before, *::after { box-sizing: border-box; }",
        "  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
        " font-size: 14px; color: #e2e8f0; background: #0f172a;"
        " margin: 0; padding: 24px; line-height: 1.6; }",
        "  h1 { font-size: 1.4rem; font-weight: 700; color: #f8fafc; margin: 0 0 4px 0; }",
        "  h2 { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em;"
        " text-transform: uppercase; color: #94a3b8; margin: 0 0 10px 0;"
        " padding-bottom: 6px; border-bottom: 1px solid #1e293b; }",
        "  .subtitle { color: #94a3b8; font-size: 0.82rem; margin: 0 0 28px 0; }",
        "  section { margin-bottom: 28px; }",
        "  .meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));"
        " gap: 10px; margin-bottom: 28px; }",
        "  .meta-card { background: #1e293b; border-radius: 8px; padding: 12px 14px;"
        " border: 1px solid #334155; }",
        "  .meta-card .label { font-size: 0.7rem; color: #64748b; text-transform: uppercase;"
        " letter-spacing: 0.06em; margin-bottom: 3px; }",
        "  .meta-card .value { font-size: 0.9rem; font-weight: 600; color: #f1f5f9;"
        " word-break: break-all; }",
        "  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));"
        " gap: 10px; margin-bottom: 16px; }",
        "  .metric-card { background: #1e293b; border-radius: 8px; padding: 12px 14px;"
        " border: 1px solid #334155; }",
        "  .metric-card .label { font-size: 0.68rem; color: #64748b; text-transform: uppercase;"
        " letter-spacing: 0.06em; margin-bottom: 3px; }",
        "  .metric-card .value { font-size: 1.1rem; font-weight: 700; }",
        "  .metric-card .threshold { font-size: 0.68rem; color: #64748b; margin-top: 2px; }",
        "  .pass-val { color: #22c55e; }",
        "  .fail-val { color: #ef4444; }",
        "  .neutral-val { color: #e2e8f0; }",
        "  .table-wrap { overflow-x: auto; }",
        "  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }",
        "  thead th { background: #1e293b; color: #94a3b8; font-weight: 600; font-size: 0.7rem;"
        " text-transform: uppercase; letter-spacing: 0.06em;"
        " padding: 8px 10px; text-align: left; border-bottom: 1px solid #334155; }",
        "  tbody tr { border-bottom: 1px solid #1e293b; }",
        "  tbody tr:last-child { border-bottom: none; }",
        "  tbody td { padding: 7px 10px; color: #cbd5e1; vertical-align: top; }",
        "  tbody tr:hover td { background: #1e293b; }",
        "  .pair { display: inline-block; padding: 1px 7px; border-radius: 6px;"
        " font-size: 0.72rem; font-weight: 600; margin: 2px; }",
        "  .pair.pass { background: #14532d; color: #22c55e; }",
        "  .pair.fail { background: #450a0a; color: #ef4444; }",
        "  .thr-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }",
        "  .thr-pill { background: #1e293b; border: 1px solid #334155; border-radius: 9999px;"
        " padding: 2px 10px; font-size: 0.7rem; color: #94a3b8; }",
        "  .report-footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #1e293b;"
        " font-size: 0.72rem; color: #475569; text-align: right; }",
        "</style>",
        "</head>",
        "<body>",
        "<h1>Auto-Quant Factory Report</h1>",
        f'<p class="subtitle">Run ID: {run_id}</p>',
        '<div class="meta-grid">',
        f'  <div class="meta-card"><div class="label">Strategy</div><div class="value">{strategy}</div></div>',
        f'  <div class="meta-card"><div class="label">Optimized Strategy</div><div class="value">{opt_strat}</div></div>',
        f'  <div class="meta-card"><div class="label">Status</div><div class="value">{status.upper()}</div></div>',
        f'  <div class="meta-card"><div class="label">Started</div><div class="value">{created}</div></div>',
        f'  <div class="meta-card"><div class="label">Completed</div><div class="value">{completed}</div></div>',
        "</div>",
        '<div class="thr-list">',
        f'  <span class="thr-pill">DD &lt; {max_dd_thr}%</span>',
        f'  <span class="thr-pill">Win \u2265 {min_wr_thr}%</span>',
        f'  <span class="thr-pill">PF \u2265 {min_pf_thr}</span>',
        f'  <span class="thr-pill">Sharpe \u2265 {min_sh_thr}</span>',
        f'  <span class="thr-pill">MC p95 &lt; {mc_pct}%</span>',
        "</div>",
        "<section><h2>Pipeline Stages</h2>",
        '<div class="table-wrap"><table>',
        "<thead><tr><th>#</th><th>Stage</th><th>Status</th><th>Message</th></tr></thead>",
        f"<tbody>{stage_rows}</tbody></table></div></section>",
        "<section><h2>OOS Metrics</h2>",
        '<div class="metrics-grid">',
        f'  <div class="metric-card"><div class="label">OOS Profit</div>'
        f'  <div class="value {oos_profit_cls}">{oos_profit_str}</div>'
        f'  <div class="threshold">\u2265 {min_oos_pr}%</div></div>',
        f'  <div class="metric-card"><div class="label">OOS Max Drawdown</div>'
        f'  <div class="value neutral-val">{oos_dd_str}</div></div>',
        f'  <div class="metric-card"><div class="label">In-Sample Profit</div>'
        f'  <div class="value neutral-val">{is_profit_str}</div></div>',
        f'  <div class="metric-card"><div class="label">OOS Total Trades</div>'
        f'  <div class="value neutral-val">{oos_trades}</div></div>',
        "</div></section>",
        "<section><h2>Risk Assessment</h2>",
        '<div class="metrics-grid">',
        f'  <div class="metric-card"><div class="label">Max Drawdown</div>'
        f'  <div class="value {_val_class(dd_ok if risk_max_dd is not None else None)}">{dd_val}</div>'
        f'  <div class="threshold">&lt; {max_dd_thr}%</div></div>',
        f'  <div class="metric-card"><div class="label">Win Rate</div>'
        f'  <div class="value {_val_class(wr_ok if risk_wr is not None else None)}">{wr_val}</div>'
        f'  <div class="threshold">\u2265 {min_wr_thr}%</div></div>',
        f'  <div class="metric-card"><div class="label">Profit Factor</div>'
        f'  <div class="value {_val_class(pf_ok if risk_pf is not None else None)}">{pf_val}</div>'
        f'  <div class="threshold">\u2265 {min_pf_thr}</div></div>',
        f'  <div class="metric-card"><div class="label">Sharpe Ratio</div>'
        f'  <div class="value {_val_class(sh_ok if risk_sharpe is not None else None)}">{sh_val}</div>'
        f'  <div class="threshold">\u2265 {min_sh_thr}</div></div>',
        "</div>",
        check_table,
        "</section>",
        mc_section,
        stress_section,
        wfo_section,
        f'<div class="report-footer">Generated by Strategy Lab &mdash; {run_id}</div>',
        "</body>",
        "</html>",
    ]
    return "\n".join(parts)


@router.get(
    "/download/{run_id}/{filename}",
    summary="Download pipeline output file",
)
async def download_file(run_id: str, filename: str) -> FileResponse:
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")

    # Security: only allow specific filenames
    allowed_suffixes = {".py", ".json"}
    if Path(filename).suffix not in allowed_suffixes:
        raise HTTPException(status_code=400, detail="Only .py and .json files can be downloaded.")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    out_dir = Path(state.user_data_dir) / "auto_quant" / run_id
    file_path = out_dir / filename

    # Also check strategies dir for the .py file
    if not file_path.exists() and filename.endswith(".py"):
        runtime_dir = Path(state.user_data_dir) / "auto_quant" / run_id / "strategies"
        file_path = runtime_dir / filename
    if not file_path.exists() and filename.endswith(".py"):
        strategies_dir = Path(state.user_data_dir) / "strategies"
        file_path = strategies_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")

    media_type = "text/x-python" if filename.endswith(".py") else "application/json"
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=media_type,
    )


def _safe_export_name(value: str | None) -> str:
    cleaned = "".join(
        ch if ch.isalnum() or ch in ("_", "-") else "_"
        for ch in (value or "strategy").strip()
    ).strip("_-")
    return cleaned or "strategy"


def _load_export_report(state: Any, run_dir: Path) -> dict[str, Any]:
    report = state.report
    if isinstance(report, dict):
        return report

    for report_path in (run_dir / "report_latest.json", run_dir / "report.json"):
        if report_path.exists():
            return json.loads(report_path.read_text(encoding="utf-8"))

    raise HTTPException(status_code=404, detail="Report not found for export.")


def _resolve_export_artifact(
    state: Any,
    run_dir: Path,
    file_value: str | None,
    label: str,
) -> Path:
    if not file_value:
        raise HTTPException(status_code=404, detail=f"Export artifact '{label}' is not listed in the report.")

    raw_path = Path(file_value)
    user_data_dir = Path(state.user_data_dir)
    candidates: list[Path] = []

    if raw_path.is_absolute():
        try:
            raw_path.resolve().relative_to(user_data_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid export artifact path for '{label}'.")
        candidates.append(raw_path)
    else:
        if ".." in raw_path.parts:
            raise HTTPException(status_code=400, detail=f"Invalid export artifact path for '{label}'.")
        candidates.append(run_dir / raw_path)
        if raw_path.suffix == ".py":
            candidates.append(run_dir / "strategies" / raw_path.name)
            candidates.append(user_data_dir / "strategies" / raw_path.name)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    raise HTTPException(status_code=404, detail=f"Export artifact '{label}' not found: {file_value}")


def _optional_export_artifact(state: Any, run_dir: Path, file_value: str | None, label: str) -> Path | None:
    if not file_value:
        return None
    try:
        return _resolve_export_artifact(state, run_dir, file_value, label)
    except HTTPException as exc:
        if exc.status_code == 404:
            return None
        raise


def _optional_state_snapshot(state: Any, run_dir: Path, report: dict[str, Any]) -> Path | None:
    artifact_versions = {}
    if isinstance(getattr(state, "artifact_versions", None), dict):
        artifact_versions.update(state.artifact_versions)
    if isinstance(report.get("artifact_versions"), dict):
        artifact_versions.update(report["artifact_versions"])

    names = [
        artifact_versions.get("state_latest"),
        artifact_versions.get("state_v1"),
        artifact_versions.get("state"),
        "state_latest.json",
        "state.json",
    ]
    for name in names:
        if not name:
            continue
        candidate = run_dir / Path(name).name
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


@router.post(
    "/export/{run_id}",
    status_code=200,
    summary="Download a Freqtrade-ready deployment bundle for a completed run",
)
async def export_pipeline(run_id: str) -> FileResponse:
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    if state.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Pipeline run '{run_id}' is not completed (current status: {state.status}).",
        )

    run_dir = Path(state.user_data_dir) / "auto_quant" / run_id
    report = _load_export_report(state, run_dir)
    files = report.get("files")
    if not isinstance(files, dict):
        raise HTTPException(status_code=404, detail="Report does not list export files.")

    optimized_path = _resolve_export_artifact(state, run_dir, files.get("optimized_strategy"), "optimized_strategy")
    config_path = _resolve_export_artifact(state, run_dir, files.get("config"), "config")
    report_path = _resolve_export_artifact(state, run_dir, files.get("report"), "report")

    artifacts: list[tuple[Path, str]] = [
        (optimized_path, optimized_path.name),
        (config_path, "config.json"),
        (report_path, "report.json"),
    ]
    seen_names = {name for _, name in artifacts}

    params_path = None
    if files.get("params_json"):
        params_path = _resolve_export_artifact(state, run_dir, files.get("params_json"), "params_json")
    else:
        inferred_params = optimized_path.with_suffix(".json")
        if inferred_params.exists() and inferred_params.is_file():
            params_path = inferred_params
        else:
            params_path = _optional_export_artifact(
                state,
                run_dir,
                f"{optimized_path.stem}.json",
                "params_json",
            )
    if params_path and params_path.name not in seen_names:
        artifacts.append((params_path, params_path.name))
        seen_names.add(params_path.name)

    state_path = _optional_state_snapshot(state, run_dir, report)
    if state_path and state_path.name not in seen_names:
        artifacts.append((state_path, state_path.name))

    strategy_name = _safe_export_name(report.get("strategy") or state.strategy or optimized_path.stem)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bundle_name = f"{strategy_name}_{timestamp}"
    exports_root = Path(state.user_data_dir) / "exports"
    export_dir = exports_root / bundle_name
    export_dir.mkdir(parents=True, exist_ok=True)

    copied_paths = [copy_to_output(path, export_dir, filename) for path, filename in artifacts]

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for copied_path in copied_paths:
            bundle.write(copied_path, arcname=copied_path.name)

    zip_filename = f"{bundle_name}.zip"
    zip_path = exports_root / zip_filename
    zip_path.write_bytes(zip_buffer.getvalue())

    return FileResponse(
        path=str(zip_path),
        filename=zip_filename,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


@router.get(
    "/run/{run_id}",
    summary="Compatibility alias for getting a single Auto-Quant run",
)
async def get_run_singular_alias(run_id: str) -> dict:
    return await get_status(run_id)


@router.get(
    "/runs",
    summary="List all pipeline runs",
)
async def list_runs() -> dict:
    return list_pipeline_runs()


@router.get(
    "/runs/{run_id}",
    summary="Compatibility alias for getting a single Auto-Quant run",
)
async def get_run_alias(run_id: str) -> dict:
    return await get_status(run_id)


@router.delete(
    "/runs/{run_id}",
    summary="Compatibility alias for cancelling a running Auto-Quant run",
)
async def cancel_run_alias(run_id: str) -> dict:
    result = await cancel_pipeline(run_id)
    return {
        "success": True,
        "message": "Cancellation requested",
        **result,
    }


@router.get(
    "/options",
    summary="Load saved Auto-Quant form options",
)
async def get_options(request: Request) -> AutoQuantOptions:
    """Load saved Auto-Quant form options from JSON file."""
    services = request.app.state.services
    settings = services.settings_store.load()
    return AutoQuantOptions(**load_options_data(settings.user_data_directory_path))


@router.post(
    "/options",
    summary="Save Auto-Quant form options",
)
async def save_options(body: AutoQuantOptions, request: Request) -> dict:
    """Save Auto-Quant form options to JSON file."""
    services = request.app.state.services
    settings = services.settings_store.load()
    return save_options_data(settings.user_data_directory_path, body.model_dump(mode="json"))


# ── Regime Detection endpoints ────────────────────────────────────────────────

@router.get(
    "/regime/{run_id}",
    summary="Get current regime classification and probabilities",
)
async def get_regime_status(run_id: str) -> dict:
    """Get current regime classification and probabilities for a pipeline run.
    
    Returns:
        Dictionary with current regime, probabilities, confidence, and history
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    return {
        "run_id": run_id,
        "current_regime": state.current_regime,
        "regime_probabilities": state.regime_probabilities,
        "regime_history": state.regime_history,
        "regime_detection_enabled": state.regime_detection_enabled,
        "regime_model_path": state.regime_model_path,
    }


@router.post(
    "/regime/train",
    summary="Train HMM model on historical data",
)
async def train_regime_model(
    body: dict,
    request: Request,
) -> dict:
    """Train HMM model on historical data for regime detection.
    
    Args:
        body: Dictionary with training parameters:
            - data_path: Path to historical OHLCV data (CSV or JSON)
            - n_components: Number of regimes (default 4)
            - covariance_type: Covariance type (default 'full')
            - n_iter: Maximum iterations (default 100)
    
    Returns:
        Dictionary with training status and model path
    """
    services = request.app.state.services
    settings = services.settings_store.load()
    
    # Import here to avoid circular dependency
    from ...services.auto_quant.regime_detection import create_regime_detector
    import pandas as pd
    
    data_path = body.get("data_path")
    if not data_path:
        raise HTTPException(status_code=400, detail="data_path is required")
    
    data_path = Path(data_path)
    if not data_path.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found: {data_path}")
    
    # Load data
    if data_path.suffix == ".csv":
        df = pd.read_csv(data_path)
    elif data_path.suffix == ".json":
        df = pd.read_json(data_path)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV or JSON.")
    
    # Validate data columns
    required_cols = ["open", "high", "low", "close", "volume"]
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing_cols}")
    
    # Create and train detector
    detector = create_regime_detector(
        n_components=body.get("n_components", 4),
        covariance_type=body.get("covariance_type", "full"),
        n_iter=body.get("n_iter", 100),
    )
    
    try:
        detector.train(df)
        
        # Save model
        model_dir = Path(settings.user_data_directory_path) / "regime_models"
        model_dir.mkdir(parents=True, exist_ok=True)
        model_path = model_dir / "regime_model.pkl"
        detector.save_model(model_path)
        
        return {
            "success": True,
            "message": "Regime model trained successfully",
            "model_path": str(model_path),
            "n_components": detector.n_components,
            "regime_mapping": detector.regime_mapping,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@router.post(
    "/regime/predict",
    summary="Predict regime for current market data",
)
async def predict_regime(
    body: dict,
    request: Request,
) -> dict:
    """Predict regime for current market data.
    
    Args:
        body: Dictionary with:
            - data: OHLCV data (list of dicts or DataFrame-like structure)
            - model_path: Path to trained model (optional, uses default)
    
    Returns:
        Dictionary with predicted regime and probabilities
    """
    services = request.app.state.services
    settings = services.settings_store.load()
    
    # Import here to avoid circular dependency
    from ...services.auto_quant.regime_detection import create_regime_detector
    import pandas as pd
    
    data = body.get("data")
    if not data:
        raise HTTPException(status_code=400, detail="data is required")
    
    # Convert data to DataFrame
    if isinstance(data, list):
        df = pd.DataFrame(data)
    else:
        df = pd.DataFrame(data)
    
    # Validate data columns
    required_cols = ["open", "high", "low", "close", "volume"]
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {missing_cols}")
    
    # Load model
    model_path = body.get("model_path")
    if not model_path:
        model_path = Path(settings.user_data_directory_path) / "regime_models" / "regime_model.pkl"
    else:
        model_path = Path(model_path)
    
    if not model_path.exists():
        raise HTTPException(status_code=404, detail=f"Model not found: {model_path}")
    
    # Create detector and load model
    detector = create_regime_detector()
    detector.load_model(model_path)
    
    try:
        result = detector.predict(df)
        return result.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


# ── Genetic Algorithm Evolution endpoints ─────────────────────────────────────

@router.get(
    "/genetic/status/{run_id}",
    summary="Get genetic evolution status for a pipeline run",
)
async def get_genetic_status(run_id: str) -> dict:
    """Get genetic evolution progress and best DNA for a pipeline run.
    
    Returns:
        Dictionary with genetic evolution status, best DNA, and history
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    return {
        "run_id": run_id,
        "genetic_evolution_enabled": state.genetic_evolution_enabled,
        "best_dna": state.best_dna,
        "ga_history": state.ga_history,
        "ga_converged": state.ga_converged,
        "ga_generations": state.ga_generations,
        "ga_population_size": state.ga_population_size,
    }


@router.post(
    "/genetic/evolve/{run_id}",
    summary="Start genetic evolution for a pipeline run",
)
async def start_genetic_evolution(
    run_id: str,
    body: dict,
    request: Request,
) -> dict:
    """Start genetic algorithm evolution for a pipeline run.
    
    Args:
        run_id: Pipeline run identifier
        body: Dictionary with GA configuration:
            - generations: Number of generations (default 20)
            - population_size: Population size (default 50)
            - elite_size: Elite size (default 2)
            - tournament_size: Tournament size (default 3)
            - crossover_rate: Crossover rate (default 0.8)
            - mutation_rate: Mutation rate (default 0.1)
            - mutation_strength: Mutation strength (default 0.1)
            - adaptive_mutation: Enable adaptive mutation (default True)
    
    Returns:
        Dictionary with evolution status
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    # Enable genetic evolution
    state.genetic_evolution_enabled = True
    
    # Update GA configuration
    state.ga_generations = body.get("generations", 20)
    state.ga_population_size = body.get("population_size", 50)
    
    # Save state
    from ...services.auto_quant.pipeline import _save_state_to_disk
    _save_state_to_disk(state)
    
    return {
        "success": True,
        "message": "Genetic evolution enabled for run",
        "run_id": run_id,
        "ga_generations": state.ga_generations,
        "ga_population_size": state.ga_population_size,
    }


@router.get(
    "/genetic/history/{run_id}",
    summary="Get genetic evolution history for a pipeline run",
)
async def get_genetic_history(run_id: str) -> dict:
    """Get genetic evolution history across generations.
    
    Returns:
        Dictionary with generation history and statistics
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    return {
        "run_id": run_id,
        "ga_history": state.ga_history,
        "ga_converged": state.ga_converged,
    }


# ── Reinforcement Learning endpoints ───────────────────────────────────────────

@router.get(
    "/rl/status/{run_id}",
    summary="Get RL training and deployment status for a pipeline run",
)
async def get_rl_status(run_id: str) -> dict:
    """Get RL training and deployment status for a pipeline run.
    
    Returns:
        Dictionary with RL status, model path, and performance metrics
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    return {
        "run_id": run_id,
        "rl_training_enabled": state.rl_training_enabled,
        "rl_deployment_enabled": state.rl_deployment_enabled,
        "rl_algorithm": state.rl_algorithm,
        "rl_total_timesteps": state.rl_total_timesteps,
        "rl_model_path": state.rl_model_path,
        "rl_performance": state.rl_performance,
        "rl_trades_count": len(state.rl_trades),
    }


@router.post(
    "/rl/train/{run_id}",
    summary="Enable RL training for a pipeline run",
)
async def enable_rl_training(
    run_id: str,
    body: dict,
    request: Request,
) -> dict:
    """Enable RL training for a pipeline run.
    
    Args:
        run_id: Pipeline run identifier
        body: Dictionary with RL configuration:
            - algorithm: Algorithm name (ppo, sac, a2c)
            - total_timesteps: Total training timesteps (default 1000000)
            - use_ensemble: Use ensemble of agents (default False)
    
    Returns:
        Dictionary with RL training configuration
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    # Enable RL training
    state.rl_training_enabled = True
    
    # Update RL configuration
    state.rl_algorithm = body.get("algorithm", "ppo")
    state.rl_total_timesteps = body.get("total_timesteps", 1000000)
    
    # Save state
    from ...services.auto_quant.pipeline import _save_state_to_disk
    _save_state_to_disk(state)
    
    return {
        "success": True,
        "message": "RL training enabled for run",
        "run_id": run_id,
        "rl_algorithm": state.rl_algorithm,
        "rl_total_timesteps": state.rl_total_timesteps,
    }


@router.post(
    "/rl/deploy/{run_id}",
    summary="Enable RL deployment for a pipeline run",
)
async def enable_rl_deployment(
    run_id: str,
    request: Request,
) -> dict:
    """Enable RL deployment for a pipeline run.
    
    Args:
        run_id: Pipeline run identifier
    
    Returns:
        Dictionary with RL deployment status
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    # Enable RL deployment
    state.rl_deployment_enabled = True
    
    # Save state
    from ...services.auto_quant.pipeline import _save_state_to_disk
    _save_state_to_disk(state)
    
    return {
        "success": True,
        "message": "RL deployment enabled for run",
        "run_id": run_id,
    }


@router.get(
    "/rl/trades/{run_id}",
    summary="Get RL agent trades for a pipeline run",
)
async def get_rl_trades(run_id: str) -> dict:
    """Get RL agent trading signals for a pipeline run.
    
    Returns:
        Dictionary with RL agent trades
    """
    state = _pl.get_state(run_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"Pipeline run '{run_id}' not found.")
    
    return {
        "run_id": run_id,
        "rl_trades": state.rl_trades,
        "trades_count": len(state.rl_trades),
    }


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/{run_id}")
async def pipeline_websocket(websocket: WebSocket, run_id: str) -> None:
    """Real-time event stream for a pipeline run.

    Messages have shape:
        { "stage": int, "status": str, "message": str, "progress": int, "data": {} }

    A null message (or connection close) signals pipeline completion.
    """
    await websocket.accept()

    state = _pl.get_state(run_id)
    if state is None:
        await websocket.send_json({"error": f"Pipeline run '{run_id}' not found."})
        await websocket.close()
        return

    # Send current state snapshot immediately so clients can restore on reconnect
    await websocket.send_json({
        "type": "snapshot",
        "stage": state.current_stage,
        "status": state.status,
        "message": "Connected to pipeline stream.",
        "progress": _pl._state_snapshot(state).get("progress", 0),
        "data": _pl._state_snapshot(state),
    })

    # If pipeline is already finished, just close
    if state.status in ("completed", "failed", "cancelled", "interrupted"):
        await websocket.close()
        return

    q = _pl.get_queue(run_id)
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_json({"type": "keepalive"})
                except Exception:
                    break
                continue

            if msg is None:
                # Pipeline done — send final snapshot then close
                final = _pl.get_state(run_id)
                if final:
                    await websocket.send_json({
                        "type": "final",
                        "stage": final.current_stage,
                        "status": final.status,
                        "message": final.error or "Pipeline finished.",
                        "progress": 100 if final.status == "completed" else -1,
                        "data": _pl._state_snapshot(final),
                    })
                break

            await websocket.send_json(msg)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _pl.release_queue(run_id, q)
