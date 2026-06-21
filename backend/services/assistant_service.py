"""Guarded AI assistant service for Strategy Lab."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TYPE_CHECKING
from urllib.parse import urlparse

import httpx

if TYPE_CHECKING:
    from backend.services.interfaces import ISettingsStore

from backend.core.errors import BackendError
from backend.services.agent_context import AgentContextService
from backend.services.ai.ollama_client import OllamaClient
from backend.services.ai.ollama_config import config_from_settings
from backend.services.ai.ollama_errors import friendly_ollama_error
from backend.utils import append_text, atomic_write_json, read_json


ASSISTANT_CHAT_SCHEMA = "assistant_chat_session_v1"
AUDIT_SCHEMA = "assistant_action_audit_v1"
MAX_CONTEXT_CHARS = 42000
MAX_STRING_CHARS = 8000
MAX_HISTORY_MESSAGES = 8
MAX_RETRIES = 2
RETRY_DELAY_BASE = 1.0  # seconds

ANALYSIS_SYSTEM_PROMPT = """You are Strategy Lab's AI strategy analyst.

Your job is to help the user understand Freqtrade strategy code, optimizer
sessions, backtest results, AutoQuant reports, parameters, and logs.

Rules:
- Treat backend context as the only source of trading metrics.
- Never invent profit, drawdown, profit factor, Sharpe, trade count, score,
  best-trial rank, readiness, OOS, WFO, or confidence values.
- If a metric is missing, say it is missing.
- Separate facts from suggestions.
- Do not promise profit or imply a strategy is safe to trade live.
- You are read-only. You may suggest actions, but the application must require
  explicit user confirmation before running tools, exporting, promoting,
  modifying files, accepting versions, or deploying.
- Dangerous actions such as overwriting accepted params, editing strategy.py,
  deleting files, accepting a candidate, or live/dry-run deployment are not
  available in this MVP.
"""

# Alias for backward compatibility
SYSTEM_PROMPT = ANALYSIS_SYSTEM_PROMPT

CHAT_SYSTEM_PROMPT = """You are Fourty, an AI assistant embedded inside the AutoQuant / Strategy Lab app.

Your job is to help the user build, debug, understand, and improve trading-strategy workflows, especially around Freqtrade, AutoQuant, Strategy Lab, Optimizer, pair selection, backtesting, hyperopt, WFO/OOS validation, and export.

Core behavior:
- Be practical, direct, and useful.
- Prefer clear step-by-step answers when the topic is technical.
- Keep answers concise by default.
- Expand only when the user asks for depth using words like: "explain fully", "step by step", "deep", "think hard", "from beginning to end", or similar.
- If the user asks for "prompt only", output only the prompt with no extra explanation.
- If the user asks in Arabic, answer in Arabic unless they explicitly request English.
- If the user asks for an English prompt, write the prompt in English.
- Do not over-ask questions. If the missing detail is not blocking, make a reasonable assumption and continue.
- If the request is ambiguous but still answerable, state the assumption briefly and proceed.
- Do not pretend that you ran code, tests, backtests, or file edits unless the app actually executed them through a tool.
- For trading strategy claims, never guarantee profit. Explain that all results must be validated by data, backtesting, OOS, WFO, multi-pair tests, and drawdown checks.

AutoQuant principles:
- AI suggests, backend validates, Freqtrade tests, AutoQuant decides.
- The AI should not decide that a strategy is profitable by opinion.
- A strategy is only promising if the numbers support it: positive expectancy, acceptable drawdown, enough trades, reasonable profit factor, and robustness across out-of-sample and multi-pair validation.
- Prefer robust strategies over curve-fit strategies.
- If a strategy fails, explain the failure reason clearly and suggest the next safest step.

