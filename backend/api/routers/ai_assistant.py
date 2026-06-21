"""Router: /api/ai

Local-LLM powered assistant using Ollama.

GET  /api/ai/models            — fetches available models from the configured
                                  Ollama instance ({ollama_api_url}/api/tags).
POST /api/ai/explain-strategy  — reads a strategy .py file and returns a
                                  plain-language explanation via the configured
                                  Ollama model.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ...core.errors import BackendError
from ...services.agent_context import AgentContextService
from ...services.ai.ollama_client import OllamaClient, build_headers
from ...services.ai.ollama_config import config_from_settings
from ...services.assistant_service import AssistantService

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])

DEFAULT_TIMEOUT_GENERATE = 120.0
DEFAULT_TIMEOUT_TAGS = 30.0


def _build_headers(base_url: str, *, include_content_type: bool = False, api_key: str | None = None) -> dict[str, str]:
    """Return the standard HTTP headers for Ollama requests.

    * ``Host``         — derived from the configured URL so reverse-proxies and
                         Cloudflare / Tailscale tunnels receive the correct header.
    * ``Accept``       — always ``application/json``.
    * ``Content-Type`` — ``application/json`` for POST bodies (optional for GETs).
    * ``Authorization`` — Bearer token when accessing Ollama Cloud API.
    """
    return build_headers(base_url, include_content_type=include_content_type, api_key=api_key)

SYSTEM_PROMPT = (
    "You are a friendly trading mentor. "
    "Read the following Freqtrade Python strategy code. "
    "Explain its core logic — buy conditions, sell conditions, and indicators used — "
    "in simple, non-technical language. "
    "Use real-world analogies like buying/selling a car or real estate to explain "
    "the concepts where helpful. "
    "Structure your answer with clear sections: Indicators Used, Buy Logic, Sell Logic, "
    "and a short Overall Summary. "
    "Keep it concise and friendly."
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _read_strategy_source(strategies_dir: str, strategy_name: str) -> str:
    path = Path(strategies_dir) / f"{strategy_name}.py"
    if not path.exists():
        raise FileNotFoundError(
            f"Strategy file '{strategy_name}.py' not found in {strategies_dir}"
        )
    return path.read_text(encoding="utf-8", errors="replace")


def _ollama_error(exc: Exception) -> HTTPException:
    """Convert common httpx errors into friendly 503/502/500 responses."""
    if isinstance(exc, httpx.ConnectError):
        return HTTPException(
            status_code=503,
            detail=(
                "Could not connect to Ollama. "
                "Check the Ollama API URL in Settings and ensure Ollama is running."
            ),
        )
    if isinstance(exc, httpx.TimeoutException):
        return HTTPException(
            status_code=503,
            detail=(
                "Ollama took too long to respond. "
                "Try a smaller/faster model or check that Ollama is not overloaded."
            ),
        )
    if isinstance(exc, httpx.HTTPStatusError):
        detail = f"Ollama returned HTTP {exc.response.status_code}."
        try:
            detail = exc.response.json().get("error", detail)
        except Exception:
            pass
        return HTTPException(status_code=502, detail=detail)
    return HTTPException(status_code=500, detail=f"Unexpected Ollama error: {exc}")


# ── models endpoint ───────────────────────────────────────────────────────────

@router.get(
    "/health",
    summary="Check Ollama service health",
    description=(
        "Pings the configured Ollama instance to check if it's reachable. "
        "Returns health status, latency, and error information if applicable."
    ),
)
async def health_check(request: Request) -> dict:
    services = request.app.state.services
    cfg = services.settings_store.load()
    timeout = float(cfg.ollama_timeout if cfg.ollama_timeout else DEFAULT_TIMEOUT_TAGS)
    config = config_from_settings(cfg, health_timeout=timeout, require_model=False)
    if config is None:
        return {
            "status": "unhealthy",
            "reachable": False,
            "latency_ms": 0,
            "error": "Ollama API URL not configured",
            "ollama_api_url": "",
            "provider": cfg.ollama_provider,
        }
    client = OllamaClient(config=config)
    try:
        result = await client.health()
        result["provider"] = cfg.ollama_provider
        return result
    finally:
        await client.close()


@router.get(
    "/models",
    summary="List available Ollama models",
    description=(
        "Calls {ollama_api_url}/api/tags on the configured Ollama instance and "
        "returns a sorted list of model names. Returns 503 if unreachable."
    ),
)
async def list_models(request: Request) -> dict:
    services = request.app.state.services
    cfg = services.settings_store.load()
    timeout = float(cfg.ollama_timeout if cfg.ollama_timeout else DEFAULT_TIMEOUT_TAGS)
    config = config_from_settings(cfg, health_timeout=timeout, require_model=False)
    if config is None:
        return {
            "models": [],
            "reachable": False,
            "ollama_api_url": "",
            "error": "Ollama API URL not configured",
        }
    client = OllamaClient(config=config)
    try:
        return await client.list_models()
    finally:
        await client.close()


@router.get(
    "/metrics",
    summary="Get Ollama reliability metrics",
    description=(
        "Returns current reliability metrics including circuit breaker state, "
        "success rate, average latency, and request counts."
    ),
)
async def get_metrics(request: Request) -> dict:
    services = request.app.state.services
    cfg = services.settings_store.load()
    config = config_from_settings(cfg, require_model=False)
    if config is None:
        return {
            "error": "Ollama API URL not configured",
            "metrics": None,
        }
    client = OllamaClient(config=config)
    try:
        metrics = client.get_metrics()
        return {
            "metrics": metrics,
            "settings": {
                "retry_delays": cfg.ollama_retry_delays,
                "circuit_breaker_threshold": cfg.ollama_circuit_breaker_threshold,
                "circuit_breaker_cooldown": cfg.ollama_circuit_breaker_cooldown,
                "connection_pool_size": cfg.ollama_connection_pool_size,
                "connection_keepalive": cfg.ollama_connection_keepalive,
            },
        }
    finally:
        await client.close()


@router.get(
    "/health-monitor",
    summary="Get Ollama health monitor state",
    description=(
        "Returns the current health monitor state including health status, "
        "last check time, and consecutive failures/successes."
    ),
)
async def get_health_monitor_state(request: Request) -> dict:
    from ...services.ai.ollama_health_monitor import get_health_monitor

    services = request.app.state.services
    cfg = services.settings_store.load()
    try:
        monitor = await get_health_monitor(
            cfg.user_data_directory_path,
            check_interval=cfg.ollama_health_check_interval if cfg.ollama_enable_health_check else 0,
            enabled=cfg.ollama_enable_health_check,
        )
        return monitor.get_health_state()
    except Exception as exc:
        return {
            "error": str(exc),
            "healthy": None,
            "monitor_enabled": cfg.ollama_enable_health_check,
        }


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message for the assistant.")
    session_id: str | None = Field(default=None, description="Existing assistant chat session id.")
    model: str | None = Field(default=None, description="Optional Ollama model override.")
    mode: str = Field(
        default="auto",
        description="Assistant mode: auto, chat, analysis, autoquant, strategylab, optimizer.",
    )
    context_overrides: dict | None = Field(
        default=None,
        description="Optional active context ids: strategy_name, optimizer_session_id, backtest_run_id, etc.",
    )
    include_strategy_source: bool = Field(
        default=False,
        description="Attach allowlisted strategy .py/.json content to the prompt.",
    )


class ConfirmActionRequest(BaseModel):
    action_type: str
    payload: dict = Field(default_factory=dict)
    session_id: str | None = None
    user_message: str | None = None
    confirmation_token: str | None = None


# ── chat assistant endpoints ──────────────────────────────────────────────────

@router.post(
    "/chat",
    summary="Chat with the guarded Strategy Lab AI assistant",
    description=(
        "Builds a bounded backend-owned context snapshot, sends it to Ollama via "
        "/api/chat, saves chat history, and returns proposed read-only/guarded actions."
    ),
)
async def chat(body: ChatRequest, request: Request) -> dict:
    try:
        return await _assistant_service(request).chat(
            message=body.message,
            session_id=body.session_id,
            model=body.model,
            mode=body.mode,
            context_overrides=body.context_overrides or {},
            include_strategy_source=body.include_strategy_source,
        )
    except BackendError as exc:
        _raise_backend(exc)


@router.post(
    "/chat/stream",
    summary="Stream a Strategy Lab AI assistant response",
)
async def chat_stream(body: ChatRequest, request: Request) -> StreamingResponse:
    service = _assistant_service(request)
    try:
        if not body.message.strip():
            raise BackendError("Message is required.", status_code=422)
        service._settings_and_model(body.model)
        stream = service.stream_chat(
            message=body.message,
            session_id=body.session_id,
            model=body.model,
            mode=body.mode,
            context_overrides=body.context_overrides or {},
            include_strategy_source=body.include_strategy_source,
        )
    except BackendError as exc:
        _raise_backend(exc)
    return StreamingResponse(stream, media_type="text/event-stream")


@router.get(
    "/chat/{session_id}",
    summary="Load a persisted assistant chat session",
)
async def get_chat_session(session_id: str, request: Request) -> dict:
    try:
        return _assistant_service(request).load_session(session_id)
    except BackendError as exc:
        _raise_backend(exc)


@router.post(
    "/actions/confirm",
    summary="Confirm a guarded assistant action",
    description=(
        "Executes only allowlisted assistant actions. Guarded actions require "
        "confirmation_token='CONFIRM'. Destructive actions are rejected in MVP."
    ),
)
async def confirm_action(body: ConfirmActionRequest, request: Request) -> dict:
    try:
        return _assistant_service(request).confirm_action(
            action_type=body.action_type,
            payload=body.payload,
            session_id=body.session_id,
            user_message=body.user_message,
            confirmation_token=body.confirmation_token,
        )
    except BackendError as exc:
        _raise_backend(exc)


# ── explain endpoint ──────────────────────────────────────────────────────────

class ExplainRequest(BaseModel):
    strategy_name: str = Field(..., description="Strategy filename without .py")
    model: str | None = Field(
        default=None,
        description="Ollama model to use; falls back to ollama_model from settings.",
    )


def _assistant_service(request: Request) -> AssistantService:
    services = request.app.state.services
    context_service = AgentContextService(
        root_dir=services.root_dir,
        run_repository=services.run_repository,
        settings_store=services.settings_store,
        version_manager=services.version_manager,
        strategy_optimizer=getattr(services, "strategy_optimizer", None),
        backtest_runner=services.backtest_runner,
        optimizer_store=getattr(services, "optimizer_store", None),
        run_detail_callable=services.run_detail,
        log_broadcaster=getattr(request.app.state, "log_broadcaster", None),
        session_store=getattr(request.app.state, "session_store", None),
    )
    return AssistantService(
        settings_store=services.settings_store,
        context_service=context_service,
        optimizer_store=getattr(services, "optimizer_store", None),
        version_manager=services.version_manager,
        exported_trial_store=getattr(services, "exported_trial_store", None),
        root_dir=services.root_dir,
    )


def _raise_backend(exc: BackendError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post(
    "/explain-strategy",
    summary="Explain a strategy's logic using the configured local Ollama LLM",
    description=(
        "Reads the strategy .py file, sends it to the Ollama instance at the "
        "configured ollama_api_url, and returns a plain-language explanation. "
        "The model is taken from settings unless overridden in the request body."
    ),
)
async def explain_strategy(body: ExplainRequest, request: Request) -> dict:
    services = request.app.state.services
    settings = services.settings_store.load()
    strategies_dir = settings.strategies_directory_path

    try:
        strategy_source = _read_strategy_source(strategies_dir, body.strategy_name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    ollama_model = body.model or settings.ollama_model
    timeout = float(settings.ollama_timeout if settings.ollama_timeout else DEFAULT_TIMEOUT_GENERATE)

    if not settings.ollama_api_url:
        raise HTTPException(
            status_code=400,
            detail="Ollama API URL not configured in Settings",
        )
    if not ollama_model:
        raise HTTPException(
            status_code=422,
            detail="Ollama model not configured in Settings",
        )

    config = config_from_settings(settings, model_override=ollama_model, timeout=timeout, require_model=True)
    client = OllamaClient(config=config)
    try:
        explanation = await client.generate(
            f"Strategy code:\n{strategy_source}",
            system_prompt=SYSTEM_PROMPT,
            model=ollama_model,
            feature="explain_strategy",
        )
    finally:
        await client.close()

    if explanation is None:
        raise HTTPException(status_code=502, detail="Ollama returned an empty or invalid response.")

    return {
        "strategy_name": body.strategy_name,
        "model": ollama_model,
        "explanation": explanation,
    }


# ── AutoQuant AI Agent endpoint ───────────────────────────────────────────────────

class AutoQuantRequest(BaseModel):
    message: str = Field(..., description="User message to the AutoQuant AI agent")
    session_id: str | None = Field(None, description="Session ID for tracking")
    model: str | None = Field(None, description="Ollama model to use (optional)")


@router.post(
    "/autoquant",
    summary="Chat with AutoQuant AI agent",
    description="Send a message to the AutoQuant AI agent which will use Ollama to execute the full 8-step AutoQuant workflow with tool calling capabilities.",
)
async def autoquant_chat(body: AutoQuantRequest, request: Request) -> dict:
    """Chat with AutoQuant AI agent using Ollama model with tool calling capabilities."""
    # Import the AI agent tools
    from .ai_agent import SYSTEM_PROMPT as AUTOQUANT_SYSTEM_PROMPT, TOOLS
    from ...services.ai import get_ai_service
    
    services = request.app.state.services
    settings = services.settings_store.load()
    
    # Create or get session
    session_id = body.session_id or str(uuid.uuid4())
    
    try:
        # Get AI service instance
        ai_service = await get_ai_service(settings.user_data_directory_path)
        
        # Prepare messages with AutoQuant system prompt
        messages = [
            {"role": "system", "content": AUTOQUANT_SYSTEM_PROMPT},
            {"role": "user", "content": body.message}
        ]
        
        # Prepare tools for function calling
        tools = TOOLS
        
        # Call Ollama with tools using centralized service
        response = await ai_service.chat_with_tools(
            messages=messages,
            tools=tools,
            model=body.model or settings.ollama_model
        )
        
        # Extract tool calls if any
        tool_calls = []
        if hasattr(response, 'tool_calls') and response.tool_calls:
            tool_calls = list(response.tool_calls)
        
        return {
            "response": response.content if hasattr(response, 'content') else str(response),
            "session_id": session_id,
            "tool_calls": tool_calls,
            "model": body.model or settings.ollama_model
        }
    except RuntimeError as e:
        return {
            "response": f"Ollama is not configured or unavailable: {str(e)}",
            "session_id": session_id,
            "tool_calls": [],
            "model": body.model or settings.ollama_model,
            "error": "Ollama not configured"
        }
    except Exception as e:
        return {
            "response": f"AutoQuant AI agent chat failed: {str(e)}",
            "session_id": session_id,
            "tool_calls": [],
            "model": body.model or settings.ollama_model,
            "error": str(e)
        }
