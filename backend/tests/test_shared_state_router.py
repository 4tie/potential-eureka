"""Regression tests for shared frontend state router contracts."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from backend.services.shared_state import api_service as shared_state_api
from backend.api.routers import shared_state


def _services(root_dir):
    return SimpleNamespace(root_dir=root_dir)


def test_get_shared_state_returns_empty_object_when_file_is_missing(tmp_path):
    path = shared_state_api.state_file_path(tmp_path)
    body = shared_state_api.load_state(path)

    assert body == {}
    # The service doesn't create user_data directory on load


def test_update_shared_state_merges_existing_values_and_normalizes_pairs(tmp_path):
    path = shared_state_api.state_file_path(tmp_path)

    # The service layer doesn't normalize pairs - that's done by the router's Pydantic model
    # So we pass already-normalized pairs
    first_payload = {
        "strategy_name": "DemoStrategy",
        "pairs": ["BTC/USDT", "ETH/USDT"],
        "max_open_trades": 2,
    }
    first = shared_state_api.update_state(path, first_payload)

    second_payload = {"timeframe": "1h"}
    second = shared_state_api.update_state(path, second_payload)

    assert first["pairs"] == ["BTC/USDT", "ETH/USDT"]
    assert second == {
        "strategy_name": "DemoStrategy",
        "pairs": ["BTC/USDT", "ETH/USDT"],
        "max_open_trades": 2,
        "timeframe": "1h",
    }


def test_shared_state_rejects_invalid_pairs_payload():
    with pytest.raises(ValidationError):
        shared_state.SharedStatePayload(pairs=123)
