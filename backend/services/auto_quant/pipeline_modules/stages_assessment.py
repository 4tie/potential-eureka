"""Stage implementations for assessment stages (4, 5)."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from ..monte_carlo import run_monte_carlo
from ..policy import load_policy
from ..profit_lockin import compute_profit_giveback_metrics, extract_strategy_trades
from ..variants import copy_to_output, strategy_path_args
from .helpers import (
    _backtest_cmd,
    _classify_subprocess_error,
    _create_temp_config_with_max_open_trades,
    _emit,
    _extract_backtest_summary,
    _extract_last_close_price,
    _extract_per_pair_results,
    _fail_stage,
    _find_backtest_result,
    _pass_stage,
    _run_subprocess,
    _start_stage,
)
from .logging import _rlog, logger
from .scoring import aggregate_validation_notes, compute_score
from .state import (
    PipelineState,
    _Cancelled,
    _cancelled,
    _now,
    _save_state_to_disk,
    _write_versioned_json,
)


def _load_stage4_result(out_dir: Path) -> dict:
    stage4_path = out_dir / "stage4_result.json"
    if not stage4_path.exists():
        # Try glob for timestamped variant
        candidates = sorted(out_dir.glob("stage4_result*.json"),
                            key=lambda p: p.stat().st_mtime, reverse=True)
        if not candidates:
            return {}
        stage4_path = candidates[0]

    try:
        return json.loads(stage4_path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Stage Assessment | failed to read stage4 result %s: %s", stage4_path, exc)
        return {}


def _extract_oos_trades(out_dir: Path, strategy_name: str) -> list[dict]:
    """Load exported Stage 4 OOS trades for a strategy."""
    return extract_strategy_trades(_load_stage4_result(out_dir), strategy_name)


def _extract_oos_profit_ratios(out_dir: Path, strategy_name: str) -> list[float]:
    """Load per-trade profit ratios from the Stage 4 OOS backtest result on disk.

    Freqtrade's backtest JSON stores a ``trades`` list under
    ``strategy -> <name>``.  Each trade has a ``profit_ratio`` field.  We sort
    by ``close_date`` so the series is chronologically ordered before passing
    to the Monte Carlo engine.
    """
    trades = _extract_oos_trades(out_dir, strategy_name)
    if not trades:
        return []

    # Sort chronologically by close_date and extract profit_ratio
    try:
        trades_sorted = sorted(trades, key=lambda t: t.get("close_date", ""))
    except Exception as exc:
        logger.warning("Stage Assessment | failed to sort trades by close_date: %s", exc)
        trades_sorted = trades

    ratios = []
    for t in trades_sorted:
        pr = t.get("profit_ratio", t.get("profit_abs"))
        if pr is not None:
            ratios.append(float(pr))
    return ratios


async def _stage_risk_assessment(
    run_id: str, state: PipelineState, out_dir: Path, stress_result: dict
) -> dict | None:
    _start_stage(run_id, state, 4)  # Stage 4 in new workflow
    # Use selected_pairs from Stage 1 for context
    pairs_count = len(state.selected_pairs) if state.selected_pairs else 0
    _rlog(run_id, 4, logging.INFO,
          f"Stage 4 | Risk Assessment | pairs={pairs_count} | thresholds: "
          f"max_dd<{state.max_drawdown_threshold:.2f}  "
          f"win_rate>={state.min_win_rate:.2f}  "
          f"profit_factor>={state.min_profit_factor}  "
          f"sharpe>={state.min_sharpe}")
    _emit(run_id, 4, "running", "Computing risk metrics...", 80)

    await asyncio.sleep(0.5)  # small yield for WS flush

    if _cancelled(run_id):
        raise _Cancelled()

    max_dd_pct = stress_result.get("max_drawdown_account", 0.0)  # Already in decimal format
    wins = stress_result.get("wins", 0)
    losses = stress_result.get("losses", 0)
    draws = stress_result.get("draws", 0)
    total_trades = wins + losses + draws
    win_rate = (wins / total_trades) if total_trades > 0 else 0.0  # Already in decimal format
    profit_factor = stress_result.get("profit_factor", 0.0)
    sharpe = stress_result.get("sharpe_ratio", 0.0)
    _rlog(run_id, 4, logging.DEBUG,
          f"Stage 4 | Raw metrics: max_dd={max_dd_pct:.4f}  wins={wins}  losses={losses}"
          f"  draws={draws}  win_rate={win_rate:.4f}  profit_factor={profit_factor:.4f}"
          f"  sharpe={sharpe:.4f}")

    checks = {
        "max_drawdown": {"value": round(max_dd_pct, 4), "threshold": f"< {state.max_drawdown_threshold:.2f}",
                         "passed": max_dd_pct < state.max_drawdown_threshold},
        "win_rate": {"value": round(win_rate, 4), "threshold": f">= {state.min_win_rate:.2f}",
                     "passed": win_rate >= state.min_win_rate},
        "profit_factor": {"value": round(profit_factor, 4), "threshold": f">= {state.min_profit_factor}",
                          "passed": profit_factor >= state.min_profit_factor},
        "sharpe_ratio": {"value": round(sharpe, 4), "threshold": f">= {state.min_sharpe}",
                         "passed": sharpe >= state.min_sharpe or sharpe == 0.0},  # 0 = not computed
    }

    risk_data = {
        "max_drawdown_pct": round(max_dd_pct, 4),
        "win_rate_pct": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "sharpe_ratio": round(sharpe, 4),
        "total_trades": total_trades,
        "checks": checks,
    }

    optimized_strategy_name = f"{state.strategy}_Optimized"
    profit_giveback = compute_profit_giveback_metrics(
        _extract_oos_trades(out_dir, optimized_strategy_name)
    )
    risk_data["profit_giveback"] = profit_giveback

    failed_checks = [k for k, v in checks.items() if not v["passed"]]

    lines = []
    for k, v in checks.items():
        icon = "✓" if v["passed"] else "✗"
        lines.append(f"  {icon} {k}: {v['value']} (threshold: {v['threshold']})")
    check_summary = "Risk checks:\n" + "\n".join(lines)
    _rlog(run_id, 4, logging.INFO, f"Stage 4 | {check_summary}")
    _emit(run_id, 4, "running", check_summary, 85)

    if failed_checks:
        msg = f"Risk checks failed: {', '.join(failed_checks)}. Review metrics before deployment."
        _failed_vals = ", ".join(f"{k}={checks[k]['value']}" for k in failed_checks)
        _rlog(run_id, 4, logging.ERROR,
              f"Stage 4 | FAIL | failed_checks={failed_checks}  values={{ {_failed_vals} }}")
        _fail_stage(run_id, state, 4, msg, risk_data)
        return None

    if profit_giveback["peak_to_loss_count"] > 0:
        msg = (
            "Profit giveback failed: "
            f"{profit_giveback['peak_to_loss_count']} trade(s) reached tier-1 profit "
            "then closed negative."
        )
        _rlog(run_id, 4, logging.ERROR, f"Stage 4 | FAIL | {msg}")
        _fail_stage(run_id, state, 4, msg, risk_data)
        return None

    # ── Monte Carlo simulation ─────────────────────────────────────────────
    _rlog(run_id, 4, logging.INFO,
          "Stage 4 | Monte Carlo — extracting OOS trade profit series…")
    _emit(run_id, 4, "running", "Running Monte Carlo simulation (1 000 shuffles)…", 87)

    profit_ratios = _extract_oos_profit_ratios(out_dir, optimized_strategy_name)
    _rlog(run_id, 4, logging.DEBUG,
          f"Stage 4 | Monte Carlo | OOS trades extracted: {len(profit_ratios)}")

    mc_result = run_monte_carlo(profit_ratios, n=1000, threshold=state.monte_carlo_threshold)
    p95 = mc_result["p95_drawdown"]
    _rlog(run_id, 4, logging.INFO,
          f"Stage 4 | Monte Carlo | simulations={mc_result['simulations']}"
          f"  p5_dd={mc_result['p5_drawdown']:.2%}"
          f"  p95_dd={p95:.2%}"
          f"  median_return={mc_result['median_final_return']:.2%}"
          f"  passed={mc_result['passed']}"
          f"  threshold={state.monte_carlo_threshold:.2%}")

    risk_data["monte_carlo"] = mc_result

    if not mc_result["passed"]:
        p95_pct = round(p95 * 100, 1)
        threshold_pct = round(state.monte_carlo_threshold * 100, 1)
        msg = (
            f"Monte Carlo 95th-percentile drawdown of {p95_pct}% "
            f"exceeds {threshold_pct}% threshold."
        )
        _rlog(run_id, 4, logging.ERROR, f"Stage 4 | FAIL | {msg}")
        _fail_stage(run_id, state, 4, msg, risk_data)
        return None

    _rlog(run_id, 4, logging.INFO,
          f"Stage 4 | PASS | max_dd={max_dd_pct:.1f}%  win_rate={win_rate:.1f}%"
          f"  profit_factor={profit_factor:.2f}  sharpe={sharpe:.2f}"
          f"  mc_p95_dd={p95:.2%}")
    _pass_stage(run_id, state, 4,
                f"All risk checks passed — DD {max_dd_pct:.1f}%, "
                f"WR {win_rate:.1f}%, PF {profit_factor:.2f}, "
                f"MC p95 DD {round(p95 * 100, 1)}%",
                risk_data)
    return risk_data


async def _stage_joint_portfolio_backtest(
    run_id: str,
    state: PipelineState,
    out_dir: Path,
    optimized_path: Path,
) -> dict | None:
    """Stage 5: Portfolio Competition Backtest with capital constraints and balanced scoring.

    Performs:
    1. Joint portfolio backtest with max_open_trades constraint
    2. Portfolio and per-pair metrics extraction
    3. Capital starvation detection (70% trade count drop vs baseline)
    4. Dual-factor sizing calculation with division-by-zero guards
    5. Integrated risk assessment (Monte Carlo + Profit Giveback on portfolio)
    6. Non-blocking drawdown gateway with WebSocket events
    7. Balanced scoring: profit factor (30%), drawdown (20%), expectancy (15%), WFA stability (15%), trade count (10%), stress survival (10%)
    """
    _start_stage(run_id, state, 5)  # Stage 5: Portfolio Competition
    strategy_name = optimized_path.stem
    pairs_to_test = [p["key"] for p in state.selected_pairs] if state.selected_pairs else None

    if not pairs_to_test:
        _rlog(run_id, 5, logging.WARNING, "Stage 5 | No selected_pairs available, skipping portfolio backtest")
        state.portfolio_weights = {}
        _pass_stage(run_id, state, 5, "No pairs to test for portfolio backtest", {"portfolio_weights": {}})
        return {"portfolio_weights": {}}

    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | Joint Portfolio Competition | strategy={strategy_name} | pairs={len(pairs_to_test)} | "
          f"max_open_trades={state.max_open_trades}")
    _emit(run_id, 5, "running",
          f"Running joint portfolio backtest with {state.max_open_trades} max open trades...",
          75)

    # ── Sub-step 5.1: Joint Portfolio Backtest Execution ───────────────────────
    try:
        # Create temporary config with max_open_trades constraint
        temp_config = _create_temp_config_with_max_open_trades(
            state.config_file, state.max_open_trades, out_dir
        )

        result_prefix = str(out_dir / "stage5_portfolio")
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

        _rlog(run_id, 5, logging.DEBUG, f"Stage 5 | Spawning subprocess: {' '.join(cmd)}")
        rc, stdout, stderr = await _run_subprocess(run_id, cmd, stage=5)

        # Cleanup temp config
        try:
            Path(temp_config).unlink(missing_ok=True)
        except Exception as exc:
            _rlog(run_id, 5, logging.WARNING, f"Stage 5 | Failed to delete temp config: {exc}")

        if _cancelled(run_id):
            raise _Cancelled()

        if rc != 0:
            msg = _classify_subprocess_error(rc, stdout, "Stage 5 (Joint Portfolio Backtest)")
            _rlog(run_id, 5, logging.ERROR, f"Stage 5 | FAIL | {msg}")
            _fail_stage(run_id, state, 5, msg)
            return None

    except Exception as exc:
        msg = f"Joint portfolio backtest failed: {exc}"
        _rlog(run_id, 5, logging.ERROR, f"Stage 5 | FAIL | {msg}")
        _fail_stage(run_id, state, 5, msg)
        return None

    # ── Sub-step 5.2: Portfolio Metrics Extraction ───────────────────────────
    result_data = _find_backtest_result(out_dir, "stage5_portfolio", state.user_data_dir)
    portfolio_summary = _extract_backtest_summary(result_data, strategy_name)
    per_pair = _extract_per_pair_results(result_data, strategy_name)

    portfolio_profit = portfolio_summary.get("profit_total_abs", 0.0)
    portfolio_max_dd = portfolio_summary.get("max_drawdown_account", 0.0)
    portfolio_trades = portfolio_summary.get("total_trades", 0)

    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | Portfolio metrics: profit={portfolio_profit:.4f} max_dd={portfolio_max_dd:.4f} trades={portfolio_trades}")

    # Extract last close price for each pair
    pair_prices = {}
    for pair_data in per_pair:
        pair_key = pair_data.get("key", "")
        current_price = _extract_last_close_price(pair_key, state.user_data_dir, state.in_sample_range)
        pair_prices[pair_key] = current_price
        pair_data["current_price"] = current_price

    # CAPITAL STARVATION ALERT: Compare trade counts vs baseline
    starvation_warnings = []
    for pair_data in per_pair:
        pair_key = pair_data.get("key", "")
        competition_trades = pair_data.get("trades", 0)
        baseline_trades = state.baseline_trade_counts.get(pair_key, 0)

        if baseline_trades > 0:
            drop_pct = (baseline_trades - competition_trades) / baseline_trades
            if drop_pct > 0.70:  # More than 70% drop
                warning = f"CAPITAL STARVATION: {pair_key} trade count dropped {drop_pct:.1%} " \
                          f"({baseline_trades} → {competition_trades})"
                starvation_warnings.append(warning)
                _rlog(run_id, 5, logging.WARNING, f"Stage 5 | {warning}")

    # ── Sub-step 5.3: Dual-Factor Sizing Calculation ───────────────────────────
    target_risk_pct = 0.02  # 2% risk per trade
    raw_weights = {}
    state.portfolio_weights = {}

    for pair_data in per_pair:
        pair_key = pair_data.get("key", "")
        atr_value = pair_data.get("atr", 0.01)
        current_price = pair_prices.get(pair_key, 1.0)
        stability_score = state.stability_scores.get(pair_key, 50.0)

        # Division-by-zero guards
        atr_pct = atr_value / current_price if current_price > 0 else 0.01
        if atr_pct <= 0:
            atr_pct = 0.01

        raw_weight = (target_risk_pct / atr_pct) * (stability_score / 100.0)
        raw_weights[pair_key] = raw_weight

    # NORMALIZATION BUG GUARD: If sum is 0, fallback to equal weights
    sum_raw_weights = sum(raw_weights.values())
    if sum_raw_weights == 0:
        _rlog(run_id, 5, logging.WARNING,
              "Stage 5 | Sum of raw weights is 0, falling back to equal weight distribution")
        equal_weight = 1.0 / len(per_pair)
        for pair_data in per_pair:
            pair_key = pair_data.get("key", "")
            state.portfolio_weights[pair_key] = equal_weight
    else:
        for pair_key, raw_weight in raw_weights.items():
            normalized_weight = raw_weight / sum_raw_weights
            state.portfolio_weights[pair_key] = normalized_weight

    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | Portfolio weights computed for {len(state.portfolio_weights)} pairs")

    # ── Sub-step 5.4: Non-Blocking Drawdown Gateway ───────────────────────────
    if portfolio_max_dd > state.max_drawdown_threshold:
        warning_msg = (f"Portfolio max drawdown {portfolio_max_dd:.2%} exceeds threshold "
                      f"{state.max_drawdown_threshold:.2%}")
        _rlog(run_id, 5, logging.WARNING, f"Stage 5 | {warning_msg}")
        _emit(run_id, 5, "running", warning_msg, 80,
              msg_type="portfolio_drawdown_warning",
              data={
                  "current_drawdown": round(portfolio_max_dd, 4),
                  "threshold": state.max_drawdown_threshold,
                  "exceeds_threshold": True,
              })

    # ── Sub-step 5.5: Integrated Risk Assessment (Monte Carlo + Profit Giveback) ──
    _rlog(run_id, 5, logging.INFO,
          "Stage 5 | Running integrated risk assessment on portfolio trades...")
    _emit(run_id, 5, "running", "Running Monte Carlo simulation on portfolio trades...", 85)

    # Extract all portfolio trades
    portfolio_trades_list = extract_strategy_trades(result_data, strategy_name)
    profit_ratios = []
    for trade in portfolio_trades_list:
        pr = trade.get("profit_ratio", trade.get("profit_abs"))
        if pr is not None:
            profit_ratios.append(float(pr))

    # Monte Carlo simulation
    mc_result = run_monte_carlo(profit_ratios, n=1000, threshold=state.monte_carlo_threshold)
    p95 = mc_result["p95_drawdown"]

    # Profit Giveback metrics
    profit_giveback = compute_profit_giveback_metrics(portfolio_trades_list)

    # ── Sub-step 5.6: Balanced Scoring with Specific Weights ─────────────────────
    _rlog(run_id, 5, logging.INFO, "Stage 5 | Computing balanced portfolio score...")
    
    # Extract metrics for scoring
    profit_factor = portfolio_summary.get("profit_factor", 1.0)
    max_drawdown = portfolio_max_dd
    expectancy = portfolio_summary.get("profit_mean_pct", 0.0)
    trade_count = portfolio_trades
    
    # WFA stability score (from Stage 4 stability_scores)
    stability_values = list((state.stability_scores or {}).values())
    wfa_stability = sum(stability_values) / len(stability_values) if stability_values else 50.0
    
    # Stress survival score (from Stage 4 stress test results)
    # Use average stability score as proxy for stress survival
    stress_survival = wfa_stability  # Placeholder - should be from actual stress test results
    
    # Normalize metrics to 0-100 scale
    # Profit factor: higher is better, normalize around 1.5
    pf_score = min(100, max(0, (profit_factor - 0.5) / 2.0 * 100))
    
    # Drawdown: lower is better, normalize around 20%
    dd_score = min(100, max(0, (0.25 - max_drawdown) / 0.25 * 100))
    
    # Expectancy: higher is better, normalize around 1%
    exp_score = min(100, max(0, expectancy / 0.02 * 100))
    
    # WFA stability: already 0-100
    wfa_score = wfa_stability
    
    # Trade count: normalize around 100 trades
    tc_score = min(100, max(0, trade_count / 200 * 100))
    
    # Stress survival: already 0-100
    stress_score = stress_survival
    
    # Apply weights: PF 30%, DD 20%, Expectancy 15%, WFA 15%, Trade Count 10%, Stress 10%
    balanced_score = (
        pf_score * 0.30 +
        dd_score * 0.20 +
        exp_score * 0.15 +
        wfa_score * 0.15 +
        tc_score * 0.10 +
        stress_score * 0.10
    )
    
    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | Balanced score: {balanced_score:.1f} "
          f"(PF={pf_score:.1f}, DD={dd_score:.1f}, Exp={exp_score:.1f}, "
          f"WFA={wfa_score:.1f}, TC={tc_score:.1f}, Stress={stress_score:.1f})")
    
    # ── Sub-step 5.7: Winner Selection and Ranking ───────────────────────────────
    # For now, since we only have one strategy, it's the winner
    # In a multi-candidate scenario, we would compare multiple strategies
    winner = {
        "strategy": strategy_name,
        "score": round(balanced_score, 1),
        "reason": f"Best balance of PF ({profit_factor:.2f}), drawdown ({max_drawdown:.2%}), WFA stability ({wfa_stability:.1f})"
    }
    
    ranking = [winner]  # Single candidate
    
    _rlog(run_id, 5, logging.INFO, f"Stage 5 | Winner: {winner['strategy']} with score {winner['score']}")

    # ── Sub-step 5.8: WebSocket Event Emission ───────────────────────────────────
    portfolio_result_data = {
        "portfolio_metrics": {
            "profit_total_abs": round(portfolio_profit, 4),
            "max_drawdown_account": round(portfolio_max_dd, 4),
            "total_trades": portfolio_trades,
        },
        "per_pair_metrics": per_pair,
        "portfolio_weights": state.portfolio_weights,
        "monte_carlo": mc_result,
        "profit_giveback": profit_giveback,
        "starvation_warnings": starvation_warnings,
        "balanced_score": round(balanced_score, 2),
        "winner": winner,
        "ranking": ranking,
    }

    _emit(run_id, 5, "running",
          f"Portfolio backtest complete — {len(per_pair)} pairs, weights calculated",
          90,
          msg_type="portfolio_backtest_result",
          data=portfolio_result_data)

    _rlog(run_id, 5, logging.INFO,
          f"Stage 5 | PASS | portfolio_profit={portfolio_profit:.4f} "
          f"max_dd={portfolio_max_dd:.4f} trades={portfolio_trades} "
          f"mc_p95_dd={p95:.4f}")

    _pass_stage(run_id, state, 5,
                f"Joint portfolio backtest complete — {len(per_pair)} pairs, "
                f"portfolio weights calculated, MC p95 DD {round(p95 * 100, 1)}%",
                portfolio_result_data)

    return portfolio_result_data


async def _stage_delivery(
    run_id: str,
    state: PipelineState,
    out_dir: Path,
    optimized_path: Path,
    best_params: dict,
    s1_result: dict,
    oos_result: dict,
    stress_result: dict,
    risk_result: dict,
) -> None:
    _start_stage(run_id, state, 6)  # Stage 6: Delivery
    _rlog(run_id, 6, logging.INFO,
          f"Stage 6 | Delivery | writing config.json + report.json + {optimized_path.name}")
    _emit(run_id, 6, "running", "Generating output files and final report...", 90)

    await asyncio.sleep(0.5)

    # Use selected_pairs from Stage 1 pre-selection
    winning_pairs_list = state.selected_pairs or state.winning_pairs or []

    # Write optimized config.json
    config_out = out_dir / "config.json"
    _rlog(run_id, 6, logging.DEBUG, f"Stage 6 | Reading base config: {state.config_file}")
    try:
        base_config = json.loads(Path(state.config_file).read_text(encoding="utf-8"))
    except Exception:
        _rlog(run_id, 6, logging.WARNING,
              f"Stage 6 | Could not read base config {state.config_file} — starting from empty dict")
        base_config = {}

    # Ensure critical fields from pipeline state are set in config
    if state.timeframe:
        base_config["timeframe"] = state.timeframe
    if state.exchange:
        base_config.setdefault("exchange", {})["name"] = state.exchange

    # Inject optimized params into config
    params_dict = best_params.get("params_dict", {})
    if "minimal_roi" in params_dict:
        base_config["minimal_roi"] = params_dict["minimal_roi"]
    if "stoploss" in params_dict:
        base_config["stoploss"] = params_dict["stoploss"]
    for key in ("trailing_stop", "trailing_stop_positive",
                "trailing_stop_positive_offset", "trailing_only_offset_is_reached"):
        if key in params_dict:
            base_config[key] = params_dict[key]

    if winning_pairs_list:
        base_config.setdefault("exchange", {})["pair_whitelist"] = [p["key"] for p in winning_pairs_list]

    state.artifact_versions.update(
        _write_versioned_json(out_dir, "config", base_config, legacy_name="config.json")
    )
    _rlog(run_id, 6, logging.DEBUG, f"Stage 6 | Written config.json → {config_out}")

    # Assemble report with failure tolerance
    # Compute OOS equity curve from the ordered profit-ratio series
    optimized_strategy_name = optimized_path.stem
    oos_profit_ratios = []
    profit_giveback = {}
    oos_equity_curve: list[float] = []
    
    try:
        oos_profit_ratios = _extract_oos_profit_ratios(out_dir, optimized_strategy_name)
        profit_giveback = risk_result.get("profit_giveback") or compute_profit_giveback_metrics(
            _extract_oos_trades(out_dir, optimized_strategy_name)
        )
        if oos_profit_ratios:
            equity = 1.0
            oos_equity_curve.append(round(equity, 6))  # baseline starting point
            for pr in oos_profit_ratios:
                equity *= 1.0 + pr
                oos_equity_curve.append(round(equity, 6))
        _rlog(run_id, 6, logging.DEBUG,
              f"Stage 6 | Equity curve: {len(oos_equity_curve)} points  "
              f"final={oos_equity_curve[-1]:.4f}" if oos_equity_curve else
              "Stage 6 | Equity curve: no OOS trades")
    except Exception as exc:
        _rlog(run_id, 6, logging.WARNING, f"Stage 6 | Failed to compute equity curve: {exc}")
        state.validation_notes.append(f"Equity curve computation failed: {exc}. Report generated without equity data.")

    policy = load_policy()
    try:
        metrics = dict(s1_result or {})
        metrics.update(risk_result.get("portfolio_metrics", {}))
        stability_values = list((state.stability_scores or {}).values())
        robustness_score = sum(stability_values) / len(stability_values) if stability_values else 0.5
        wfo_pass_rate = None
        latest_window_passed = None
        if state.wfo_windows:
            passed = len([w for w in state.wfo_windows if w.get("passed")])
            wfo_pass_rate = passed / len(state.wfo_windows) * 100 if state.wfo_windows else 0.5
            # Check if the latest (last) window passed - this is the most recent window
            if state.wfo_windows:
                latest_window_passed = state.wfo_windows[-1].get("passed", True)
        target_pairs = max(1, policy.pair_target_count(state.trading_style, state.risk_profile))
        pair_consistency = min(100.0, len(state.selected_pairs or []) / target_pairs * 100.0) / 100.0
        
        # Build metrics for scoring
        scoring_metrics = {
            "expectancy": metrics.get("profit_mean_pct", 0.0),
            "profit_factor": metrics.get("profit_factor", 1.0),
            "max_drawdown": metrics.get("max_drawdown_account", 0.0),
            "robustness_score": robustness_score,
            "oos_retention": metrics.get("oos_profit_retention", 0.5),
            "walk_forward_score": wfo_pass_rate / 100.0 if wfo_pass_rate else 0.5,
            "pair_consistency": pair_consistency,
            "latest_window_passed": latest_window_passed,
        }
        
        # Compute score using scoring module
        score_result = compute_score(run_id, state, scoring_metrics)
        state.score = score_result["score"]
        state.validation_status = score_result["validation_status"]
        state.readiness_label = score_result["readiness_label"]
        state.score_explanation = score_result["score_explanation"]
        
        # Aggregate validation notes
        state.validation_notes = aggregate_validation_notes(state)
    except Exception as exc:
        _rlog(run_id, 6, logging.WARNING, f"Stage 6 | Score calculation failed: {exc}")
        state.score = 0.0
        state.validation_status = "failed"
        state.readiness_label = "Not Ready"
        state.score_explanation = {"error": str(exc)}
        state.validation_notes.append(f"Score calculation failed: {exc}. Review raw validation metrics.")
        import traceback
        _rlog(run_id, 6, logging.ERROR, traceback.format_exc())

    report = {
        "run_id": run_id,
        "strategy": state.strategy,
        "original_strategy": state.original_strategy,
        "original_strategy_hash": state.original_strategy_hash,
        "optimized_strategy": optimized_path.stem,
        "strategy_source": state.strategy_source,
        "trading_style": state.trading_style,
        "risk_profile": state.risk_profile,
        "analysis_depth": state.analysis_depth,
        "timeframe": state.timeframe,
        "selected_timeframe": state.selected_timeframe or state.timeframe,
        "selected_pair_universe": state.selected_pair_universe,
        "in_sample_range": state.in_sample_range,
        "out_sample_range": state.out_sample_range,
        "exchange": state.exchange,
        "created_at": state.created_at,
        "completed_at": _now(),
        "stages": [
            {"index": s.index, "name": s.name, "status": s.status,
             "message": s.message, "data": s.data}
            for s in state.stages
        ],
        "best_params": best_params,
        "run_config_snapshot": state.run_config_snapshot,
        "policy_versions": state.policy_versions,
        "validation_notes": state.validation_notes,
        "discovery_results": state.discovery_results,
        "score": state.score,
        "validation_status": state.validation_status,
        "readiness_label": state.readiness_label,
        "score_explanation": state.score_explanation,
        "sanity_backtest": s1_result,
        "oos_validation": oos_result,
        "stress_test": {
            "winning_pairs": [p["key"] for p in state.winning_pairs] if state.winning_pairs else [],
            "failing_pairs": stress_result.get("failing_pairs", []),
            "per_pair": stress_result.get("per_pair", []),
        },
        "filtered_pairs": s1_result.get("filtered_pairs", []) if s1_result else [],
        "retry_history": state.retry_history or [],
        "wfo_status": {
            "enabled": state.wfo_enabled,
            "ran": bool(state.wfo_windows),
            "windows_count": len(state.wfo_windows) if state.wfo_windows else 0,
            "skip_reason": state.wfo_skip_reason,
        },
        "excluded_time_windows": state.excluded_time_windows,
        "risk": risk_result,
        "monte_carlo": risk_result.get("monte_carlo"),
        "profit_giveback": profit_giveback,
        "equity_curves": {
            "oos": oos_equity_curve,
        },
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
        "files": {
            "optimized_strategy": f"{optimized_path.stem}.py",
            "config": "config.json",
            "report": "report.json",
        },
        "ensemble_enabled": state.ensemble_enabled,
        "ensemble_weights": {
            k: v for k, v in best_params.get("params_dict", {}).items()
            if k in ("rsi_weight", "macd_weight", "bb_weight", "consensus_threshold")
        } if state.ensemble_enabled else {},
        "sensitivity": state.sensitivity,
        "strategy_variants": state.strategy_variants,
        "artifact_versions": state.artifact_versions,
    }

    # Write report with failure tolerance
    try:
        state.artifact_versions.update(
            _write_versioned_json(out_dir, "report", report, legacy_name="report.json")
        )
        report["artifact_versions"] = state.artifact_versions
        _write_versioned_json(out_dir, "report", report, legacy_name="report.json")
        report_path = out_dir / "report.json"
        _rlog(run_id, 6, logging.DEBUG, f"Stage 6 | Written report.json → {report_path}")
    except Exception as exc:
        _rlog(run_id, 6, logging.ERROR, f"Stage 6 | Failed to write report.json: {exc}")
        state.validation_notes.append(f"Report write failed: {exc}. Report may be incomplete.")
        import traceback
        _rlog(run_id, 6, logging.ERROR, traceback.format_exc())
        # Don't fail the pipeline - continue with what we have

    # Inject winning pairs whitelist, ATR values, stability scores, and custom_stake_amount into the optimized strategy
    # Use selected_pairs from Stage 1 pre-selection, fallback to winning_pairs
    pairs_to_inject = state.selected_pairs or state.winning_pairs
    atr_values_final = {}
    stability_scores_final = {}
    injection_failed = False
    injection_error = None
    
    if pairs_to_inject:
        _rlog(run_id, 6, logging.INFO,
              f"Stage 6 | Injecting ATR sizing and stability scoring into {optimized_path.name}")
        try:
            strategy_content = optimized_path.read_text(encoding="utf-8")

            # ── Step 1: Extract ATR values from Phase 4 portfolio results ─────────
            # Build mapping from Phase 4 per_pair_metrics for high-fidelity ATR values
            portfolio_per_pair = risk_result.get("per_pair_metrics", [])
            portfolio_atr_map = {p["key"]: p.get("atr", 0.01) for p in portfolio_per_pair}
            
            # Build whitelist array and ATR dictionary using Phase 4 data
            whitelist_array = [p["key"] for p in pairs_to_inject]
            atr_dict_str = "{\n"
            for p in pairs_to_inject:
                pair = p["key"]
                # Use Phase 4 ATR values if available, fallback to pair data or default
                atr_value = portfolio_atr_map.get(pair, p.get("atr", p.get("avg_profit_abs", 0.01)))
                atr_values_final[pair] = atr_value
                atr_dict_str += f'        "{pair}": {atr_value},\n'
            atr_dict_str += "    }"
            
            # ── Step 2: Build stability dictionary from Phase 3 results ───────────
            stability_dict_str = "{\n"
            for p in pairs_to_inject:
                pair = p["key"]
                stability_score = state.stability_scores.get(pair, 50.0)  # fallback to 50%
                stability_scores_final[pair] = stability_score
                stability_dict_str += f'        "{pair}": {stability_score},\n'
            stability_dict_str += "    }"
            
            # ── Step 3: Inject blocked hours/days from trading window analysis ──
            excluded_hours = state.excluded_time_windows.get("excluded_hours", [])
            excluded_days = state.excluded_time_windows.get("excluded_days", [])
            
            # ── Step 4: Inject dictionaries after INTERFACE_VERSION ─────────────
            class_line = f"class {optimized_path.stem}(IStrategy):"
            if class_line in strategy_content:
                lines = strategy_content.split('\n')
                for i, line in enumerate(lines):
                    if class_line in line:
                        # Insert dictionaries after INTERFACE_VERSION line
                        insert_idx = i + 2  # after INTERFACE_VERSION line
                        atr_dict_line = f"    atr_dict = {atr_dict_str}"
                        stability_dict_line = f"    stability_dict = {stability_dict_str}"
                        blocked_hours_line = f"    blocked_hours = {excluded_hours}"
                        blocked_days_line = f"    blocked_days = {excluded_days}"
                        lines.insert(insert_idx, atr_dict_line)
                        lines.insert(insert_idx + 1, stability_dict_line)
                        lines.insert(insert_idx + 2, blocked_hours_line)
                        lines.insert(insert_idx + 3, blocked_days_line)
                        break
                strategy_content = '\n'.join(lines)
            
            # ── Step 5: Inject custom_stake_amount method ───────────────────────
            custom_stake_amount_code = '''
    def custom_stake_amount(self, pair: str, current_time, current_rate: float,
                            proposed_stake: float, min_stake: float | None, max_stake: float,
                            leverage: float, entry_tag: str | None, side: str, **kwargs) -> float:
        """Calculate position size based on ATR and stability score for dual-factor sizing.
        
        Formula: position_size = proposed_stake * (target_risk_pct / (atr / current_rate)) * (stability_score / 100)
        
        This method implements production-grade edge-case guards to prevent exchange execution errors:
        - Division-by-zero guard for ATR and current_rate
        - KeyError guard using .get() for dictionary access
        - Zero-stability fallback to min_stake
        - Clamping to exchange limits
        """
        target_risk_pct = 0.02  # 2% risk per trade
        
        # Defensive fallback for exchange limits
        exchange_min = min_stake if min_stake is not None else 10.0
        exchange_max = max_stake if max_stake is not None else (proposed_stake * 2)
        
        # DIVISION-BY-ZERO GUARD: Check if atr or current_rate is invalid
        atr = self.atr_dict.get(pair, current_rate * 0.02)  # fallback to 2% of price
        if atr <= 0 or current_rate <= 0:
            return exchange_min
        
        # Calculate ATR percentage
        atr_pct = atr / current_rate
        if atr_pct <= 0:
            return exchange_min
        
        # KEYERROR RUNTIME GUARD: Use .get() for stability_dict access
        stability_score = self.stability_dict.get(pair, 50.0)  # fallback to 50%
        
        # Apply dual-factor sizing formula
        position_size = proposed_stake * (target_risk_pct / atr_pct) * (stability_score / 100.0)
        
        # ZERO-STABILITY FALLBACK: If position_size is 0, return min_stake
        if position_size == 0:
            return exchange_min
        
        # CLAMPING: Ensure position size is within exchange limits
        position_size = max(exchange_min, min(exchange_max, position_size))
        
        return position_size
'''
            
            # Inject custom_stake_amount method after the class definition
            if class_line in strategy_content:
                lines = strategy_content.split('\n')
                for i, line in enumerate(lines):
                    if class_line in line:
                        # Find the end of the class (last method or attribute)
                        # Insert custom_stake_amount before the last method
                        # We'll insert it after the last existing method
                        insert_idx = len(lines) - 1
                        lines.insert(insert_idx, custom_stake_amount_code)
                        break
                strategy_content = '\n'.join(lines)
            
            # ── Step 6: Write final deployment file with versioning ───────────────
            optimized_path.write_text(strategy_content, encoding="utf-8")
            copy_to_output(optimized_path, out_dir, f"{optimized_path.stem}.py")
            
            # Create versioned copy of final strategy
            versioned_strategy = out_dir / f"{optimized_path.stem}_final_v1.py"
            versioned_strategy.write_text(strategy_content, encoding="utf-8")
            state.artifact_versions[f"{optimized_path.stem}_final_v1"] = versioned_strategy.name
            
            _rlog(run_id, 6, logging.INFO,
                  f"Stage 6 | Injected ATR dict ({len(atr_values_final)} pairs), "
                  f"stability dict ({len(stability_scores_final)} pairs), "
                  f"and custom_stake_amount method")
            if excluded_hours or excluded_days:
                _rlog(run_id, 6, logging.DEBUG,
                      f"Stage 6 | Injected trading window filters: hours={excluded_hours}, days={excluded_days}")
        except Exception as e:
            injection_failed = True
            injection_error = str(e)
            _rlog(run_id, 6, logging.ERROR,
                  f"Stage 6 | Failed to inject ATR sizing and stability scoring: {e}")
            state.validation_notes.append(f"Strategy injection failed: {e}. Report generated with basic strategy.")
            import traceback
            _rlog(run_id, 6, logging.ERROR, traceback.format_exc())

    # ── Write sidecar JSON next to the optimized strategy ────────────────────
    # Every final strategy output must ship as both .py + .json together.
    # We parse the finished .py file so the sidecar reflects all injected
    # values (ROI, stoploss, trailing, buy/sell defaults).
    try:
        from ...strategy.strategy_source import StrategySourceParser as _SP
        _strategies_dir = Path(state.user_data_dir) / "strategies"
        _parser = _SP(_strategies_dir, _strategies_dir / "versions")
        _parsed = _parser.parse(optimized_path)
        _parser.create_default_sidecar_json(optimized_path, _parsed)
        _sidecar = optimized_path.with_suffix(".json")
        if _sidecar.exists():
            copy_to_output(_sidecar, out_dir, f"{optimized_path.stem}.json")
            _rlog(run_id, 6, logging.INFO,
                  f"Stage 6 | Written sidecar {optimized_path.stem}.json → out_dir")
            report.setdefault("files", {})["params_json"] = f"{optimized_path.stem}.json"
    except Exception as _sidecar_exc:
        _rlog(run_id, 6, logging.WARNING,
              f"Stage 6 | Could not generate sidecar JSON: {_sidecar_exc}")

    state.report = report

    _rlog(run_id, 6, logging.INFO,
          f"Stage 6 | PASS | files ready: {optimized_path.name}  {optimized_path.stem}.json  config.json  report.json"
          f"  winning_pairs={len(winning_pairs_list)}")
    
    # ── Emit delivery_complete WebSocket event ───────────────────────────────
    _emit(run_id, 6, "running", "Final strategy deployment complete.", 100,
          msg_type="delivery_complete",
          data={
              "output_file_path": str(optimized_path),
              "passing_pairs_list": [p["key"] for p in pairs_to_inject] if pairs_to_inject else [],
              "stability_scores": stability_scores_final,
              "atr_values": atr_values_final,
          })
    
    _pass_stage(run_id, state, 6,
                f"Delivery complete — {optimized_path.name} and config.json ready for download.",
                {
                    "status": "passed",
                    "readiness": "dry_run_ready",
                    "files": {
                        "strategy_py": f"{optimized_path.stem}.py",
                        "strategy_json": f"{optimized_path.stem}.json",
                        "config": "config.json",
                        "report": "report.json",
                    },
                    "final_summary": {
                        "timeframe": state.timeframe,
                        "pairs": [p["key"] for p in winning_pairs_list] if winning_pairs_list else [],
                        "profit_factor": round(metrics.get("profit_factor", 1.0), 2),
                        "max_drawdown": round(metrics.get("max_drawdown_account", 0.0), 2),
                        "wfa_pass": wfo_pass_rate / 100.0 > 0.7 if wfo_pass_rate else True,
                        "stress_pass": robustness_score > 50.0,
                    },
                    "optimized_strategy": f"{optimized_path.stem}.py",
                    "config_file": "config.json",
                    "winning_pairs_count": len(winning_pairs_list),
                })