Response style:
- Use simple language.
- Avoid unnecessary theory unless requested.
- Give the user the next action clearly.
- When giving implementation instructions, separate them into small steps.
- When giving code, make it clean, minimal, and ready to paste.
- When giving prompts for another AI coding assistant, make them specific, testable, and not too long.
"""

# Modes that use Modelfile-baked system prompts (no system message sent)
WORKFLOW_MODES = {"autoquant", "strategylab", "optimizer"}


def _now() -> str:
    return datetime.now(tz=UTC).isoformat()


async def _retry_with_backoff(
    func,
    *args,
    max_retries: int = MAX_RETRIES,
    base_delay: float = RETRY_DELAY_BASE,
    **kwargs
):
    """Retry a function with exponential backoff for transient errors."""
    last_exception = None
    for attempt in range(max_retries + 1):
        try:
            return await func(*args, **kwargs)
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            last_exception = exc
            if attempt < max_retries:
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)
            continue
        except Exception:
            # Don't retry on non-transient errors
            raise
    raise last_exception


def _headers(base_url: str, *, api_key: str | None = None) -> dict[str, str]:
    parsed = urlparse(base_url)
    host = parsed.netloc or parsed.path
    headers = {
        "Host": host,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _dump(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {str(k): _dump(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_dump(v) for v in value]
    return value


def _truncate_text(text: str, limit: int = MAX_STRING_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n...[truncated {len(text) - limit} chars]"


def _sanitize_context(value: Any, *, depth: int = 0) -> Any:
    if depth > 8:
        return "[truncated-depth]"
    if isinstance(value, str):
        return _truncate_text(value)
    if isinstance(value, list):
        limit = 40
        items = [_sanitize_context(item, depth=depth + 1) for item in value[:limit]]
        if len(value) > limit:
            items.append({"truncated_items": len(value) - limit})
        return items
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if key_text in {"root", "absolute_path", "file_path", "python_path", "json_path"}:
                cleaned[key_text] = "[path hidden]"
                continue
            if key_text == "inventory":
                cleaned[key_text] = _sanitize_context(item[:80] if isinstance(item, list) else item, depth=depth + 1)
                continue
            if key_text == "recent_trials" and isinstance(item, list):
                cleaned[key_text] = _sanitize_context(item[-20:], depth=depth + 1)
                cleaned["recent_trials_truncated"] = len(item) > 20
                continue
            if key_text in {"recent", "events"} and isinstance(item, list):
                cleaned[key_text] = _sanitize_context(item[-60:], depth=depth + 1)
                cleaned[f"{key_text}_truncated"] = len(item) > 60
                continue
            cleaned[key_text] = _sanitize_context(item, depth=depth + 1)
        return cleaned
    return _dump(value)


def _json_for_prompt(context: dict[str, Any]) -> str:
    payload = json.dumps(_sanitize_context(context), indent=2, default=str)
    if len(payload) <= MAX_CONTEXT_CHARS:
        return payload
    return payload[:MAX_CONTEXT_CHARS] + f"\n...[context truncated {len(payload) - MAX_CONTEXT_CHARS} chars]"


def _action_card(action_type: str, label: str, safety: str, payload: dict[str, Any], description: str) -> dict[str, Any]:
    return {
        "action_type": action_type,
        "label": label,
        "safety": safety,
        "payload": payload,
        "description": description,
    }


class AssistantService:
    """Backend-owned chat, context, action, and audit coordinator."""

    dangerous_actions = {
        "overwrite_accepted_params",
        "accept_candidate_version",
        "modify_strategy_file",
        "delete_files",
        "live_deploy",
        "dry_run_deploy",
    }
    read_only_actions = {"view_best_params", "view_trial_params", "create_optimizer_run_draft"}
    guarded_actions = {
        "promote_best_trial_to_candidate",
        "promote_trial_to_candidate",
        "export_best_trial_to_stress_lab",
        "export_trial_to_stress_lab",
    }

    def __init__(
        self,
        settings_store: ISettingsStore,
        context_service: AgentContextService,
        optimizer_store: Any | None = None,
        version_manager: Any | None = None,
        exported_trial_store: Any | None = None,
        root_dir: Path | None = None,
    ) -> None:
        self.settings_store: ISettingsStore = settings_store
        self.context_service: AgentContextService = context_service
        self.optimizer_store: Any = optimizer_store
        self.version_manager: Any = version_manager
        self.exported_trial_store: Any = exported_trial_store
        self.root_dir: Path | None = root_dir

    @property
    def user_data_dir(self) -> Path:
        try:
            settings = self.settings_store.load()
            return Path(settings.user_data_directory_path)
        except Exception:
            return Path(self.root_dir or Path.cwd()) / "user_data"

    @property
    def session_dir(self) -> Path:
        path = self.user_data_dir / "assistant" / "chat_sessions"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def audit_path(self) -> Path:
        path = self.user_data_dir / "assistant" / "audit.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def load_session(self, session_id: str) -> dict[str, Any]:
        path = self.session_dir / f"{session_id}.json"
        data = read_json(path)
        if not isinstance(data, dict):
            raise BackendError(f"Assistant chat session '{session_id}' was not found.", status_code=404)
        return data

    def _save_session(self, session: dict[str, Any]) -> None:
        session["updated_at"] = _now()
        atomic_write_json(self.session_dir / f"{session['session_id']}.json", session)

    def _new_session(self, model: str, title: str | None = None) -> dict[str, Any]:
        session_id = str(uuid.uuid4())
        now = _now()
        return {
            "schema_version": ASSISTANT_CHAT_SCHEMA,
            "session_id": session_id,
            "created_at": now,
            "updated_at": now,
            "model": model,
            "title": title or "AI Assistant Chat",
            "messages": [],
            "last_context_summary": None,
            "last_context_overrides": {},
        }

    def _get_or_create_session(self, session_id: str | None, model: str) -> dict[str, Any]:
        if session_id:
            session = self.load_session(session_id)
            session["model"] = model
            return session
        return self._new_session(model)

    def _settings_and_model(self, requested_model: str | None, mode: str = "analysis") -> tuple[Any, str]:
        settings = self.settings_store.load()
        model = requested_model or settings.ollama_model
        if not model:
            # Fall back to mode-specific model if default is empty
            mode_key = f"ollama_model_{mode}" if mode != "analysis" else None
            if mode_key:
                model = getattr(settings, mode_key, "") or ""
            if not model:
                raise BackendError(
                    "No AI model configured. Go to Settings -> AI Assistant, refresh models, select one, and save.",
                    status_code=422,
                )
        return settings, model

    def _build_context(
        self,
        context_overrides: dict[str, Any] | None,
        *,
        include_strategy_source: bool = False,
    ) -> dict[str, Any]:
        context = self.context_service.build_context(context_overrides or {})
        strategy_name = context.get("active", {}).get("strategy_name")
        if include_strategy_source and strategy_name:
            try:
                strategy = self.context_service.strategy_file_context(str(strategy_name), include_content=True)
                strategy["versions"] = self.context_service.strategy_version_context(str(strategy_name))
                context["strategy"] = strategy
            except BackendError as exc:
                context.setdefault("warnings", []).append(exc.message)
        return context

    def context_summary(self, context: dict[str, Any]) -> dict[str, Any]:
        active = context.get("active", {}) if isinstance(context, dict) else {}
        optimizer = context.get("optimizer") or {}
        backtest = context.get("backtest") or {}
        auto_quant = context.get("auto_quant") or {}
        strategy = context.get("strategy") or {}
        chips = []
        if active.get("strategy_name"):
            chips.append({"kind": "strategy", "label": str(active["strategy_name"])})
        if strategy.get("files"):
            chips.append({"kind": "params", "label": "strategy files"})
        if active.get("optimizer_session_id"):
            chips.append({"kind": "optimizer", "label": str(active["optimizer_session_id"])[:8]})
        if optimizer.get("selected_trial_number") is not None:
            chips.append({"kind": "trial", "label": f"trial #{optimizer['selected_trial_number']}"})
        if optimizer.get("summary", {}).get("best_trial_number") is not None:
            chips.append({"kind": "best_trial", "label": f"best #{optimizer['summary']['best_trial_number']}"})
        if active.get("backtest_run_id"):
            chips.append({"kind": "backtest", "label": str(active["backtest_run_id"])[:8]})
        if active.get("auto_quant_run_id"):
            chips.append({"kind": "autoquant", "label": str(active["auto_quant_run_id"])[:8]})

        return {
            "active_tab": active.get("active_tab"),
            "active_panel": active.get("active_panel"),
            "strategy_name": active.get("strategy_name"),
            "optimizer_session_id": active.get("optimizer_session_id"),
            "optimizer_trial_number": active.get("optimizer_trial_number"),
            "backtest_run_id": active.get("backtest_run_id"),
            "auto_quant_run_id": active.get("auto_quant_run_id"),
            "optimizer_phase": optimizer.get("phase"),
            "backtest_status": backtest.get("status"),
            "auto_quant_status": auto_quant.get("status"),
            "chips": chips,
            "warnings": context.get("warnings", []),
        }

    CHAT_KEYWORDS = frozenset({
        "hi", "hello", "hey", "howdy", "good morning", "good evening",
        "good afternoon", "what's up", "sup", "hi there", "hello there",
        "thanks", "thank you", "ty", "thank you very much", "thanks a lot",
        "bye", "goodbye", "see you", "see ya", "cya", "later",
        "how", "how are you", "how's it going", "how are things",
        "nice", "great", "cool", "awesome", "wonderful", "perfect",
        "yes", "no", "maybe", "ok", "okay", "sure", "yeah", "yep", "nope",
        "got it", "i see", "understood", "makes sense",
    })

    def _resolve_mode(self, mode: str, user_message: str) -> str:
        if mode == "auto":
            return self._classify_message_mode(user_message)
        return mode

    def _classify_message_mode(self, user_message: str) -> str:
        msg = user_message.strip().lower()
        words = msg.split()
        if not words:
            return "analysis"
        first_word = words[0].rstrip("?,!. ")
        # Single word or very short phrase matching a chat keyword
        if len(words) <= 4 and first_word in self.CHAT_KEYWORDS:
            return "chat"
        if len(words) <= 2 and msg in self.CHAT_KEYWORDS:
            return "chat"
        # Multi-word greeting patterns
        first_two = " ".join(words[:2]).rstrip("?,!. ")
        if first_two in {"how are", "how's it", "what's up", "how do", "how you"}:
            return "chat"
        return "analysis"

    def _resolve_model_for_mode(self, settings: Any, base_model: str, mode: str) -> str:
        if mode == "chat":
            override = getattr(settings, "ollama_model_chat", "") or ""
            return override.strip() or base_model
        if mode == "analysis":
            return base_model
        # Workflow modes
        key = f"ollama_model_{mode}"
        override = getattr(settings, key, "") or ""
        return override.strip() or base_model

    def _resolve_model_pair(self, settings: Any, requested_model: str | None, mode: str) -> tuple[str, str]:
        """Resolve (base_model, final_model) from settings, request override, and mode."""
        base_model = requested_model or settings.ollama_model or ""
        if not base_model:
            # Fall back to mode-specific model if default is empty
            mode_key = f"ollama_model_{mode}" if mode != "analysis" else None
            if mode_key:
                base_model = getattr(settings, mode_key, "") or ""
        if not base_model:
            raise BackendError(
                "No AI model configured. Go to Settings -> AI Assistant, refresh models, select one, and save.",
                status_code=422,
            )
        final_model = self._resolve_model_for_mode(settings, base_model, mode)
        return base_model, final_model

    def available_actions(self, context: dict[str, Any]) -> list[dict[str, Any]]:
        optimizer = context.get("optimizer") or {}
        session_id = optimizer.get("session_id")
        best_number = optimizer.get("summary", {}).get("best_trial_number")
        selected_number = optimizer.get("selected_trial_number")
        actions = []
        if session_id and best_number is not None:
            payload = {"optimizer_session_id": session_id}
            actions.extend([
                _action_card("view_best_params", "View Best Params", "Read-only", payload, "Load best trial parameters without writing files."),
                _action_card("promote_best_trial_to_candidate", "Promote Best Candidate", "Needs confirmation", payload, "Create a candidate version from the best trial."),
                _action_card("export_best_trial_to_stress_lab", "Export Best to Stress Lab", "Needs confirmation", payload, "Persist the best trial configuration for stress testing."),
            ])
        if session_id and selected_number is not None:
            payload = {"optimizer_session_id": session_id, "trial_number": selected_number}
            actions.extend([
                _action_card("view_trial_params", f"View Trial #{selected_number} Params", "Read-only", payload, "Load selected trial parameters without writing files."),
                _action_card("promote_trial_to_candidate", f"Promote Trial #{selected_number}", "Needs confirmation", payload, "Create a candidate version from the selected trial."),
                _action_card("export_trial_to_stress_lab", f"Export Trial #{selected_number}", "Needs confirmation", payload, "Persist the selected trial configuration for stress testing."),
            ])
        actions.append(_action_card("create_optimizer_run_draft", "Prepare Optimizer Draft", "Read-only", {}, "Suggest a draft optimizer configuration; it will not start a run."))
        actions.append(_action_card("overwrite_accepted_params", "Overwrite Accepted Params", "Destructive", {}, "Disabled in the AI assistant MVP."))
        return actions

    def _prompt_messages(
        self,
        session: dict[str, Any],
        user_message: str,
        context: dict[str, Any],
        mode: str = "analysis",
    ) -> list[dict[str, str]]:
        previous = [
            {"role": item.get("role", "user"), "content": str(item.get("content", ""))}
            for item in session.get("messages", [])[-MAX_HISTORY_MESSAGES:]
            if item.get("role") in {"user", "assistant"} and item.get("content")
        ]

        if mode == "chat":
            return [
                {"role": "system", "content": CHAT_SYSTEM_PROMPT},
                *previous,
                {"role": "user", "content": user_message},
            ]

        if mode in WORKFLOW_MODES:
            # No system prompt — Modelfile has the workflow baked in
            summary = self.context_summary(context)
            state_parts = []
            if summary.get("active_tab"):
                state_parts.append(f"Active tab: {summary['active_tab']}")
            if summary.get("strategy_name"):
                state_parts.append(f"Strategy: {summary['strategy_name']}")
            if summary.get("optimizer_session_id"):
                state_parts.append(f"Optimizer session: {summary['optimizer_session_id']}")
            if summary.get("backtest_run_id"):
                state_parts.append(f"Backtest run: {summary['backtest_run_id']}")
            if summary.get("auto_quant_run_id"):
                state_parts.append(f"AutoQuant run: {summary['auto_quant_run_id']}")
            state_line = "; ".join(state_parts) if state_parts else "No active context"
            return [
                *previous,
                {"role": "user", "content": f"{user_message}\n\nApp state: {state_line}"},
            ]

        # analysis mode (default)
        context_json = _json_for_prompt(context)
        current = {
            "role": "user",
            "content": (
                f"User question:\n{user_message}\n\n"
                "Backend context JSON follows. Use only these backend-provided metrics as facts:\n"
                f"```json\n{context_json}\n```\n\n"
                "Answer as a strategy analyst. When suggesting next steps, make clear they are suggestions."
            ),
        }
        return [{"role": "system", "content": ANALYSIS_SYSTEM_PROMPT}, *previous, current]

    async def chat(
        self,
        *,
        message: str,
        session_id: str | None = None,
        model: str | None = None,
        mode: str = "auto",
        context_overrides: dict[str, Any] | None = None,
        include_strategy_source: bool = False,
    ) -> dict[str, Any]:
        if not message.strip():
            raise BackendError("Message is required.", status_code=422)
        settings = self.settings_store.load()
        resolved_mode = self._resolve_mode(mode, message)
        base_model, resolved_model = self._resolve_model_pair(settings, model, resolved_mode)
        session = self._get_or_create_session(session_id, resolved_model)
        context = self._build_context(context_overrides, include_strategy_source=include_strategy_source)
        summary = self.context_summary(context)
        messages = self._prompt_messages(session, message, context, mode=resolved_mode)
        response_text = await self._call_ollama(settings, resolved_model, messages)
        user_record = self._message_record("user", message)
        assistant_record = self._message_record("assistant", response_text)
        session.setdefault("messages", []).extend([user_record, assistant_record])
        session["last_context_summary"] = summary
        session["last_context_overrides"] = context_overrides or {}
        self._save_session(session)
        return {
            "session_id": session["session_id"],
            "model": resolved_model,
            "message": assistant_record,
            "context_summary": summary,
            "available_actions": self.available_actions(context),
        }

    def _message_record(self, role: str, content: str) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "created_at": _now(),
        }

    async def _call_ollama(self, settings: Any, model: str, messages: list[dict[str, str]]) -> str:
        config = config_from_settings(settings, model_override=model, require_model=True)
        if config is None:
            raise BackendError("No AI model configured. Go to Settings -> AI Assistant, refresh models, select one, and save.", status_code=422)
        client = OllamaClient(config=config, retry_delays=[RETRY_DELAY_BASE * (2 ** i) for i in range(MAX_RETRIES)])
        try:
            response = await client.chat(
                messages,
                model=model,
                options={"temperature": 0.25, "num_predict": 1400},
            )
        except httpx.ConnectError as exc:
            raise BackendError("Ollama Offline: could not connect to the configured Ollama API URL after retries.", status_code=503) from exc
        except httpx.TimeoutException as exc:
            raise BackendError(f"Ollama timed out after {MAX_RETRIES} retries. Try a smaller model or increase the timeout in Settings.", status_code=503) from exc
        except httpx.HTTPStatusError as exc:
            raise BackendError(f"Ollama returned HTTP {exc.response.status_code}.", status_code=502) from exc
        except json.JSONDecodeError as exc:
            raise BackendError("Ollama returned non-JSON for /api/chat.", status_code=502) from exc
        finally:
            await client.close()

        return response.content.strip() or "Ollama returned an empty response."

    async def stream_chat(
        self,
        *,
        message: str,
        session_id: str | None = None,
        model: str | None = None,
        mode: str = "auto",
        context_overrides: dict[str, Any] | None = None,
        include_strategy_source: bool = False,
    ) -> AsyncIterator[str]:
        settings = self.settings_store.load()
        resolved_mode = self._resolve_mode(mode, message)
        base_model, resolved_model = self._resolve_model_pair(settings, model, resolved_mode)
        session = self._get_or_create_session(session_id, resolved_model)
        context = self._build_context(context_overrides, include_strategy_source=include_strategy_source)
        summary = self.context_summary(context)
        messages = self._prompt_messages(session, message, context, mode=resolved_mode)
        actions = self.available_actions(context) if resolved_mode == "analysis" else []

        yield self._sse("meta", {
            "session_id": session["session_id"],
            "model": resolved_model,
            "mode": resolved_mode,
            "context_summary": summary,
            "available_actions": actions,
        })

        config = config_from_settings(settings, model_override=resolved_model, require_model=True)
        if config is None:
            yield self._sse("error", {"detail": "No AI model configured."})
            return
        assistant_parts: list[str] = []
        client = OllamaClient(config=config)

        try:
            async for data in client.stream_chat(
                messages,
                model=resolved_model,
                options={"temperature": 0.25, "num_predict": 1400},
            ):
                chunk = data.get("message", {}).get("content", "")
                if chunk:
                    assistant_parts.append(chunk)
                    yield self._sse("token", {"content": chunk})
                if data.get("done"):
                    break
        except Exception as exc:
            yield self._sse("error", {"detail": self._friendly_ollama_error(exc)})
            return
        finally:
            await client.close()

        response_text = "".join(assistant_parts).strip() or "Ollama returned an empty response."
        user_record = self._message_record("user", message)
        assistant_record = self._message_record("assistant", response_text)
        session.setdefault("messages", []).extend([user_record, assistant_record])
        session["last_context_summary"] = summary
        session["last_context_overrides"] = context_overrides or {}
        self._save_session(session)
        yield self._sse("done", {
            "session_id": session["session_id"],
            "message": assistant_record,
            "context_summary": summary,
            "available_actions": actions,
        })

    def _sse(self, event: str, payload: dict[str, Any]) -> str:
        return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"

    def _friendly_ollama_error(self, exc: Exception) -> str:
        return friendly_ollama_error(exc)

    def confirm_action(
        self,
        *,
        action_type: str,
        payload: dict[str, Any] | None,
        session_id: str | None = None,
        user_message: str | None = None,
        confirmation_token: str | None = None,
    ) -> dict[str, Any]:
        payload = payload or {}
        if action_type in self.dangerous_actions:
            result = {"ok": False, "error": "This destructive action is disabled in the AI assistant MVP."}
            self._audit(action_type, payload, session_id, user_message, result, status="rejected")
            raise BackendError(result["error"], status_code=403)
        if action_type in self.guarded_actions and confirmation_token != "CONFIRM":
            raise BackendError("Confirmation token required for this action.", status_code=409)
        if action_type not in self.read_only_actions and action_type not in self.guarded_actions:
            raise BackendError(f"Unknown assistant action '{action_type}'.", status_code=400)

        result = self._execute_action(action_type, payload)
        self._audit(action_type, payload, session_id, user_message, result, status="completed")
        return result

    def _execute_action(self, action_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        if action_type == "view_best_params":
            session, trial = self._resolve_trial(payload, best=True)
            return {"ok": True, "read_only": True, "params": self._flat_params(session.strategy_name, trial.parameters)}
        if action_type == "view_trial_params":
            session, trial = self._resolve_trial(payload, best=False)
            return {"ok": True, "read_only": True, "params": self._flat_params(session.strategy_name, trial.parameters)}
        if action_type == "create_optimizer_run_draft":
            return self._optimizer_draft(payload)
        if action_type == "promote_best_trial_to_candidate":
            session, trial = self._resolve_trial(payload, best=True)
            return self._promote_trial(session, trial)
        if action_type == "promote_trial_to_candidate":
            session, trial = self._resolve_trial(payload, best=False)
            return self._promote_trial(session, trial)
        if action_type == "export_best_trial_to_stress_lab":
            session, trial = self._resolve_trial(payload, best=True)
            return self._export_trial(session, trial)
        if action_type == "export_trial_to_stress_lab":
            session, trial = self._resolve_trial(payload, best=False)
            return self._export_trial(session, trial)
        raise BackendError(f"Unhandled assistant action '{action_type}'.", status_code=400)

    def _resolve_trial(self, payload: dict[str, Any], *, best: bool) -> tuple[Any, Any]:
        session_id = payload.get("optimizer_session_id") or payload.get("session_id")
        if not session_id:
            raise BackendError("optimizer_session_id is required.", status_code=422)
        if self.optimizer_store is None:
            raise BackendError("Optimizer store is unavailable.", status_code=500)
        session = self.optimizer_store.load_session(str(session_id))
        if session is None:
            raise BackendError(f"Optimizer session '{session_id}' was not found.", status_code=404)
        trial_number = session.best_trial_number if best else payload.get("trial_number")
        if trial_number is None:
            raise BackendError("No trial number is available for this action.", status_code=404)
        try:
            trial_number = int(trial_number)
        except (TypeError, ValueError) as exc:
            raise BackendError("trial_number must be a number.", status_code=422) from exc
        trial = next((item for item in session.trials if item.trial_number == trial_number), None)
        if trial is None:
            raise BackendError(f"Trial #{trial_number} was not found.", status_code=404)
        return session, trial

    def _promote_trial(self, session: Any, trial: Any) -> dict[str, Any]:
        if session.phase != "completed":
            raise BackendError(f"Session is not completed (current phase: '{session.phase}').", status_code=409)
        if trial.status != "completed":
            raise BackendError(f"Trial #{trial.trial_number} is not completed.", status_code=400)
        if not trial.parameters:
            raise BackendError(f"Trial #{trial.trial_number} has no parameters.", status_code=400)
        if not trial.run_id:
            raise BackendError(f"Trial #{trial.trial_number} has no associated backtest run.", status_code=400)
        if self.version_manager is None:
            raise BackendError("Version manager is unavailable.", status_code=500)
        result = self.version_manager.apply_optimizer_trial_to_new_version(
            run_repository=self.context_service.run_repository,
            optimizer_store=self.optimizer_store,
            session_id=session.session_id,
            trial_number=trial.trial_number,
        )
        return {
            "ok": True,
            "strategy_name": session.config.strategy_name,
            "candidate_version_id": result["version_id"],
            "trial_number": trial.trial_number,
            "score": trial.metrics.score if trial.metrics else None,
            "metrics": trial.metrics.model_dump(mode="json") if trial.metrics else {},
        }

    def _export_trial(self, session: Any, trial: Any) -> dict[str, Any]:
        if trial.status != "completed":
            raise BackendError(f"Trial #{trial.trial_number} is not completed.", status_code=400)
        if self.exported_trial_store is None:
            raise BackendError("Exported trial store is unavailable.", status_code=500)
        record = self.exported_trial_store.append(
            strategy_name=session.config.strategy_name,
            trial_number=trial.trial_number,
            score=trial.metrics.score if trial.metrics else None,
            parameters=trial.parameters or {},
            metrics=trial.metrics.model_dump(mode="json") if trial.metrics else {},
        )
        return {"ok": True, "exported": record, "count": 1}

    def _optimizer_draft(self, payload: dict[str, Any]) -> dict[str, Any]:
        session_id = payload.get("optimizer_session_id") or payload.get("session_id")
        if session_id:
            if self.optimizer_store is None:
                raise BackendError("Optimizer store is unavailable.", status_code=500)
            session = self.optimizer_store.load_session(str(session_id))
            if session is not None:
                config = session.config.model_dump(mode="json")
                return {
                    "ok": True,
                    "read_only": True,
                    "draft": {
                        **config,
                        "total_trials": min(int(config.get("total_trials") or 50), 100),
                        "note": "Draft only. The assistant will not start this optimizer run.",
                    },
                }
        return {
            "ok": True,
            "read_only": True,
            "draft": {
                "parameter_mode": "auto_safe",
                "search_strategy": "random",
                "score_metric": "composite",
                "total_trials": 50,
                "note": "Draft only. Select a strategy and review fields before running manually.",
            },
        }

    def _flat_params(self, strategy_name: str, parameters: dict[str, Any]) -> dict[str, Any]:
        buy: dict[str, Any] = {}
        sell: dict[str, Any] = {}
        roi: dict[str, Any] = {}
        stoploss: float | None = None
        trailing: dict[str, Any] = {}
        for key, value in (parameters or {}).items():
            if key.startswith("buy__"):
                buy[key[5:]] = value
            elif key.startswith("sell__"):
                sell[key[6:]] = value
            elif key.startswith("roi__"):
                roi[key[5:]] = value
            elif key == "stoploss__value":
                stoploss = value
            elif key == "trailing__stop":
                trailing["trailing_stop"] = value
            elif key in ("trailing__positive", "trailing__positive_offset"):
                trailing["trailing_stop_positive"] = value
            elif key == "trailing__offset":
                trailing["trailing_stop_positive_offset"] = value
            elif key == "trailing__only_offset_is_reached":
                trailing["trailing_only_offset_is_reached"] = value
        params: dict[str, Any] = {"buy": buy, "sell": sell, "roi": roi, "trailing": trailing}
        if stoploss is not None:
            params["stoploss"] = stoploss
        return {"strategy_name": strategy_name, "params": params}

    def _audit(
        self,
        action_type: str,
        payload: dict[str, Any],
        session_id: str | None,
        user_message: str | None,
        result: dict[str, Any],
        *,
        status: str,
    ) -> None:
        entry = {
            "schema_version": AUDIT_SCHEMA,
            "timestamp": _now(),
            "session_id": session_id,
            "user_message": user_message,
            "proposed_action": {"action_type": action_type, "payload": payload},
            "endpoint_called": "/api/ai/actions/confirm",
            "status": status,
            "result": _sanitize_context(result),
            "affected_strategy": result.get("strategy_name"),
            "affected_session": payload.get("optimizer_session_id") or payload.get("session_id"),
            "affected_trial": payload.get("trial_number") or result.get("trial_number"),
            "affected_version": result.get("candidate_version_id"),
        }
        append_text(self.audit_path, json.dumps(entry, default=str) + "\n")
