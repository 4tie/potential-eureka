"""FastAPI application factory.

Usage
-----
    from backend.api.app import create_app
    app = create_app()          # default root_dir inference
    app = create_app(root_dir)  # explicit project root

The factory uses a lifespan context manager so AppServices, the SessionStore,
and the LogBroadcaster are created once at startup and torn down on shutdown.
"""

from __future__ import annotations

import time as _time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Simple in-memory rate limiter (no external deps) ─────────────────────────
_RATE_STORE: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60.0          # seconds per window
_RATE_LIMITS: dict[str, int] = {
    "/api/backtest/run":  10,   # 10 per minute
    "/api/candidate/evaluate": 10,  # 10 per minute
}

from ..core.errors import BackendError
from ..runtime import create_services
from .log_broadcaster import LogBroadcaster, wire_service_callbacks
from .session_store import SessionStore
from .routers import data, backtest, stress_lab, temporal_stress_lab, session, settings, logs, strategies, pairs, shared_state, results, results_list, system_health, optimizer, performance, ai_assistant, pair_explorer, auto_quant, agent, ai_agent, candidate, charts
from ..services.auto_quant import pipeline as _aq_pipeline


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    root_dir: Path | None = getattr(app.state, "_root_dir", None)

    services = create_services(root_dir)
    broadcaster = LogBroadcaster(maxlen=500)
    wire_service_callbacks(services, broadcaster)

    sessions_path = Path(services.settings_store.root_dir) / "user_data" / "sessions.json"
    app.state.services = services
    app.state.session_store = SessionStore(store_path=sessions_path)
    app.state.log_broadcaster = broadcaster

    # Initialize AI agent session manager
    from .routers.ai_agent import SessionManager
    aq_settings = services.settings_store.load()
    app.state.ai_agent_session_manager = SessionManager(
        user_data_dir=aq_settings.user_data_directory_path
    )

    # Restore previous Auto-Quant pipeline runs from disk
    try:
        aq_settings = services.settings_store.load()
        _aq_pipeline.load_runs_from_disk(aq_settings.user_data_directory_path)
    except Exception:
        import logging as _logging
        _logging.getLogger("auto_quant.pipeline").exception(
            "load_runs_from_disk failed during startup — run history may be incomplete."
        )

    yield

    # Cleanup AI service during shutdown
    try:
        from ..services.ai import cleanup_ai_service
        await cleanup_ai_service()
    except Exception:
        import logging as _logging
        _logging.getLogger("ai_service").exception("AI service cleanup failed during shutdown")


def create_app(root_dir: Path | None = None) -> FastAPI:
    """Build and return the configured FastAPI application.

    Args:
        root_dir: Optional explicit project root.  When ``None`` the runtime
            module infers it as the parent of the ``backend`` package directory.
    """
    app = FastAPI(
        title="Strategy Lab API",
        description=(
            "Programmatic engine for Freqtrade-based strategy development. "
            "Exposes pair selection, data download, backtesting, parameter "
            "optimisation, and stress testing as non-blocking REST endpoints, "
            "with real-time log streaming via Server-Sent Events."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=_lifespan,
    )

    if root_dir is not None:
        app.state._root_dir = root_dir

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def _rate_limit_middleware(request: Request, call_next):
        limit = _RATE_LIMITS.get(request.url.path)
        if limit and request.method == "POST":
            now    = _time.monotonic()
            client = request.client.host if request.client else "unknown"
            key    = f"{client}:{request.url.path}"
            hits   = _RATE_STORE[key]
            _RATE_STORE[key] = [t for t in hits if now - t < _RATE_WINDOW]
            if len(_RATE_STORE[key]) >= limit:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": (
                            f"Rate limit exceeded: max {limit} requests/min "
                            f"for {request.url.path}. Please wait before retrying."
                        )
                    },
                )
            _RATE_STORE[key].append(now)
        return await call_next(request)

    @app.exception_handler(BackendError)
    async def _backend_error_handler(request: Request, exc: BackendError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message},
        )

    app.include_router(shared_state.router)
    app.include_router(strategies.router)
    app.include_router(pairs.router)
    app.include_router(data.router)
    app.include_router(backtest.router)
    app.include_router(stress_lab.router)
    app.include_router(temporal_stress_lab.router)
    app.include_router(session.router)
    app.include_router(settings.router)
    app.include_router(logs.router)
    app.include_router(results.router)
    app.include_router(results_list.router)
    app.include_router(system_health.router)
    app.include_router(optimizer.router)
    app.include_router(performance.router)
    app.include_router(ai_assistant.router)
    app.include_router(agent.router)
    app.include_router(pair_explorer.router)
    app.include_router(auto_quant.router)
    app.include_router(ai_agent.router)
    app.include_router(candidate.router)
    app.include_router(charts.router)

    @app.get("/health", tags=["Health"])
    async def health() -> dict:
        """Liveness probe — returns 200 when the server is up."""
        return {"status": "ok"}

    return app
