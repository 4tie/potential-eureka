import json

import pytest

from backend.models.strategy_spec import StrategySpec
from backend.services.auto_quant.strategy_designer import generate_strategy_spec


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


async def _generate(response, **overrides):
    client = MockOllamaClient(response)
    result = await generate_strategy_spec(
        client,
        trading_style=overrides.get("trading_style", "mean_reversion"),
        timeframe=overrides.get("timeframe", "5m"),
        direction=overrides.get("direction", "long"),
        risk_profile=overrides.get("risk_profile", "balanced"),
        description=overrides.get("description"),
    )
    return result, client


def _intent_payload(**overrides):
    payload = {
        "family": "mean_reversion",
        "timeframe": "5m",
        "indicator_set": "rsi_only",
        "risk_profile": "balanced",
        "direction": "long",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_strategy_designer_valid_intent_works():
    result, _client = await _generate(json.dumps(_intent_payload()))

    assert isinstance(result["spec"], StrategySpec)
    assert result["errors"] == []
    assert result["spec"].trading_style == "mean_reversion"
    assert result["spec"].direction == "long"


@pytest.mark.asyncio
async def test_strategy_designer_markdown_wrapped_intent_works():
    response = f"```json\n{json.dumps(_intent_payload())}\n```"

    result, _client = await _generate(response)

    assert isinstance(result["spec"], StrategySpec)
    assert result["errors"] == []


@pytest.mark.asyncio
async def test_strategy_designer_invalid_json_falls_back_to_safe_spec():
    result, _client = await _generate("{not json")

    assert isinstance(result["spec"], StrategySpec)
    assert result["errors"] == []
    assert result["spec"].timeframe == "5m"
    assert result["spec"].direction == "long"


@pytest.mark.asyncio
async def test_strategy_designer_invalid_intent_values_are_sanitized():
    payload = _intent_payload(
        family="not_a_family",
        timeframe="99m",
        indicator_set="too_big",
        risk_profile="reckless",
        direction="short",
    )

    result, _client = await _generate(json.dumps(payload))

    assert isinstance(result["spec"], StrategySpec)
    assert result["errors"] == []
    assert result["spec"].trading_style == "mean_reversion"
    assert result["spec"].timeframe == "5m"
    assert result["spec"].direction == "long"


@pytest.mark.asyncio
async def test_strategy_designer_passes_feature_name_and_small_generation_options():
    result, client = await _generate(json.dumps(_intent_payload()))

    assert result["errors"] == []
    assert client.calls[0]["feature"] == "strategy_designer_intent"
    assert client.calls[0]["options"]["temperature"] == 0
    assert client.calls[0]["options"]["num_predict"] <= 300


@pytest.mark.asyncio
async def test_strategy_designer_rejects_unsupported_requested_direction():
    result, client = await _generate(json.dumps(_intent_payload()), direction="short")

    assert result["spec"] is None
    assert result["errors"] == ["UNSUPPORTED_DIRECTION_MVP_LONG_ONLY"]
    assert client.calls == []


@pytest.mark.asyncio
async def test_strategy_designer_maps_user_style_to_family_defaults():
    result, _client = await _generate(
        json.dumps(_intent_payload(family="momentum", indicator_set="rsi_ema_atr")),
        trading_style="scalping",
    )

    assert isinstance(result["spec"], StrategySpec)
    assert result["spec"].trading_style == "momentum"
    assert len(result["spec"].indicators) >= 1


@pytest.mark.asyncio
async def test_strategy_designer_empty_response_uses_fallback_spec():
    result, _client = await _generate("")

    assert isinstance(result["spec"], StrategySpec)
    assert result["errors"] == []
    assert result["spec"].direction == "long"
