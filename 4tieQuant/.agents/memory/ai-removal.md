---
name: AI Removal Sweep
description: All AI/LLM functionality removed from Strategy Lab; documents what was deleted and key structural decisions made.
---

## What was removed
- Entire `backend/services/ai/` directory (AIProvider, ChatService, DiagnosisEngine, ImprovementEngine, LessonsLedger, UserProfileService, error_log, etc.)
- `backend/api/routers/ai_chat.py`, `user_profile.py`
- `backend/models/diagnosis.py`, `improvement.py`
- `frontend/src/components/AIChatPanel.jsx`
- AI data files: `data/user_profile.json`, `data/lessons_learned.json`, `user_data/chat_sessions.db`

## Key structural decisions

**SettingsModel** now has exactly 4 fields: `freqtrade_executable_path`, `strategies_directory_path`, `user_data_directory_path`, `default_config_file_path`. Uses `extra="ignore"` for backward compat with old settings JSON.

**Why:** AI settings (API keys, model names, openrouter config) all removed — no longer needed.

**ComparisonMetric / ComparisonResult / PairComparison** were defined in the deleted `improvement.py` but are used by core (non-AI) `comparison.py`. These were moved into `backend/models/contracts.py`.

**Why:** They are pure data comparison models with no AI dependency — the ComparisonEngine service uses them to compare two backtest run results.

**LocalPaths** no longer has `ai_log_file`. `MaintenanceService` no longer accepts `ai_log_file` param.

**write_last_error** helper (from deleted `error_log.py`) was referenced in `backtest_runner.py`, `data_download_runner.py`, and `hyperopt.py` — all calls removed (they were fire-and-forget try/except blocks, safe to drop).

**temporal_stress_lab.py** had a meta-learning auto-logging block that wrote to `lessons_ledger` — this entire block was removed.

**How to apply:** If AI functionality is ever re-added, it should be a separate service module under `backend/services/` and not entangled with core backtest/optimizer flows.
