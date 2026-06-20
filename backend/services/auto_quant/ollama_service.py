"""Ollama AI service for AutoQuant pipeline enhancements.

This module provides a robust, non-blocking Ollama client with graceful fallbacks,
JSON response cleaning, and data pre-processing functions for AI-powered enhancements.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..ai.ollama_client import CircuitBreaker, OllamaClient
from ..ai.ollama_config import config_from_user_data_dir

logger = logging.getLogger(__name__)


# Global circuit breaker for ollama API calls
_ollama_circuit_breaker = CircuitBreaker(failure_threshold=5, cooldown_seconds=300)


def clean_json_response(response: str) -> str:
    """Strip conversational text and markdown blocks from AI response.
    
    This function handles various AI response formats:
    - Markdown code blocks (```json ... ```)
    - Conversational prefixes ("Here is the analysis:")
    - Conversational suffixes
    - Multiple JSON blocks
    
    Args:
        response: Raw AI response text
        
    Returns:
        Cleaned JSON string or original if no JSON found
    """
    if not response:
        return response
    
    cleaned = response.strip()
    
    # Remove markdown code blocks
    # Pattern: ```json or ``` followed by content and ```
    code_block_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
    matches = re.findall(code_block_pattern, cleaned)
    
    if matches:
        # Take the last code block (most likely to be the actual JSON)
        cleaned = matches[-1].strip()
    
    # Remove common conversational prefixes
    prefix_patterns = [
        r"^Here is (?:the )?(?:analysis|response|result|output):\s*",
        r"^The (?:analysis|response|result|output) (?:is|follows):\s*",
        r"^Analysis:\s*",
        r"^Response:\s*",
        r"^Result:\s*",
        r"^Output:\s*",
    ]
    
    for pattern in prefix_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    
    # Remove conversational suffixes
    suffix_patterns = [
        r"\s*(?:Let me know if you need anything else|Hope this helps|Is there anything else)\.?\s*$",
        r"\s*(?:Please let me know if you have any questions)\.?\s*$",
    ]
    
    for pattern in suffix_patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    
    # Try to extract JSON object if still surrounded by text
    # Look for { ... } pattern
    json_pattern = r"\{[\s\S]*\}"
    json_matches = re.findall(json_pattern, cleaned)
    
    if json_matches:
        # Take the largest JSON object (most likely to be complete)
        cleaned = max(json_matches, key=len)
    
    return cleaned.strip()


def summarize_hyperopt_trials(trials: list[dict[str, Any]]) -> str:
    """Calculate statistics and correlations from hyperopt trials.
    
    This function pre-processes hyperopt trial data to create a concise
    summary for AI analysis, avoiding context window overflow.
    
    Args:
        trials: List of trial dicts with params_dict and loss
        
    Returns:
        Concise text summary of trial statistics
    """
    if not trials:
        return "No trials available for analysis"
    
    # Extract parameters and losses
    param_names = set()
    param_values: dict[str, list[float]] = {}
    losses: list[float] = []
    
    for trial in trials:
        params_dict = trial.get("params_dict", {})
        loss = trial.get("loss")
        
        if loss is not None:
            losses.append(float(loss))
        
        for param_name, param_value in params_dict.items():
            param_names.add(param_name)
            if param_name not in param_values:
                param_values[param_name] = []
            
            # Convert to float if possible
            try:
                param_values[param_name].append(float(param_value))
            except (ValueError, TypeError):
                pass
    
    if not losses:
        return "No valid loss values in trials"
    
    # Calculate loss statistics
    loss_mean = sum(losses) / len(losses)
    loss_std = (sum((x - loss_mean) ** 2 for x in losses) / len(losses)) ** 0.5
    loss_min = min(losses)
    loss_max = max(losses)
    
    summary_parts = [f"Loss: mean={loss_mean:.4f}, std={loss_std:.4f}, min={loss_min:.4f}, max={loss_max:.4f}"]
    
    # Calculate parameter statistics
    for param_name in sorted(param_names):
        values = param_values.get(param_name, [])
        if not values:
            continue
        
        param_mean = sum(values) / len(values)
        param_std = (sum((x - param_mean) ** 2 for x in values) / len(values)) ** 0.5
        param_min = min(values)
        param_max = max(values)
        
        # Check if clustered at boundaries (within 5% of range)
        param_range = param_max - param_min
        if param_range > 0:
            at_lower_bound = abs(param_min - param_mean) < 0.05 * param_range
            at_upper_bound = abs(param_max - param_mean) < 0.05 * param_range
            
            bound_info = ""
            if at_lower_bound:
                bound_info = " (clustered at lower bound)"
            elif at_upper_bound:
                bound_info = " (clustered at upper bound)"
        else:
            bound_info = " (constant)"
        
        summary_parts.append(
            f"{param_name}: mean={param_mean:.4f}, std={param_std:.4f}, "
            f"min={param_min:.4f}, max={param_max:.4f}{bound_info}"
        )
    
    # Calculate correlation with loss (simplified)
    correlation_parts = []
    for param_name in sorted(param_names):
        values = param_values.get(param_name, [])
        if len(values) != len(losses):
            continue
        
        # Simple correlation calculation
        if len(values) < 2:
            continue
        
        try:
            mean_x = sum(values) / len(values)
            mean_y = sum(losses) / len(losses)
            
            numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(values, losses))
            denominator_x = sum((x - mean_x) ** 2 for x in values) ** 0.5
            denominator_y = sum((y - mean_y) ** 2 for y in losses) ** 0.5
            
            if denominator_x > 0 and denominator_y > 0:
                correlation = numerator / (denominator_x * denominator_y)
                
                if abs(correlation) < 0.1:
                    correlation_parts.append(f"{param_name} has negligible correlation with loss ({correlation:.2f})")
                elif abs(correlation) > 0.7:
                    correlation_parts.append(f"{param_name} has strong correlation with loss ({correlation:.2f})")
        except (ZeroDivisionError, ValueError):
            pass
    
    if correlation_parts:
        summary_parts.append("Correlations: " + "; ".join(correlation_parts))
    
    return "; ".join(summary_parts)


def summarize_market_conditions(price_data: list[dict[str, Any]]) -> str:
    """Extract volatility and regime information from price data.
    
    This function pre-processes price data to create a concise summary
    for AI analysis, avoiding context window overflow.
    
    Args:
        price_data: List of price data points with timestamp, open, high, low, close
        
    Returns:
        Concise text summary of market conditions
    """
    if not price_data or len(price_data) < 2:
        return "Insufficient price data for analysis"
    
    # Extract close prices
    closes = []
    for point in price_data:
        close = point.get("close")
        if close is not None:
            try:
                closes.append(float(close))
            except (ValueError, TypeError):
                pass
    
    if len(closes) < 2:
        return "Insufficient valid close prices for analysis"
    
    # Calculate returns
    returns = []
    for i in range(1, len(closes)):
        ret = (closes[i] - closes[i-1]) / closes[i-1]
        returns.append(ret)
    
    # Calculate volatility (std of returns)
    if returns:
        mean_return = sum(returns) / len(returns)
        volatility = (sum((r - mean_return) ** 2 for r in returns) / len(returns)) ** 0.5
        volatility_pct = volatility * 100
    else:
        volatility_pct = 0.0
    
    # Calculate ATR (Average True Range) - simplified
    atr_values = []
    for i in range(1, len(price_data)):
        prev = price_data[i-1]
        curr = price_data[i]
        
        try:
            high = float(curr.get("high", 0))
            low = float(curr.get("low", 0))
            prev_close = float(prev.get("close", 0))
            
            tr1 = high - low
            tr2 = abs(high - prev_close)
            tr3 = abs(low - prev_close)
            
            atr = max(tr1, tr2, tr3)
            atr_values.append(atr)
        except (ValueError, TypeError):
            pass
    
    if atr_values:
        atr = sum(atr_values) / len(atr_values)
    else:
        atr = 0.0
    
    # Detect regime
    if volatility_pct > 2.0:
        regime = "high volatility"
    elif volatility_pct < 0.5:
        regime = "low volatility"
    else:
        regime = "normal volatility"
    
    # Trend detection (simple linear regression slope)
    if len(closes) >= 10:
        x = list(range(len(closes)))
        mean_x = sum(x) / len(x)
        mean_y = sum(closes) / len(closes)
        
        numerator = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, closes))
        denominator = sum((xi - mean_x) ** 2 for xi in x)
        
        if denominator > 0:
            slope = numerator / denominator
            trend_strength = abs(slope) / mean_y if mean_y != 0 else 0
            
            if trend_strength > 0.01:
                trend = "strong"
            elif trend_strength > 0.005:
                trend = "moderate"
            else:
                trend = "weak"
            
            trend_direction = "upward" if slope > 0 else "downward"
        else:
            trend = "weak"
            trend_direction = "neutral"
    else:
        trend = "insufficient data"
        trend_direction = "neutral"
    
    return (
        f"Regime: {regime}; "
        f"Volatility: {volatility_pct:.2f}%; "
        f"ATR: {atr:.6f}; "
        f"Trend: {trend} {trend_direction}"
    )


def summarize_failure_metrics(failed_metrics: dict[str, Any]) -> str:
    """Format failed metrics for AI analysis.
    
    This function formats failed metrics into a concise summary
    for AI diagnosis, avoiding context window overflow.
    
    Args:
        failed_metrics: Dict of failed metrics including thresholds
        
    Returns:
        Concise text summary of failure analysis
    """
    if not failed_metrics:
        return "No failure metrics available"
    
    summary_parts = []
    
    # Common metric mappings
    metric_names = {
        "profit": "Profit",
        "profit_total": "Profit",
        "max_drawdown": "Max Drawdown",
        "max_drawdown_account": "Max Drawdown",
        "win_rate": "Win Rate",
        "profit_factor": "Profit Factor",
        "sharpe_ratio": "Sharpe Ratio",
        "sharpe": "Sharpe Ratio",
    }
    
    # Extract failed checks
    checks = failed_metrics.get("checks", {})
    
    for metric_key, check_info in checks.items():
        if isinstance(check_info, dict):
            passed = check_info.get("passed", True)
            if not passed:
                value = check_info.get("value", "N/A")
                threshold = check_info.get("threshold", "N/A")
                metric_name = metric_names.get(metric_key, metric_key.replace("_", " ").title())
                summary_parts.append(f"Failed: {metric_name}={value} (threshold: {threshold})")
    
    # If no checks, look for raw metrics
    if not summary_parts:
        for metric_key, metric_name in metric_names.items():
            if metric_key in failed_metrics:
                value = failed_metrics[metric_key]
                threshold_key = f"min_{metric_key}" if not metric_key.startswith("min_") else f"{metric_key.replace('min_', '')}_threshold"
                threshold = failed_metrics.get(threshold_key, failed_metrics.get(f"max_{metric_key}", "N/A"))
                
                summary_parts.append(f"{metric_name}={value} (threshold: {threshold})")
    
    # Add reason if available
    reason = failed_metrics.get("reason")
    if reason:
        summary_parts.append(f"Reason: {reason}")
    
    return "; ".join(summary_parts) if summary_parts else "No specific failure information"


def create_ollama_client_from_settings(
    user_data_dir: str,
    timeout: int | None = None,
    health_timeout: int = 5,
    strict_json: bool = True,
    log_dir: str | None = None,
) -> OllamaClient | None:
    """Create OllamaClient instance by reading from settings file.
    
    This helper function reads Ollama configuration from the settings file
    (strategy_lab_settings.json) and creates an OllamaClient instance.
    
    Args:
        user_data_dir: Path to user_data directory containing settings file
        timeout: Timeout in seconds for generate requests (overrides settings if provided)
        health_timeout: Timeout in seconds for health checks
        strict_json: Whether to use format="json" parameter
        log_dir: Directory to store prompt/response logs
        
    Returns:
        OllamaClient instance or None if settings cannot be read
    """
    try:
        config = config_from_user_data_dir(
            user_data_dir,
            timeout=timeout,
            health_timeout=health_timeout,
            strict_json=strict_json,
            log_dir=log_dir,
        )
        if config is None:
            return None
        logger.info(
            "Creating shared OllamaClient from settings: base_url=%s, model=%s, timeout=%s, provider=%s",
            config.base_url,
            config.model,
            config.timeout,
            config.provider,
        )
        return OllamaClient(config=config)
    except Exception as e:
        logger.warning(f"Failed to create OllamaClient from settings: {e}")
        return None


def detect_strategy_type(strategy_name: str) -> dict[str, str]:
    """Detect strategy type and characteristics from strategy name.
    
    Args:
        strategy_name: Name of the strategy (e.g., "AdaptiveFactory", "MultiMa_v3")
        
    Returns:
        Dict with strategy characteristics:
        {
            "type": "regime-switching" | "multi-indicator" | "trend-following" | "unknown",
            "description": "Human-readable description",
            "characteristics": ["key1", "key2"]
        }
    """
    strategy_lower = strategy_name.lower()
    
    if "adaptive" in strategy_lower:
        return {
            "type": "regime-switching",
            "description": "Regime-switching strategy that adapts parameters based on market conditions",
            "characteristics": ["ATR-based regime detection", "dual parameter sets", "dynamic adjustment"]
        }
    elif "multi" in strategy_lower or "ma" in strategy_lower:
        return {
            "type": "multi-indicator",
            "description": "Multi-indicator strategy using multiple technical indicators",
            "characteristics": ["multiple signal sources", "weighted consensus", "diversified signals"]
        }
    elif "trend" in strategy_lower or "momentum" in strategy_lower:
        return {
            "type": "trend-following",
            "description": "Trend-following strategy that rides market momentum",
            "characteristics": ["momentum-based", "trend detection", "breakout signals"]
        }
    else:
        return {
            "type": "unknown",
            "description": "Custom strategy with unknown characteristics",
            "characteristics": ["custom logic", "unknown parameters"]
        }


def _analyze_market_conditions(
    timeframe: str,
    in_sample_range: str,
    exchange: str,
) -> dict[str, str]:
    """Analyze market conditions based on timeframe, date range, and exchange.
    
    Args:
        timeframe: Trading timeframe (e.g., "5m", "1h", "1d")
        in_sample_range: Date range string (e.g., "20241201-20250101")
        exchange: Exchange name (e.g., "binance")
        
    Returns:
        Dict with market condition analysis:
        {
            "timeframe_type": "scalping" | "intraday" | "swing",
            "volatility_regime": "high" | "medium" | "low",
            "duration_days": int,
            "exchange_type": "spot" | "futures",
        }
    """
    # Analyze timeframe
    timeframe_map = {
        "1m": ("scalping", "high"),
        "3m": ("scalping", "high"),
        "5m": ("scalping", "high"),
        "15m": ("intraday", "medium"),
        "30m": ("intraday", "medium"),
        "1h": ("intraday", "medium"),
        "4h": ("swing", "low"),
        "1d": ("swing", "low"),
    }
    
    timeframe_type, volatility = timeframe_map.get(timeframe, ("intraday", "medium"))
    
    # Calculate duration from date range
    duration_days = 30  # Default
    try:
        if "-" in in_sample_range:
            parts = in_sample_range.split("-")
            if len(parts) == 2:
                # Simple estimation: assume YYYYMMDD format
                # This is a rough estimate, actual calculation would require datetime parsing
                duration_str = f"{in_sample_range}"
    except Exception:
        pass
    
    # Exchange type
    exchange_type = "spot"  # Default
    if "future" in exchange.lower():
        exchange_type = "futures"
    
    return {
        "timeframe_type": timeframe_type,
        "volatility_regime": volatility,
        "duration_days": duration_days,
        "exchange_type": exchange_type,
    }


def _analyze_historical_success_rates(
    retry_history: list[dict[str, Any]],
) -> dict[str, Any]:
    """Analyze retry history to identify successful parameter patterns.
    
    Args:
        retry_history: List of retry attempts with parameters and results
        
    Returns:
        Dict with success rate analysis:
        {
            "loss_success_rates": {"SharpeHyperOptLoss": 0.5, ...},
            "spaces_success_rates": {("buy", "stoploss"): 0.3, ...},
            "epochs_success_rates": {100: 0.4, ...},
            "best_combinations": [{"loss": "...", "spaces": [...], "epochs": 100, "profit": 0.1}],
        }
    """
    if not retry_history:
        return {
            "loss_success_rates": {},
            "spaces_success_rates": {},
            "epochs_success_rates": {},
            "best_combinations": [],
        }
    
    # Group by loss function
    loss_attempts: dict[str, list[dict]] = {}
    # Group by spaces (as tuple for hashability)
    spaces_attempts: dict[tuple, list[dict]] = {}
    # Group by epochs
    epochs_attempts: dict[int, list[dict]] = {}
    
    for attempt in retry_history:
        loss = attempt.get("loss", "")
        spaces = tuple(sorted(attempt.get("spaces", [])))
        epochs = attempt.get("epochs", 0)
        passed = attempt.get("passed", False)
        
        if loss:
            if loss not in loss_attempts:
                loss_attempts[loss] = []
            loss_attempts[loss].append({"passed": passed, "profit": attempt.get("profit")})
        
        if spaces:
            if spaces not in spaces_attempts:
                spaces_attempts[spaces] = []
            spaces_attempts[spaces].append({"passed": passed, "profit": attempt.get("profit")})
        
        if epochs:
            if epochs not in epochs_attempts:
                epochs_attempts[epochs] = []
            epochs_attempts[epochs].append({"passed": passed, "profit": attempt.get("profit")})
    
    # Calculate success rates
    loss_success_rates = {}
    for loss, attempts in loss_attempts.items():
        passed_count = sum(1 for a in attempts if a["passed"])
        loss_success_rates[loss] = passed_count / len(attempts) if attempts else 0
    
    spaces_success_rates = {}
    for spaces, attempts in spaces_attempts.items():
        passed_count = sum(1 for a in attempts if a["passed"])
        spaces_success_rates[spaces] = passed_count / len(attempts) if attempts else 0
    
    epochs_success_rates = {}
    for epochs, attempts in epochs_attempts.items():
        passed_count = sum(1 for a in attempts if a["passed"])
        epochs_success_rates[epochs] = passed_count / len(attempts) if attempts else 0
    
    # Find best combinations (highest profit among passed attempts)
    best_combinations = []
    for attempt in retry_history:
        if attempt.get("passed", False) and attempt.get("profit") is not None:
            best_combinations.append({
                "loss": attempt.get("loss"),
                "spaces": attempt.get("spaces"),
                "epochs": attempt.get("epochs"),
                "profit": attempt.get("profit"),
            })
    
    # Sort by profit descending and take top 3
    best_combinations.sort(key=lambda x: x.get("profit", 0), reverse=True)
    best_combinations = best_combinations[:3]
    
    return {
        "loss_success_rates": loss_success_rates,
        "spaces_success_rates": spaces_success_rates,
        "epochs_success_rates": epochs_success_rates,
        "best_combinations": best_combinations,
    }


# Safe ranges for parameter validation
SAFE_RANGES = {
    "stoploss": {"min": -0.35, "max": -0.01},
    "max_drawdown_threshold": {"min": 0.05, "max": 0.50},
    "hyperopt_epochs": {"min": 50, "max": 500},
    "min_win_rate": {"min": 0.1, "max": 0.9},
    "min_sharpe": {"min": 0.5, "max": 5.0},
    "min_profit_factor": {"min": 1.0, "max": 5.0},
}


def validate_ollama_suggestions(
    suggestions: dict[str, Any],
    strategy_template: dict[str, Any] | None = None,
) -> tuple[bool, str | None]:
    """Validate ollama suggestions for Freqtrade-specific constraints and safe ranges.
    
    Args:
        suggestions: Dict with suggested parameters from ollama
        strategy_template: Optional strategy template to check for conflicts
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    errors = []
    
    # 0. Convert boolean strings to actual booleans in param_overrides
    if "param_overrides" in suggestions and suggestions["param_overrides"]:
        param_overrides = suggestions["param_overrides"]
        for key, value in param_overrides.items():
            if isinstance(value, str) and value.lower() in ["true", "false"]:
                param_overrides[key] = True if value.lower() == "true" else False
    
    # 1. Validate stoploss sign (must be negative)
    if "param_overrides" in suggestions and suggestions["param_overrides"]:
        param_overrides = suggestions["param_overrides"]
        if "stoploss" in param_overrides:
            stoploss = param_overrides["stoploss"]
            if stoploss is not None and stoploss >= 0:
                errors.append(f"Stoploss must be negative, got {stoploss}")
    
    # 2. Validate ROI monotonicity (must decrease as time increases)
    if "param_overrides" in suggestions and suggestions["param_overrides"]:
        param_overrides = suggestions["param_overrides"]
        if "roi" in param_overrides and isinstance(param_overrides["roi"], dict):
            roi = param_overrides["roi"]
            # ROI should be a dict with time keys and profit values
            # Check that profits decrease as time increases
            time_values = []
            for key, value in roi.items():
                try:
                    time_val = int(key)
                    profit_val = float(value)
                    time_values.append((time_val, profit_val))
                except (ValueError, TypeError):
                    continue
            
            # Sort by time and check monotonicity
            time_values.sort(key=lambda x: x[0])
            for i in range(1, len(time_values)):
                if time_values[i][1] > time_values[i-1][1]:
                    errors.append(
                        f"ROI must be monotonically decreasing: "
                        f"at {time_values[i][0]}min profit is {time_values[i][1]} "
                        f"but at {time_values[i-1][0]}min profit is {time_values[i-1][1]}"
                    )
                    break
    
    # 3. Validate hyperopt_spaces are valid Freqtrade spaces
    if "hyperopt_spaces" in suggestions:
        suggested_spaces = suggestions["hyperopt_spaces"]
        if isinstance(suggested_spaces, list):
            valid_spaces = {"buy", "sell", "roi", "stoploss", "trailing", "default", "all"}
            invalid_spaces = [s for s in suggested_spaces if s not in valid_spaces]
            if invalid_spaces:
                errors.append(f"Invalid hyperopt_spaces: {invalid_spaces}. Valid spaces: {valid_spaces}")
    
    # 4. Validate space conflicts against strategy template
    if strategy_template and "hyperopt_spaces" in suggestions:
        suggested_spaces = suggestions["hyperopt_spaces"]
        if isinstance(suggested_spaces, list):
            # Check if strategy disables trailing stops
            if strategy_template.get("trailing_stop", False) is False:
                if "trailing" in suggested_spaces:
                    errors.append("Strategy disables trailing stops, but AI suggested trailing space")
    
    # 4. Validate safe ranges
    # Check hyperopt_epochs
    if "hyperopt_epochs" in suggestions:
        epochs = suggestions["hyperopt_epochs"]
        if epochs is not None:
            if not (SAFE_RANGES["hyperopt_epochs"]["min"] <= epochs <= SAFE_RANGES["hyperopt_epochs"]["max"]):
                errors.append(
                    f"hyperopt_epochs {epochs} outside safe range "
                    f"[{SAFE_RANGES['hyperopt_epochs']['min']}, {SAFE_RANGES['hyperopt_epochs']['max']}]"
                )
    
    # Check param_overrides against safe ranges
    if "param_overrides" in suggestions and suggestions["param_overrides"]:
        param_overrides = suggestions["param_overrides"]
        
        if "max_drawdown_threshold" in param_overrides:
            dd = param_overrides["max_drawdown_threshold"]
            if dd is not None and not (SAFE_RANGES["max_drawdown_threshold"]["min"] <= dd <= SAFE_RANGES["max_drawdown_threshold"]["max"]):
                errors.append(
                    f"max_drawdown_threshold {dd} outside safe range "
                    f"[{SAFE_RANGES['max_drawdown_threshold']['min']}, {SAFE_RANGES['max_drawdown_threshold']['max']}]"
                )
        
        if "min_win_rate" in param_overrides:
            wr = param_overrides["min_win_rate"]
            if wr is not None and not (SAFE_RANGES["min_win_rate"]["min"] <= wr <= SAFE_RANGES["min_win_rate"]["max"]):
                errors.append(
                    f"min_win_rate {wr} outside safe range "
                    f"[{SAFE_RANGES['min_win_rate']['min']}, {SAFE_RANGES['min_win_rate']['max']}]"
                )
        
        if "min_sharpe" in param_overrides:
            sharpe = param_overrides["min_sharpe"]
            if sharpe is not None and not (SAFE_RANGES["min_sharpe"]["min"] <= sharpe <= SAFE_RANGES["min_sharpe"]["max"]):
                errors.append(
                    f"min_sharpe {sharpe} outside safe range "
                    f"[{SAFE_RANGES['min_sharpe']['min']}, {SAFE_RANGES['min_sharpe']['max']}]"
                )
    
    if errors:
        return False, "; ".join(errors)
    
    return True, None


