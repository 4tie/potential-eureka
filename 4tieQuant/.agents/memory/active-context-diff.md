---
name: Active Strategy Context + Code Diff
description: Architecture of AI context injection and the interactive code diff review flow.
---

## Active Strategy Context

**Frontend flow:**
- `App.jsx` holds `activeStrategy: { name, hasJson } | null` and `proposedCode: string | null`.
- `StrategyEditorTab` receives `onStrategyChange` and calls it with `{ name, hasJson }` when a strategy loads (inside `loadStrategy`).
- `AIChatPanel` receives `activeTab` and `activeStrategy` as props; when `activeTab === "strategy-editor"` and `activeStrategy` is set, it adds `active_context: { strategy_name }` to every `/api/ai/chat` POST body.

**Backend flow:**
- `ChatRequest` (in `ai_chat.py`) has `active_context: dict | None = None`.
- `_build_strategy_context_message()` reads `{strategies_dir}/{name}.py` (and `.json` if exists), validates the name with `^[\w\-]+$`, and returns a second `{"role": "system"}` message injected right after the main SYSTEM_PROMPT and before history.
- The injected message instructs the model to output complete Python files in a single ```python``` block when proposing changes, enabling truncation-free diffs.

**Why:** The backend reads from disk (not from frontend state) for simplicity and payload size. Users should save before asking the AI for code help — this is an acceptable trade-off.

## Interactive Code Diff View

**Detection:** After each successful `/api/ai/chat` response, `AIChatPanel` calls `extractPythonCode(content)` (regex `/```python\n([\s\S]*?)```/g`), picks the longest block, and calls `onProposedCode(code)` if in editor context.

**State:** `App.jsx` sets `proposedCode` state; it's passed to `StrategyEditorTab` as a prop.

**DiffView component (in StrategyEditorTab.jsx):**
- `computeLineDiff()` — LCS-based line diff capped at 800 lines per side using `Uint32Array` DP table.
- `buildSideBySide()` — pairs delete/insert ops into `{ lText, lType, rText, rType }` rows for side-by-side render.
- Side-by-side panes: left = current, right = AI proposed. Deleted lines red, inserted lines green, equal lines neutral.
- Shows when `isDiffMode = !!proposedCode && activeFile === "py" && !!selected`.

**Accept/Reject:**
- Accept → POSTs to `/api/strategies/save` with the proposed code, updates `pyContent`/`savedPy`, calls `onAcceptProposal()` in App which clears `proposedCode`.
- Reject → calls `onRejectProposal()` in App which clears `proposedCode`; editor content is untouched.

**Banner:** slides in above the header bar with a warning icon and the Accept/Reject buttons.

## Planner Mode (chatMode state)

**Toggle:** The mode-icon button in the chat panel header toggles `chatMode` between `'agent'` and `'planner'`. The tab trigger and panel border also switch color (primary → accent). Resetting chat or changing tabs does not auto-reset the mode.

**Frontend payload:** `chat_mode: chatMode` is always included in the `/api/ai/chat` POST body.

**Backend routing (ai_chat.py):**
- `PLANNER_SYSTEM_PROMPT` is appended to `SYSTEM_PROMPT` when `chat_mode == "planner"`.
- `active_tools` is filtered to `_PLANNER_ALLOWED_TOOLS` (read_latest_results, read_strategy_code, read_execution_logs, read_hyperopt_results) — write tools are excluded entirely from the OpenRouter payload.
- `_run_dual_model_loop` accepts a `tools: list[dict] | None` kwarg (defaults to `AGENT_TOOLS`).

**Implement Plan bridge:**
- `MessageBubble` renders a "🚀 Start Work / Implement Plan" button when `isPlannerMode && msg.content.includes("### APPROVED PLAN SPECIFICATION")`.
- `handleImplementPlan(planSpec)` immediately calls `send({ text: bridgePrompt, mode: 'agent' })` — the mode override bypasses the React state timing issue so the request goes out as agent mode in the same render cycle.
- `setChatMode('agent')` is called in parallel so the UI updates.

## Plan Evaluation Safety Net (Post-Execution Guardrail)

**Flow triggered when user clicks "🚀 Start Work / Implement Plan":**
1. Frontend `handleImplementPlan` (async) calls `POST /api/ai/plan-checkpoint` with `strategy_name` BEFORE sending to agent — backend atomically: creates a snapshot tagged `pre_plan`, reads latest `parsed_summary.json` metrics, returns `{ snapshot_ts, baseline_metrics }`.
2. Frontend stores the checkpoint, switches to agent mode, then calls `await send({ text, mode: 'agent' })`. `send()` returns `{ content, session_id }` on success (null on error).
3. After the agent finishes, frontend calls `runPlanEvaluation({ strategyName, prePlanSnapshotTs, baselineMetrics, sessionId })`.
4. `POST /api/ai/evaluate-plan` checks 3 degradation conditions: net profit dropped >20% relative, max drawdown worsened >30% relative, or profit factor collapsed below 1.0 (when baseline ≥1.0).
5. If **PLAN_PASSED**: nothing extra happens.
6. If **PLAN_DEGRADED**: backend auto-rollbacks using `pre_plan_snapshot_ts` (falls back to 2nd-most-recent snapshot), writes to `user_data/logs/last_error.log`, returns `{ status, metrics_comparison, rollback_result, rollback_error }`.
7. Frontend receives PLAN_DEGRADED: inserts a `plan_degraded` message (renders `PlanDegradedBanner`), flips `chatMode` to `'planner'`, then auto-triggers post-mortem AI call to the planner model in the same session.

**Backend files:** `_read_strategy_metrics()`, `PlanCheckpointRequest`, `EvaluatePlanRequest`, `plan_checkpoint()`, `evaluate_plan()` — all in `backend/api/routers/ai_chat.py`.
**Key design:** `snapshot_service.create_snapshot(name, dir, trigger="pre_plan")` gives a precise rollback target. Auto-rollback uses `restore_snapshot()` which does atomic rename (copy2 to `.tmp`, then `tmp.replace(dest)`).
**Why:** No user action needed on rollback — the system is bulletproof because the exact pre-plan snapshot timestamp is captured *before* the agent ever writes a file.

## Context badge in AIChatPanel

When `isEditorContext` is true, a `📝 Context` badge strip is shown below the model selector with the strategy name. The chat prompt placeholder also changes to "Ask about {name}…". Hint messages in the empty state suggest strategy-specific questions.
