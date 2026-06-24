"""Strategy Designer helper for AI-proposed StrategySpec JSON."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ...models.strategy_spec import StrategySpec, validate_spec
from .ollama_service import clean_json_response


_PROMPT_PATH = Path(__file__).parent / "prompts" / "strategy_designer.md"


async def generate_strategy_spec(
    client: Any,
    *,
    trading_style: str,
    timeframe: str,
    direction: str | None = None,
    risk_profile: str | None = None,
    name: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Generate and validate a StrategySpec using an existing Ollama client."""
    system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")
    user_prompt = _build_user_prompt(
        trading_style=trading_style,
        timeframe=timeframe,
        direction=direction,
        risk_profile=risk_profile,
        name=name,
        description=description,
    )

    raw_response = await client.generate(
        user_prompt,
        system_prompt=system_prompt,
        feature="strategy_designer",
    )
    if not raw_response:
        return {"spec": None, "errors": ["EMPTY_OLLAMA_RESPONSE"], "raw_response": raw_response}

    cleaned = clean_json_response(raw_response)
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        return {"spec": None, "errors": ["INVALID_JSON"], "raw_response": raw_response}

    if not isinstance(payload, dict):
        return {"spec": None, "errors": ["INVALID_STRATEGY_SPEC_SCHEMA"], "raw_response": raw_response}

    try:
        spec = StrategySpec(**payload)
    except (ValidationError, TypeError, ValueError):
        return {"spec": None, "errors": ["INVALID_STRATEGY_SPEC_SCHEMA"], "raw_response": raw_response}

    errors = validate_spec(spec, strict_validation=True)
    if errors:
        return {"spec": None, "errors": errors, "raw_response": raw_response}

    return {"spec": spec, "errors": [], "raw_response": raw_response}


def _build_user_prompt(
    *,
    trading_style: str,
    timeframe: str,
    direction: str | None,
    risk_profile: str | None,
    name: str | None,
    description: str | None,
) -> str:
    lines = [
        "Create one StrategySpec JSON object from these user inputs:",
        f"- trading_style: {trading_style}",
        f"- timeframe: {timeframe}",
    ]
    if direction:
        lines.append(f"- direction: {direction}")
    if risk_profile:
        lines.append(f"- risk_profile: {risk_profile}")
    if name:
        lines.append(f"- requested_name: {name}")
    if description:
        lines.append(f"- requested_description: {description}")
    lines.append("Return JSON only.")
    return "\n".join(lines)