def _extract_tried_combinations(
    retry_history: list[dict[str, Any]],
) -> set[tuple]:
    """Extract all previously tried (loss, spaces, epochs) combinations.
    
    Args:
        retry_history: List of retry attempts
        
    Returns:
        Set of tuples (loss, spaces_tuple, epochs) representing tried combinations
    """
    tried = set()
    for attempt in retry_history:
        loss = attempt.get("loss", "")
        spaces = tuple(sorted(attempt.get("spaces", [])))
        epochs = attempt.get("epochs", 0)
        tried.add((loss, spaces, epochs))
    return tried


async def ask_ollama_for_sensitivity_fix(
    sensitivity_result: dict[str, Any],
    retry_history: list[dict[str, Any]],
    current_state: Any,
) -> dict[str, Any] | None:
    """Ask Ollama for intelligent parameter adjustments to fix sensitivity failures.
    
    This function analyzes the sensitivity check failure (Sharp Peak) and uses
    Ollama to suggest parameter adjustments for the retry attempt.
    
    Args:
        sensitivity_result: Dict with sensitivity check results (p_best, p_minus, p_plus, param, etc.)
        retry_history: List of previous retry attempts with their parameters and results
        current_state: Current PipelineState with hyperopt settings
        
    Returns:
        Dict with suggested adjustments or None if ollama unavailable/failed:
        {
            "hyperopt_loss": str,  # e.g., "SharpeHyperOptLoss"
            "hyperopt_spaces": list[str],  # e.g., ["buy", "stoploss", "roi"]
            "hyperopt_epochs": int,  # e.g., 100
            "param_overrides": dict,  # e.g., {"use_ema_cross": True}
            "reasoning": str,  # AI explanation for the suggestions
        }
    """
    # Initialize ai_metrics if not present
    if not current_state.ai_metrics:
        current_state.ai_metrics = {
            "total_calls": 0,
            "json_parse_success": 0,
            "timeout_count": 0,
            "suggestion_applied_count": 0,
        }
    
    # Increment total calls
    current_state.ai_metrics["total_calls"] += 1
    
    client = create_ollama_client_from_settings(current_state.user_data_dir)
    if client is None:
        logger.warning("Ollama client not available for sensitivity fix")
        return None
    
    # Check circuit breaker before proceeding
    if not _ollama_circuit_breaker.should_allow_call():
        logger.warning(
            f"Circuit breaker is open (state={_ollama_circuit_breaker.state}). "
            "Skipping ollama call and using fallback logic."
        )
        return None
    
    # Check health before proceeding
    if not await client.check_health():
        logger.warning("Ollama health check failed for sensitivity fix")
        _ollama_circuit_breaker.record_failure()
        return None
    
    # Build enhanced context for the AI
    p_best = sensitivity_result.get("p_best")
    p_minus = sensitivity_result.get("p_minus")
    p_plus = sensitivity_result.get("p_plus")
    perturbed_param = sensitivity_result.get("param")
    failure_reason = sensitivity_result.get("failure_reason")
    
    # Strategy type context
    strategy_info = detect_strategy_type(current_state.strategy)
    
    # Market conditions context
    market_info = _analyze_market_conditions(
        current_state.timeframe,
        current_state.in_sample_range,
        current_state.exchange
    )
    
    # Historical success analysis
    success_analysis = _analyze_historical_success_rates(retry_history)
    
    # Extract tried combinations for constraints
    tried_combinations = _extract_tried_combinations(retry_history)
    
    retry_summary = "\n".join([
        f"Attempt {a.get('attempt', '?')}: loss={a.get('loss')}, spaces={a.get('spaces')}, "
        f"epochs={a.get('epochs')}, profit={a.get('profit')}, reason={a.get('reason')}"
        for a in retry_history[-3:]  # Last 3 attempts
    ]) if retry_history else "No previous attempts"
    
    # Build success rate summary
    success_summary_parts = []
    if success_analysis["loss_success_rates"]:
        loss_rates = ", ".join([f"{k}: {v:.0%}" for k, v in success_analysis["loss_success_rates"].items()])
        success_summary_parts.append(f"Loss function success rates: {loss_rates}")
    if success_analysis["spaces_success_rates"]:
        spaces_rates = ", ".join([f"{k}: {v:.0%}" for k, v in success_analysis["spaces_success_rates"].items()])
        success_summary_parts.append(f"Spaces success rates: {spaces_rates}")
    if success_analysis["best_combinations"]:
        best_str = ", ".join([
            f"{c['loss']}+{c['spaces']} (profit={c['profit']:.2%})"
            for c in success_analysis["best_combinations"]
        ])
        success_summary_parts.append(f"Best performing combinations: {best_str}")
    success_summary = "\n".join(success_summary_parts) if success_summary_parts else "No historical data"
    
    # Build failure-specific guidance
    if failure_reason == "FAIL_NEGATIVE_BASELINE":
        failure_guidance = (
            "DIAGNOSIS CONTEXT: FAIL_NEGATIVE_BASELINE.\n"
            "This means the current configuration is inherently losing money (profit < 0). Radical structural changes are needed.\n"
            "RECOMMENDATION MANDATES FOR NEGATIVE BASELINE:\n"
            "- Force core trend/volatility filters to True to stop bleeding (e.g., suggest 'use_ema_cross': true, 'use_atr': true).\n"
            "- Widen the search space to allow Freqtrade to discover profitable combinations (suggest ['buy', 'stoploss', 'roi']).\n"
            "- Suggest increasing hyperopt epochs to give the algorithm more time to escape the loss trap.\n"
            "- Consider switching to OnlyProfitHyperOptLoss to target pure return recovery."
        )
    else:
        failure_guidance = (
            "DIAGNOSIS CONTEXT: FAIL_SHARP_PEAK.\n"
            "This means the strategy is heavily overfitted to historical data.\n"
            "RECOMMENDATION MANDATES FOR SHARP PEAK:\n"
            "- Narrow down specific hyperopt spaces to prevent erratic hunting.\n"
            "- Recommend switching to stabilizing loss functions like 'SharpeHyperOptLoss' or 'ProfitDrawDownHyperOptLoss'."
        )
    
    # Build constraint summary
    if tried_combinations:
        constraint_str = "\n".join([
            f"- loss={loss}, spaces={list(spaces)}, epochs={epochs}"
            for loss, spaces, epochs in tried_combinations
        ])
    else:
        constraint_str = "No previous attempts"
    
    system_prompt = """You are an expert trading strategy optimization assistant specializing in sensitivity check failures.
Your task is to analyze sensitivity check failures (Sharp Peak or Negative Baseline) and suggest intelligent parameter adjustments.

You must handle two types of failures:
1. 'FAIL_SHARP_PEAK': Strategy is overfitted. Nearby parameters cause massive variance.
2. 'FAIL_NEGATIVE_BASELINE': The strategy is dead-on-arrival (unprofitable, net profit < 0 across trials).

CRITICAL RISK RULE: You can only make parameter search spaces and conditions stricter or structurally wider to find alpha. Never weaken risk filters.

Respond ONLY with valid JSON in this exact format:
{
    "hyperopt_loss": "loss_function_name",
    "hyperopt_spaces": ["space1", "space2"],
    "hyperopt_epochs": integer,
    "param_overrides": {"param_name": value},
    "reasoning": "brief explanation of your suggestions"
}

Valid hyperopt_loss functions: SharpeHyperOptLoss, ProfitDrawDownHyperOptLoss, CalmarHyperOptLoss, OnlyProfitHyperOptLoss
Valid hyperopt_spaces: buy, sell, roi, stoploss, trailing, default, all
param_overrides can include: use_ema_cross, use_atr, use_rsi, use_macd, use_bb, use_adx (boolean values)

IMPORTANT: You MUST NOT suggest parameter combinations that have already been tried and failed.
"""
    
    user_prompt = f"""{failure_guidance}

STRATEGY CONTEXT:
- Strategy name: {current_state.strategy}
- Strategy type: {strategy_info['type']}
- Strategy description: {strategy_info['description']}
- Strategy characteristics: {', '.join(strategy_info['characteristics'])}

MARKET CONDITIONS:
- Timeframe: {current_state.timeframe} ({market_info['timeframe_type']} trading)
- Volatility regime: {market_info['volatility_regime']}
- In-sample range: {current_state.in_sample_range} (~{market_info['duration_days']} days)
- Exchange: {current_state.exchange} ({market_info['exchange_type']})

SENSITIVITY FAILURE DETAILS:
- Best parameter profit: {p_best}
- Parameter -5% profit: {p_minus}
- Parameter +5% profit: {p_plus}
- Perturbed parameter: {perturbed_param}
- Failure reason: {failure_reason}

CURRENT HYPEROPT SETTINGS:
- Loss function: {current_state.hyperopt_loss}
- Search spaces: {list(current_state.hyperopt_spaces)}
- Epochs: {current_state.hyperopt_epochs}

RETRY HISTORY:
{retry_summary}

HISTORICAL SUCCESS PATTERNS:
{success_summary}

ALREADY TRIED COMBINATIONS (DO NOT SUGGEST THESE):
{constraint_str}

Based on the strategy type, market conditions, and historical patterns, suggest parameter adjustments.

Consider:
1. Strategy type: {strategy_info['type']} strategies may benefit from specific loss functions
2. Market conditions: {market_info['timeframe_type']} on {market_info['volatility_regime']} volatility may require different approaches
3. Historical patterns: Learn from which parameter combinations worked best in the past
4. Avoid repetition: Do not suggest combinations that have already been tried

Respond with JSON only."""
    
    try:
        response = await client.generate(user_prompt, system_prompt=system_prompt, feature="sensitivity_fix")
        if not response:
            logger.warning("Ollama returned empty response for sensitivity fix")
            _ollama_circuit_breaker.record_failure()
            current_state.ai_metrics["timeout_count"] += 1
            return None
        
        # Clean and parse JSON response
        cleaned = clean_json_response(response)
        
        try:
            import json as json_module
            suggestions = json_module.loads(cleaned)
            
            # Track JSON parse success
            current_state.ai_metrics["json_parse_success"] += 1
            
            # Validate required fields
            required_fields = ["hyperopt_loss", "hyperopt_spaces", "hyperopt_epochs"]
            for field in required_fields:
                if field not in suggestions:
                    logger.warning(f"Ollama response missing required field: {field}")
                    return None
            
            # Validate hyperopt_loss
            valid_losses = ["SharpeHyperOptLoss", "ProfitDrawDownHyperOptLoss", "CalmarHyperOptLoss", "OnlyProfitHyperOptLoss"]
            if suggestions["hyperopt_loss"] not in valid_losses:
                logger.warning(f"Invalid hyperopt_loss: {suggestions['hyperopt_loss']}")
                suggestions["hyperopt_loss"] = "SharpeHyperOptLoss"  # Fallback
            
            # Validate hyperopt_spaces
            valid_spaces = ["buy", "sell", "roi", "stoploss", "trailing", "default", "all"]
            if isinstance(suggestions["hyperopt_spaces"], list):
                suggestions["hyperopt_spaces"] = [s for s in suggestions["hyperopt_spaces"] if s in valid_spaces]
                if not suggestions["hyperopt_spaces"]:
                    suggestions["hyperopt_spaces"] = ["buy", "stoploss", "roi"]  # Fallback
            else:
                suggestions["hyperopt_spaces"] = ["buy", "stoploss", "roi"]  # Fallback
            
            # Validate and clamp hyperopt_epochs
            try:
                epochs = int(suggestions["hyperopt_epochs"])
                suggestions["hyperopt_epochs"] = max(50, min(epochs, 500))  # Clamp between 50 and 500
            except (ValueError, TypeError):
                suggestions["hyperopt_epochs"] = current_state.hyperopt_epochs  # Fallback to current
            
            # Ensure param_overrides is a dict
            if "param_overrides" not in suggestions or not isinstance(suggestions["param_overrides"], dict):
                suggestions["param_overrides"] = {}
            
            # Validate suggestions against safe ranges and constraints
            is_valid, validation_error = validate_ollama_suggestions(suggestions)
            if not is_valid:
                logger.warning(f"Ollama suggestions failed validation: {validation_error}")
                _ollama_circuit_breaker.record_failure()
                return None
            
            # Validate against tried combinations
            suggested_loss = suggestions["hyperopt_loss"]
            suggested_spaces = tuple(sorted(suggestions["hyperopt_spaces"]))
            suggested_epochs = suggestions["hyperopt_epochs"]
            suggested_tuple = (suggested_loss, suggested_spaces, suggested_epochs)
            
            if suggested_tuple in tried_combinations:
                logger.warning(
                    f"Ollama suggested already-tried combination: {suggested_tuple}. "
                    "Requesting alternative suggestion."
                )
                # Add constraint to prompt and retry once
                retry_system_prompt = system_prompt + "\n\nCRITICAL: Your previous suggestion was already tried. Suggest a DIFFERENT combination."
                retry_user_prompt = user_prompt + f"\n\nPREVIOUS SUGGESTION (REJECTED - ALREADY TRIED): {suggested_tuple}"
                
                try:
                    retry_response = await client.generate(retry_user_prompt, system_prompt=retry_system_prompt)
                    if retry_response:
                        retry_cleaned = clean_json_response(retry_response)
                        retry_suggestions = json_module.loads(retry_cleaned)
                        
                        # Validate retry suggestion
                        retry_loss = retry_suggestions.get("hyperopt_loss", suggested_loss)
                        retry_spaces = tuple(sorted(retry_suggestions.get("hyperopt_spaces", list(suggested_spaces))))
                        retry_epochs = retry_suggestions.get("hyperopt_epochs", suggested_epochs)
                        retry_tuple = (retry_loss, retry_spaces, retry_epochs)
                        
                        if retry_tuple not in tried_combinations:
                            # Validate retry suggestion fields
                            if all(field in retry_suggestions for field in required_fields):
                                if retry_suggestions["hyperopt_loss"] in valid_losses:
                                    retry_spaces_list = [s for s in retry_suggestions["hyperopt_spaces"] if s in valid_spaces]
                                    if retry_spaces_list:
                                        retry_suggestions["hyperopt_spaces"] = retry_spaces_list
                                        try:
                                            retry_epochs_int = int(retry_suggestions["hyperopt_epochs"])
                                            retry_suggestions["hyperopt_epochs"] = max(50, min(retry_epochs_int, 500))
                                        except (ValueError, TypeError):
                                            retry_suggestions["hyperopt_epochs"] = current_state.hyperopt_epochs
                                        
                                        if "param_overrides" not in retry_suggestions or not isinstance(retry_suggestions["param_overrides"], dict):
                                            retry_suggestions["param_overrides"] = {}
                                        
                                        logger.info(f"Ollama retry suggestion accepted: {retry_suggestions}")
                                        return retry_suggestions
                except Exception as retry_exc:
                    logger.warning(f"Retry attempt failed: {retry_exc}")
                
                # If retry also failed or suggested tried combination, fall back to None
                logger.warning("Ollama could not suggest a unique combination - using fallback logic")
                return None
            
            logger.info(f"Ollama sensitivity fix suggestions: {suggestions}")
            _ollama_circuit_breaker.record_success()
            
            # Track suggestion applied
            current_state.ai_metrics["suggestion_applied_count"] += 1
            
            # Add summary to ai_interactions
            current_state.ai_interactions.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "feature": "sensitivity_fix",
                "success": True,
                "reasoning": suggestions.get("reasoning", ""),
                "suggestions": {
                    "hyperopt_loss": suggestions.get("hyperopt_loss"),
                    "hyperopt_spaces": suggestions.get("hyperopt_spaces"),
                    "hyperopt_epochs": suggestions.get("hyperopt_epochs"),
                },
            })
            
            return suggestions
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse Ollama JSON response: {e}")
            _ollama_circuit_breaker.record_failure()
            return None
            
    except Exception as e:
        logger.warning(f"Error calling Ollama for sensitivity fix: {e}")
        _ollama_circuit_breaker.record_failure()
        return None
    finally:
        await client.close()


