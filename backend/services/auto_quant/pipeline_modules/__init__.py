"""Auto-Quant Pipeline Module.

This module provides the automated strategy optimization pipeline for Freqtrade.
The pipeline runs 6 stages sequentially:
1. Pre-Flight Filtering
2. Portfolio Baseline Backtest
3. WFA Hyperopt
4. Robustness & Feature Injection
5. Portfolio Competition
6. Delivery

The pipeline includes self-healing retry logic for overfitting detection.
"""

from __future__ import annotations

from .config import (
    BROAD_UNIVERSE_PAIRS,
    DEFAULT_STRESS_PAIRS,
    MAX_DRAWDOWN_THRESHOLD,
    MIN_OOS_PROFIT,
    MIN_PROFIT_FACTOR,
    MIN_SHARPE,
    MIN_WIN_RATE,
    STAGE_NAMES,
    get_timeframe_thresholds,
)
from .logging import logger
from .orchestrator import run_pipeline
from .state import (
    PipelineState,
    StageState,
    create_run,
    get_cancel_flags,
    get_queue,
    get_state,
    get_states,
    list_runs,
    load_runs_from_disk,
    release_queue,
    request_cancel,
)

__all__ = [
    # Main entry point
    "run_pipeline",
    # State management
    "PipelineState",
    "StageState",
    "create_run",
    "get_state",
    "get_states",
    "get_queue",
    "release_queue",
    "request_cancel",
    "get_cancel_flags",
    "list_runs",
    "load_runs_from_disk",
    # Configuration
    "STAGE_NAMES",
    "DEFAULT_STRESS_PAIRS",
    "BROAD_UNIVERSE_PAIRS",
    "MAX_DRAWDOWN_THRESHOLD",
    "MIN_OOS_PROFIT",
    "MIN_PROFIT_FACTOR",
    "MIN_SHARPE",
    "MIN_WIN_RATE",
    "get_timeframe_thresholds",
    # Logging
    "logger",
]
