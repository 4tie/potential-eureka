---
name: Audit Sweep CB-03 to UX-06 + Autonomous Generator
description: All 14 audit items fixed; autonomous strategy generator tool wired end-to-end. Key decisions and file locations.
---

## Key decisions

**CB-03 (voice state)** — Already correct before this session. The useEffect at line ~302 of AIChatPanel.jsx already had `setIsListening(false)`. No change needed.

**CB-04 (stale closure)** — Changed `[results]` dep array to `[results, strategy, timeframe, pairs, timerange]` in BacktestForm.jsx. Also fixed profit key mapping: `profit_total ?? profit_mean ?? profit_total_pct` and `sharpe_ratio ?? sharpe`.

**CB-05 (hyperopt pairs)** — `_hyperopt_launcher` in ai_chat.py now reads `frontend_shared_state.json` via `settings.user_data_directory_path / "frontend_shared_state.json"` to get the active pair list. Falls back to `[]` on any exception.

**IF-01** — Created `.ai/APPLICATION_REFERENCE_GUIDE.md` as the canonical architecture reference.

**IF-02 (evaluate_plan fallback)** — Changed blind `sorted_snaps[1]` to filter by `trigger == "pre_plan"` first, then fall back to all snapshots sorted desc, taking `[0]`. Prevents picking the wrong snapshot when the agent creates pre_rewrite/hyperopt_apply snapshots during plan execution.

**IF-03 (post-mortem active_context)** — Added `...(activeStrategy?.name ? { active_context: { strategy_name: activeStrategy.name } } : {})` to the post-mortem `/api/ai/chat` call. Also added `activeStrategy` to `runPlanEvaluation` useCallback dep array.

**IF-04 (hyperopt kill switch)** — Added module-level `_active_hyperopt_processes: dict` in hyperopt.py. `_run_hyperopt_blocking` registers/deregisters the Popen object. New `POST /api/hyperopt/cancel/{session_id}` endpoint sends SIGTERM and marks session as cancelled.

**IF-05 (IStrategy AST guard)** — Three-stage guard in `_rewrite_strategy_file`: (1) string presence, (2) py_compile syntax check, (3) `ast.walk` verifying class with `IStrategy` in bases. All three must pass before writing.

**IF-06 (results caching)** — `_results_cache` dict with `_CACHE_TTL_SECS = 30.0` in results_list.py. `invalidate_results_cache()` helper exposed for future use after new backtests complete.

**IF-07 (rate limiting)** — Pure in-memory middleware in app.py using `defaultdict(list)` + monotonic timestamps. No new dependencies. Limits: `/api/ai/chat` 30/min, `/api/backtest/run` 10/min, `/api/hyperopt/run` 5/min.

**IF-08 (profile keys)** — Fixed in CB-04 section.

**UX-01 (lockedTimeframes localStorage)** — Lazy `useState` init reads `localStorage["strategylab:lockedTimeframes"]` (JSON array of strings → new Set). Sync useEffect writes on every change.

**UX-02 (Implement Plan button)** — Removed `isPlannerMode &&` from `hasPlan` check in `MessageBubble`. The button now appears on any assistant message containing `PLAN_MARKER` regardless of current chat mode.

**UX-06 (checkpoint spinner)** — `checkpointing` boolean state in AIChatPanel.jsx, set true/false around the `/api/ai/plan-checkpoint` fetch inside `handleImplementPlan`. Replaces the hint text in the input footer with "Creating strategy checkpoint…" + DaisyUI spinner when active.

## generate_autonomous_strategy (Part 2)

**Why:** User needs a way to create complete, hyperopt-ready strategies from plain English without writing any Python.

**Architecture:**
- Schema added to `AGENT_TOOLS` in agent_tools.py (required: strategy_name, description, trading_style; optional: baseline_timeframe)
- `_build_strategy_code(name, style, tf, desc)` module-level function generates a full IStrategy subclass (pandas_ta for indicators, IntParameter/DecimalParameter for all thresholds)
- `_build_strategy_json(name, style)` returns the companion parameter dict
- `_generate_autonomous_strategy` method reads `user_profile.json` then `frontend_shared_state.json` for preferred_pairs and preferred_timeframes; creates snapshot if overwriting
- Four styles: scalping (BB+RSI+ATR, 5m), swing (EMA+MACD+vol, 1h), trend_following (ADX+EMA+Donchian, 4h), mean_reversion (RSI+BB squeeze, 15m)
- TOOL_LABELS entry: "Generating autonomous strategy…"
- Registered in AgentToolExecutor.execute() dispatch dict

**How to apply:** When user says "build me a strategy" or "create a new scalper", the agent calls this tool. After generation, the recommended flow is: backtest → hyperopt to tune parameters.