async def ask_ollama_for_wfa_fix(
    wfa_results: list[dict[str, Any]],
    current_state: Any,
) -> dict[str, Any] | None:
    """Ask Ollama for intelligent parameter adjustments to fix WFO failures.

    This function analyzes Walk-Forward Analysis failures (< 50% segment pass rate)
    and uses Ollama to suggest parameter adjustments for the retry attempt.

    Args:
        wfa_results: List of WFA segment results with profit, status, ranges, etc.
        current_state: Current PipelineState with hyperopt settings

    Returns:
        Dict with suggested adjustments or None if ollama unavailable/failed:
        {
            "hyperopt_loss": str,  # e.g., "SharpeHyperOptLoss"
            "hyperopt_spaces": list[str],  # e.g., ["buy", "stoploss", "roi"]
            "hyperopt_epochs": int,  # e.g., 100
            "param_overrides": dict,  # e.g., {"use_ema_cross": True}
            "reasoning": str,  # AI explanation for the suggestions
        }
    """
    # Initialize ai_metrics if not present
    if not current_state.ai_metrics:
        current_state.ai_metrics = {
            "total_calls": 0,
            "json_parse_success": 0,
            "timeout_count": 0,
            "suggestion_applied_count": 0,
        }

    # Increment total calls
    current_state.ai_metrics["total_calls"] += 1

    client = create_ollama_client_from_settings(current_state.user_data_dir)
    if client is None:
        logger.warning("Ollama client not available for WFA fix")
        return None

    # Check circuit breaker before proceeding
    if not _ollama_circuit_breaker.should_allow_call():
        logger.warning(
            f"Circuit breaker is open (state={_ollama_circuit_breaker.state}). "
            "Skipping ollama call and using fallback logic."
        )
        return None

    # Check health before proceeding
    if not await client.check_health():
        logger.warning("Ollama health check failed for WFA fix")
        _ollama_circuit_breaker.record_failure()
        return None

    # Calculate segment pass rate and statistics
    total_segments = len(wfa_results)
    passing_segments = [r for r in wfa_results if r.get("status") in ("passed", "warning")]
    pass_rate = len(passing_segments) / total_segments if total_segments > 0 else 0.0

    # Calculate profit statistics
    profits = [r.get("profit", 0) for r in wfa_results if r.get("profit") is not None]
    avg_profit = sum(profits) / len(profits) if profits else 0.0
    min_profit = min(profits) if profits else 0.0
    max_profit = max(profits) if profits else 0.0

    # Validate WFA results before proceeding
    if not wfa_results or total_segments == 0:
        logger.warning("No WFA results provided for analysis")
        return None

    # Build segment summary
    segment_summary = "\n".join([
        f"Segment {r.get('window', '?')}: IS={r.get('is_range', 'N/A')}, "
        f"OOS={r.get('oos_range', 'N/A')}, profit={r.get('profit', 0):.2f}%, "
        f"status={r.get('status', 'unknown')}"
        for r in wfa_results
    ])

    # Strategy type context
    strategy_info = detect_strategy_type(current_state.strategy)

    # Market conditions context
    market_info = _analyze_market_conditions(
        current_state.timeframe,
        current_state.in_sample_range,
        current_state.exchange
    )

    # Extract tried combinations from retry history
    tried_combinations = _extract_tried_combinations(current_state.retry_history)

    retry_summary = "\n".join([
        f"Attempt {a.get('attempt', '?')}: loss={a.get('loss')}, spaces={a.get('spaces')}, "
        f"epochs={a.get('epochs')}, profit={a.get('profit')}, reason={a.get('reason')}"
        for a in current_state.retry_history[-3:]  # Last 3 attempts
    ]) if current_state.retry_history else "No previous attempts"

    # Build constraint summary
    if tried_combinations:
        constraint_str = "\n".join([
            f"- loss={loss}, spaces={list(spaces)}, epochs={epochs}"
            for loss, spaces, epochs in tried_combinations
        ])
    else:
        constraint_str = "No previous attempts"

    system_prompt = """You are an expert trading strategy optimization assistant specializing in Walk-Forward Analysis failures.
Your task is to analyze WFA segment failures (low segment pass rate) and suggest intelligent parameter adjustments.

DIAGNOSIS CONTEXT: WFA SEGMENT PASS RATE FAILURE.
This means the strategy parameters do not generalize across different time periods. Less than 50% of WFA segments passed OOS validation.

RECOMMENDATION MANDATES FOR LOW PASS RATE:
- The strategy is likely overfitted to specific market conditions.
- Consider widening search spaces to allow more parameter exploration.
- Consider switching to more robust loss functions (e.g., SharpeHyperOptLoss).
- Force core trend/volatility filters to improve generalization (e.g., suggest 'use_ema_cross': true, 'use_atr': true).
- Increase hyperopt epochs to give the algorithm more time to find robust parameters.

CRITICAL RISK RULE: You can only make parameter search spaces and conditions stricter or structurally wider to find alpha. Never weaken risk filters.

Respond ONLY with valid JSON in this exact format:
{
    "hyperopt_loss": "loss_function_name",
    "hyperopt_spaces": ["space1", "space2"],
    "hyperopt_epochs": integer,
    "param_overrides": {"param_name": value},
    "reasoning": "brief explanation of your suggestions"
}

Valid hyperopt_loss functions: SharpeHyperOptLoss, ProfitDrawDownHyperOptLoss, CalmarHyperOptLoss, OnlyProfitHyperOptLoss
Valid hyperopt_spaces: buy, sell, roi, stoploss, trailing, default, all
param_overrides can include: use_ema_cross, use_atr, use_rsi, use_macd, use_bb, use_adx (boolean values)

IMPORTANT: You MUST NOT suggest parameter combinations that have already been tried and failed.
"""

    user_prompt = f"""WFA FAILURE ANALYSIS:

SEGMENT PASS RATE: {pass_rate:.1%} ({len(passing_segments)}/{total_segments} segments passed)
- Required threshold: 50%
- Current status: FAILED

PROFIT STATISTICS:
- Average profit: {avg_profit:.2f}%
- Min profit: {min_profit:.2f}%
- Max profit: {max_profit:.2f}%

SEGMENT DETAILS:
{segment_summary}

STRATEGY CONTEXT:
- Strategy name: {current_state.strategy}
- Strategy type: {strategy_info['type']}
- Strategy description: {strategy_info['description']}
- Strategy characteristics: {', '.join(strategy_info['characteristics'])}

MARKET CONDITIONS:
- Timeframe: {current_state.timeframe} ({market_info['timeframe_type']} trading)
- Volatility regime: {market_info['volatility_regime']}
- In-sample range: {current_state.in_sample_range} (~{market_info['duration_days']} days)
- Exchange: {current_state.exchange} ({market_info['exchange_type']})

WFO CONFIGURATION:
- IS months: {current_state.wfo_is_months}
- OOS months: {current_state.wfo_oos_months}
- Recency weight: {current_state.wfo_recency_weight}

CURRENT HYPEROPT SETTINGS:
- Loss function: {current_state.hyperopt_loss}
- Search spaces: {list(current_state.hyperopt_spaces)}
- Epochs: {current_state.hyperopt_epochs}

RETRY HISTORY:
{retry_summary}

ALREADY TRIED COMBINATIONS (DO NOT SUGGEST THESE):
{constraint_str}

Based on the low segment pass rate, suggest parameter adjustments to improve generalization.

Consider:
1. Strategy type: {strategy_info['type']} strategies may benefit from specific loss functions
2. Market conditions: {market_info['timeframe_type']} on {market_info['volatility_regime']} volatility may require different approaches
3. Segment pattern: If profits vary wildly, consider more robust loss functions
4. Avoid repetition: Do not suggest combinations that have already been tried

Respond with JSON only."""

    try:
        # Wrap in strict timeout (30 seconds) as per spec
        response = await asyncio.wait_for(
            client.generate(user_prompt, system_prompt=system_prompt, feature="wfa_fix"),
            timeout=30.0
        )
        if not response:
            logger.warning("Ollama returned empty response for WFA fix")
            _ollama_circuit_breaker.record_failure()
            current_state.ai_metrics["timeout_count"] += 1
            return None

        # Clean and parse JSON response
        cleaned = clean_json_response(response)

        try:
            import json as json_module
            suggestions = json_module.loads(cleaned)

            # Track JSON parse success
            current_state.ai_metrics["json_parse_success"] += 1

            # Validate required fields
            required_fields = ["hyperopt_loss", "hyperopt_spaces", "hyperopt_epochs"]
            for field in required_fields:
                if field not in suggestions:
                    logger.warning(f"Ollama response missing required field: {field}")
                    return None

            # Validate hyperopt_loss
            valid_losses = ["SharpeHyperOptLoss", "ProfitDrawDownHyperOptLoss", "CalmarHyperOptLoss", "OnlyProfitHyperOptLoss"]
            if suggestions["hyperopt_loss"] not in valid_losses:
                logger.warning(f"Invalid hyperopt_loss: {suggestions['hyperopt_loss']}")
                suggestions["hyperopt_loss"] = "SharpeHyperOptLoss"  # Fallback

            # Validate hyperopt_spaces
            valid_spaces = ["buy", "sell", "roi", "stoploss", "trailing", "default", "all"]
            if isinstance(suggestions["hyperopt_spaces"], list):
                suggestions["hyperopt_spaces"] = [s for s in suggestions["hyperopt_spaces"] if s in valid_spaces]
                if not suggestions["hyperopt_spaces"]:
                    suggestions["hyperopt_spaces"] = ["buy", "stoploss", "roi"]  # Fallback
            else:
                suggestions["hyperopt_spaces"] = ["buy", "stoploss", "roi"]  # Fallback

            # Validate and clamp hyperopt_epochs
            try:
                epochs = int(suggestions["hyperopt_epochs"])
                suggestions["hyperopt_epochs"] = max(50, min(epochs, 500))  # Clamp between 50 and 500
            except (ValueError, TypeError):
                suggestions["hyperopt_epochs"] = current_state.hyperopt_epochs  # Fallback to current

            # Ensure param_overrides is a dict
            if "param_overrides" not in suggestions or not isinstance(suggestions["param_overrides"], dict):
                suggestions["param_overrides"] = {}

            # Validate suggestions against safe ranges and constraints
            is_valid, validation_error = validate_ollama_suggestions(suggestions)
            if not is_valid:
                logger.warning(f"Ollama suggestions failed validation: {validation_error}")
                _ollama_circuit_breaker.record_failure()
                return None

            # Check if suggested combination was already tried
            if tried_combinations:
                suggested_combo = (
                    suggestions["hyperopt_loss"],
                    tuple(sorted(suggestions["hyperopt_spaces"])) if isinstance(suggestions["hyperopt_spaces"], list) else suggestions["hyperopt_spaces"],
                    suggestions["hyperopt_epochs"]
                )
                if suggested_combo in tried_combinations:
                    logger.warning(f"Ollama suggested already-tried combination: {suggested_combo}")

                    # Try one more time with different parameters if possible
                    retry_suggestions = suggestions.copy()
                    if isinstance(retry_suggestions["hyperopt_spaces"], list):
                        # Try adding more spaces
                        if "default" not in retry_suggestions["hyperopt_spaces"]:
                            retry_suggestions["hyperopt_spaces"].append("default")
                        elif "trailing" not in retry_suggestions["hyperopt_spaces"]:
                            retry_suggestions["hyperopt_spaces"].append("trailing")
                    retry_suggestions["hyperopt_epochs"] = min(500, retry_suggestions["hyperopt_epochs"] + 50)

                    # Validate retry suggestions
                    is_retry_valid, retry_validation_error = validate_ollama_suggestions(retry_suggestions)
                    if is_retry_valid:
                        logger.info(f"Ollama retry suggestion accepted: {retry_suggestions}")
                        return retry_suggestions

                    # If retry also failed or suggested tried combination, fall back to None
                    logger.warning("Ollama could not suggest a unique combination - using fallback logic")
                    return None

            logger.info(f"Ollama WFA fix suggestions: {suggestions}")
            _ollama_circuit_breaker.record_success()

            # Track suggestion applied
            current_state.ai_metrics["suggestion_applied_count"] += 1

            # Add summary to ai_interactions
            current_state.ai_interactions.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "feature": "wfa_fix",
                "success": True,
                "reasoning": suggestions.get("reasoning", ""),
                "suggestions": {
                    "hyperopt_loss": suggestions.get("hyperopt_loss"),
                    "hyperopt_spaces": suggestions.get("hyperopt_spaces"),
                    "hyperopt_epochs": suggestions.get("hyperopt_epochs"),
                },
            })

            return suggestions

        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse Ollama JSON response: {e}")
            _ollama_circuit_breaker.record_failure()
            return None

    except asyncio.TimeoutError:
        logger.warning("Ollama WFA fix request timed out (30s) - using fallback logic")
        _ollama_circuit_breaker.record_failure()
        current_state.ai_metrics["timeout_count"] += 1
        return None
    except Exception as e:
        logger.warning(f"Error calling Ollama for WFA fix: {e}")
        _ollama_circuit_breaker.record_failure()
        return None
    finally:
        await client.close()
