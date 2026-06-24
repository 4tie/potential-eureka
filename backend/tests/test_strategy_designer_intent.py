import json

import pytest

from backend.models.strategy_spec import StrategySpec
from backend.services.auto_quant.strategy_designer import (
    build_spec_from_decision,
    generate_strategy_spec,
)


class MockOllamaClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def generate(self, prompt, system_prompt=None, feature="default", options=None):
        self.calls.append(
            {
                "prompt": prompt,
                "system_prompt": system_prompt,
                "feature": feature,
                "options": options or {},
            }
        )
        return self.response


@pytest.mark.asyncio
async def test_strategy_designer_uses_compact_intent_and_builds_full_spec():
    client = MockOllamaClient(
        json.dumps(
            {
                "family": "momentum",
                "timeframe": "5m",
                "indicator_set": "rsi_ema_atr",
                "risk_profile": "balanced",
                "direction": "long",
            }
        )
    )

    result = await generate_strategy_spec(
        client,
        trading_style="scalping",
        timeframe="5m",
        direction="long",
        risk_profile="balanced",
        description="smoke test",
    )

    assert result["errors"] == []
    assert isinstance(result["spec"], StrategySpec)
    assert result["spec"].direction == "long"
    assert result["spec"].indicators
    assert result["spec"].entry_conditions
    assert result["spec"].exit_conditions
    assert client.calls[0]["feature"] == "strategy_designer_intent"
    assert client.calls[0]["options"]["num_predict"] <= 300
    assert client.calls[0]["options"]["temperature"] == 0


@pytest.mark.asyncio
async def test_strategy_designer_falls_back_when_intent_json_is_invalid():
    client = MockOllamaClient("{not valid json")

    result = await generate_strategy_spec(
        client,
        trading_style="scalping",
        timeframe="5m",
        direction="long",
        risk_profile="balanced",
    )

    assert result["errors"] == []
    assert isinstance(result["spec"], StrategySpec)
    assert result["spec"].timeframe == "5m"
    assert result["spec"].direction == "long"


@pytest.mark.asyncio
async def test_strategy_designer_rejects_short_direction_for_mvp():
    client = MockOllamaClient(json.dumps({"direction": "short"}))

    result = await generate_strategy_spec(
        client,
        trading_style="scalping",
        timeframe="5m",
        direction="short",
        risk_profile="balanced",
    )

    assert result["spec"] is None
    assert result["errors"] == ["UNSUPPORTED_DIRECTION_MVP_LONG_ONLY"]
    assert client.calls == []


def test_build_spec_from_decision_sanitizes_invalid_intent_values():
    spec = build_spec_from_decision(
        {
            "family": "bad_family",
            "timeframe": "bad_tf",
            "indicator_set": "bad_set",
            "risk_profile": "bad_risk",
            "direction": "short",
        },
        {
            "trading_style": "scalping",
            "timeframe": "5m",
            "direction": "long",
            "risk_profile": "balanced",
            "name": "HermesSmoke",
            "description": "",
        },
    )

    assert spec.name == "HermesSmoke"
    assert spec.timeframe == "5m"
    assert spec.trading_style == "momentum"
    assert spec.direction == "long"
    assert spec.indicators
