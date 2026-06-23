---
name: Strategy Lab AI Feature Architecture
description: Covers user profile meta-learning, autonomous hyperopt tools, timeframe lock/consent UI, and system prompt structural overhaul — how they interconnect.
---

# User Profile Meta-Learning
- `backend/services/ai/user_profile.py` — `UserProfileService` loads/saves `user_data/user_profile.json`. Key methods: `record_backtest(payload)`, `build_context_block()` (returns a formatted string injected into every AI system prompt).
- `backend/api/routers/user_profile.py` — GET/POST `/api/user-profile`, POST `/api/user-profile/record`.
- `backend/app_services.py` — `services.user_profile_service` instantiated at startup.
- `frontend/src/components/BacktestForm.jsx` — `useEffect` on `results` calls `/api/user-profile/record` (fire-and-forget) for implicit learning after every successful backtest.

**Why:** AI responses improve over sessions; the profile block is prepended to every chat system prompt so the model always knows the user's history.

# Autonomous Hyperopt Tools (Agent Mode only)
- `backend/services/ai/agent_tools.py` — `run_hyperopt_optimization` and `rewrite_strategy_file` added to `AGENT_TOOLS` schema + `AgentToolExecutor` executor methods.
- `backend/api/routers/ai_chat.py` — `_make_executor` wires a `_hyperopt_launcher` closure that spawns a daemon thread and creates a session via `session_store.create("hyperopt")`.
- `_PLANNER_ALLOWED_TOOLS` excludes both new tools — planner cannot trigger writes.

**Why:** Planner is read-only; only Agent mode can mutate files or launch optimization jobs.

# Timeframe Lock / Consent UI (Planner Mode)
- `frontend/src/components/AIChatPanel.jsx` — `lockedTimeframes` (Set), `showTimeframeMatrix` state; collapsible "⏱ Timeframe Consent Boundaries" section in planner panel with scalping (1m/5m/15m) and swing (30m/1h/4h/6h) toggle buttons.
- `locked_timeframes` array is included in every `/api/ai/chat` POST body when non-empty.
- `backend/api/routers/ai_chat.py` — injects `locked_tf_msg` system message that hard-constrains the model not to propose changing locked timeframes.

**How to apply:** When user locks a timeframe it turns red (🔒 prefix). The backend injects a hard constraint system message so the AI respects the boundary even across multi-turn conversations.

# System Prompt Structural Overhaul
- `SYSTEM_PROMPT` extended with Freqtrade docs compliance rules, safe-write protocols, hyperopt integration authority.
- `PLANNER_SYSTEM_PROMPT` extended with structural overhaul authority, timeframe proposal guidelines, and hyperopt read-only analysis capability.
- User profile `build_context_block()` is appended to the base system content on every request (after mode selection, before context injection).
