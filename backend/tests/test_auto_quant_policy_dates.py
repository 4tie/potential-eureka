"""
backend/tests/test_auto_quant_policy_dates.py — Tests for dynamic date ranges and OOS trade gates.

Covers:
  - Dynamic date range generation for different depths
  - OOS years calculation from date ranges
  - Per-year trade requirement calculation
  - Walk-forward window generation for different depths
  - Latest complete day calculation
  - Scalping activity warnings for low trade counts

Run from project root:
    pytest backend/tests/test_auto_quant_policy_dates.py -v
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

# ── Make project root importable ──────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.auto_quant.policy import (
    date_ranges_for_depth,
    latest_complete_day,
    walk_forward_windows_for_depth,
)
from backend.services.auto_quant.pipeline_modules.scoring import (
    _calculate_oos_years,
    _min_trades_per_year_for_timeframe,
)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS — latest_complete_day
# ═══════════════════════════════════════════════════════════════════════════════

class TestLatestCompleteDay:
    """Tests for latest_complete_day function."""

    def test_returns_yesterday_by_default(self):
        """Should return yesterday UTC by default."""
        result = latest_complete_day()
        expected = datetime.utcnow() - timedelta(days=1)
        # Compare dates only (ignore time)
        assert result.date() == expected.date()
        assert result.hour == 0
        assert result.minute == 0
        assert result.second == 0
        assert result.microsecond == 0

    def test_respects_custom_now(self):
        """Should use custom datetime when provided."""
        custom_now = datetime(2026, 6, 23, 15, 30, 45)
        result = latest_complete_day(custom_now)
        assert result == datetime(2026, 6, 22, 0, 0, 0)


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS — date_ranges_for_depth
# ═══════════════════════════════════════════════════════════════════════════════

class TestDateRangesForDepth:
    """Tests for dynamic date range generation."""

    def test_quick_depth_ranges(self):
        """Quick depth should have 18 months IS, 6 months OOS."""
        # Freeze date to 2026-06-23
        as_of = datetime(2026, 6, 23, 0, 0, 0)
        is_range, oos_range = date_ranges_for_depth("quick", as_of=as_of)
        
        # Quick: 18 months IS, 6 months OOS
        # IS: 2024-12-23 → 2026-01-01 (approx 18 months)
        # OOS: 2026-01-01 → 2026-06-23 (approx 6 months)
        assert is_range.startswith("2024")
        assert is_range.endswith("20260101")
        assert oos_range.startswith("20260101")
        assert oos_range.endswith("20260623")

    def test_standard_depth_ranges(self):
        """Standard depth should have 24 months IS, 12 months OOS."""
        as_of = datetime(2026, 6, 23, 0, 0, 0)
        is_range, oos_range = date_ranges_for_depth("standard", as_of=as_of)
        
        # Standard: 24 months IS, 12 months OOS
        # IS: 2023-06-23 → 2025-06-23 (24 months)
        # OOS: 2025-06-23 → 2026-06-23 (12 months)
        assert is_range.startswith("2023")
        assert is_range.endswith("20250623")
        assert oos_range.startswith("20250623")
        assert oos_range.endswith("20260623")

    def test_deep_depth_ranges(self):
        """Deep depth should have 36 months IS, 12 months OOS."""
        as_of = datetime(2026, 6, 23, 0, 0, 0)
        is_range, oos_range = date_ranges_for_depth("deep", as_of=as_of)
        
        # Deep: 36 months IS, 12 months OOS
        # IS: 2022-06-23 → 2025-06-23 (36 months)
        # OOS: 2025-06-23 → 2026-06-23 (12 months)
        assert is_range.startswith("2022")
        assert is_range.endswith("20250623")
        assert oos_range.startswith("20250623")
        assert oos_range.endswith("20260623")

    def test_invalid_depth_defaults_to_standard(self):
        """Invalid depth should default to standard."""
        is_range, oos_range = date_ranges_for_depth("invalid_depth")
        # Should not raise error, should return standard ranges
        assert is_range
        assert oos_range

    def test_respects_custom_latest_data_end(self):
        """Should use custom latest_data_end when provided."""
        custom_end = datetime(2025, 12, 31, 0, 0, 0)
        is_range, oos_range = date_ranges_for_depth("standard", latest_data_end=custom_end)
        
        # OOS should end at 2026-01-01 (next day boundary)
        assert oos_range.endswith("20260101")


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS — walk_forward_windows_for_depth
# ═══════════════════════════════════════════════════════════════════════════════

class TestWalkForwardWindowsForDepth:
    """Tests for WFO window generation."""

    def test_quick_depth_returns_empty(self):
        """Quick depth should return empty list (WFO skipped)."""
        windows = walk_forward_windows_for_depth("quick")
        assert windows == []

    def test_standard_depth_has_3_windows(self):
        """Standard depth should generate 3 windows."""
        windows = walk_forward_windows_for_depth("standard")
        assert len(windows) == 3
        for window in windows:
            assert "train" in window
            assert "test" in window

    def test_deep_depth_has_6_windows(self):
        """Deep depth should generate 6 windows."""
        windows = walk_forward_windows_for_depth("deep")
        assert len(windows) == 6
        for window in windows:
            assert "train" in window
            assert "test" in window

    def test_windows_are_rolling(self):
        """Windows should be rolling and end at latest data."""
        as_of = datetime(2026, 6, 23, 0, 0, 0)
        windows = walk_forward_windows_for_depth("deep", as_of=as_of)
        
        # Last window should end near latest data
        last_window = windows[-1]
        assert last_window["test"].endswith("20260623")

    def test_invalid_depth_defaults_to_standard(self):
        """Invalid depth should default to standard windows."""
        windows = walk_forward_windows_for_depth("invalid")
        assert len(windows) == 3  # Standard has 3 windows


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS — OOS years calculation
# ═══════════════════════════════════════════════════════════════════════════════

class TestCalculateOosYears:
    """Tests for OOS years calculation from timeranges."""

    def test_six_month_oos(self):
        """6-month OOS range should return 0.5 years."""
        oos_range = "20250623-20261223"
        years = _calculate_oos_years(oos_range)
        assert years == 0.5

    def test_twelve_month_oos(self):
        """12-month OOS range should return 1.0 years."""
        oos_range = "20250623-20260623"
        years = _calculate_oos_years(oos_range)
        assert years == 1.0

    def test_invalid_format_defaults_to_one_year(self):
        """Invalid format should default to 1.0 years."""
        years = _calculate_oos_years("invalid-format")
        assert years == 1.0

    def test_empty_string_defaults_to_one_year(self):
        """Empty string should default to 1.0 years."""
        years = _calculate_oos_years("")
        assert years == 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS — Timeframe min trades per year
# ═══════════════════════════════════════════════════════════════════════════════

class TestMinTradesPerYearForTimeframe:
    """Tests for per-year trade requirements by timeframe."""

    def test_scalping_timeframes_500_per_year(self):
        """1m/3m/5m should require 500 trades/year."""
        assert _min_trades_per_year_for_timeframe("1m") == 500
        assert _min_trades_per_year_for_timeframe("3m") == 500
        assert _min_trades_per_year_for_timeframe("5m") == 500

    def test_intraday_timeframes_250_per_year(self):
        """15m/30m/1h should require 250 trades/year."""
        assert _min_trades_per_year_for_timeframe("15m") == 250
        assert _min_trades_per_year_for_timeframe("30m") == 250
        assert _min_trades_per_year_for_timeframe("1h") == 250

    def test_swing_timeframes_120_per_year(self):
        """2h/4h/6h/8h/12h should require 120 trades/year."""
        assert _min_trades_per_year_for_timeframe("2h") == 120
        assert _min_trades_per_year_for_timeframe("4h") == 120
        assert _min_trades_per_year_for_timeframe("6h") == 120
        assert _min_trades_per_year_for_timeframe("12h") == 120

    def test_position_timeframes_30_per_year(self):
        """1d/3d/1w should require 30 trades/year."""
        assert _min_trades_per_year_for_timeframe("1d") == 30
        assert _min_trades_per_year_for_timeframe("3d") == 30
        assert _min_trades_per_year_for_timeframe("1w") == 30

    def test_unknown_timeframe_defaults_to_100(self):
        """Unknown timeframe should default to 100 trades/year."""
        assert _min_trades_per_year_for_timeframe("unknown") == 100

    def test_case_insensitive(self):
        """Timeframe lookup should be case-insensitive."""
        assert _min_trades_per_year_for_timeframe("1H") == 250
        assert _min_trades_per_year_for_timeframe("5M") == 500
