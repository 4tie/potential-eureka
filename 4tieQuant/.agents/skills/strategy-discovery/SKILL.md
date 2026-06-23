---
name: strategy-discovery
description: >-
  Guides the AI through an automated loop to discover, validate, and deliver
  profitable Freqtrade strategies. Use when the user wants to find a profitable
  strategy, run a strategy discovery session, or automate the full strategy
  lifecycle from user interview to scored/certified output.
---

# Strategy Discovery Loop

## Prerequisites

This skill requires the existing codebase at `/home/mohs/Desktop/fictional-octo-guide`. Key entry points:

| Purpose | File / Endpoint |
|---------|----------------|
| AI Agent workflow (primary) | `POST /api/ai-agent/workflow/auto-quant` — `backend/api/routers/ai_agent.py:26-262` |
| StrategySpec model | `backend/models/strategy_spec.py:75-99` |
| Generate StrategySpec via Ollama | `backend/services/auto_quant/strategy_designer.py:18-65` |
| Render strategy .py code | `backend/services/strategy/strategy_code_writer.py` |
| Policy + scoring | `backend/services/auto_quant/policy/__init__.py` |
| Scoring module | `backend/services/auto_quant/pipeline_modules/scoring.py:16-80` |
| Thresholds config (per style) | `backend/config/thresholds/{scalping,intraday,swing,position}.json` |
| Pair universe | `backend/config/pair_universes/core.json` |
| Backtest runner | `backend/services/execution/backtest_runner.py` |
| Ollama client factory | `backend/services/auto_quant/ollama_service.py` |
| Strategy designer prompt | `backend/services/auto_quant/prompts/strategy_designer.md` |
| Backend server | `server.py` — `uvicorn server:app --reload --port 8000` |

---

## Workflow

### 0. User Interview

Ask the user to pick one from each category:

**Strategy type** (choose one primary):
- `scalping` — ultra-short holds, 1m-15m timeframes
- `intraday` — same-session trades, 15m-1h timeframes
- `swing` — multi-day holds, 1h-4h timeframes
- `trend_following` — ride directional trends
- `mean_reversion` — fade extremes, bet on pullbacks
- `breakout` — enter on volatility expansion above resistance

**Direction** (choose one):
- `long_only` — only long positions
- `short` — only short positions
- `long_short` — both directions

**Risk profile** (choose one):
- `conservative` — stricter drawdown limits, higher PF requirement
- `balanced` — moderate
- `aggressive` — higher drawdown tolerance, more trades

**Analysis depth** (choose one):
- `quick` — 30 hyperopt epochs, no WFO, ~2min per backtest
- `standard` — 100 epochs, no WFO
- `deep` — 150 epochs, WFO enabled, OOS validation

### 1. Strategy Type Mapping

Map user's choices to codebase values:

```
User choice       → style (thresholds)  |  trading_style (StrategySpec)  |  direction
──────────────────┼──────────────────────┼────────────────────────────────┼────────────────
scalping          → scalping             |  momentum                      |  long_short
intraday          → intraday             |  trend_following               |  long_short
swing             → swing                |  trend_following               |  long_short
trend_following   → swing                |  trend_following               |  long_only
mean_reversion    → intraday             |  mean_reversion                |  long_only
breakout          → scalping             |  breakout                      |  long_short
```

Timeframe mapping per `backend/config/timeframes/styles.json`:
- `scalping`: `["1m", "5m", "15m"]`
- `intraday`: `["15m", "30m", "1h"]`
- `swing`: `["1h", "4h"]`
- `position`: `["4h", "1d"]`

### 2. Pair Universe

Default pairs to screen (from `backend/config/pair_universes/core.json` Tiers A+B):

```
XRP/USDT",
    "SHIB/USDT",
    "ICP/USDT",
    "HBAR/USDT",
    "XLM/USDT",
    "TRX/USDT",
    "LTC/USDT",
    "FIL/USDT",
    "AVAX/USDT",
    "APT/USDT",
    "VET/USDT",
    "BTC/USDT",
    "TIA/USDT",
    "ADA/USDT",
    "ARB/USDT",
    "ETH/USDT",
    "BCH/USDT",
    "ETC/USDT",
    "DOT/USDT",
    "FTM/USDT",
    "BNB/USDT",
    "SOL/USDT",
    "OP/USDT",
    "DOGE/USDT",
    "SUI/USDT",
    "INJ/USDT",
    "SEI/USDT",
    "NEAR/USDT",
    "MATIC/USDT",
    "UNI/USDT",
    "LINK/USDT",
    "ATOM/USDT",
    "PENDLE/USDT",
    "IMX/USDT",
    "GALA/USDT",
    "DYDX/USDT",
    "YFI/USDT",
    "CRV/USDT",
    "SNX/USDT",
    "MANA/USDT",
    "EGLD/USDT",
    "BLUR/USDT",
    "LDO/USDT",
    "AAVE/USDT",
    "GMX/USDT",
    "MKR/USDT",
    "RPL/USDT",
    "ZK/USDT",
    "STX/USDT",
    "COMP/USDT",
    "SAND/USDT",
    "MINA/USDT",
    "STRK/USDT",
    "AXS/USDT",
    "ENJ/USDT",
    "ALGO/USDT",
    "PYTH/USDT",
    "JTO/USDT",
    "WIF/USDT",
    "XTZ/USDT",
    "1INCH/USDT",
    "BONK/USDT",
    "BAL/USDT",
    "SUSHI/USDT"
```

***Always test all pairs, then keep the best 3 that pass validation.***

### 3. The Discovery Loop

```
loop (max 10 full strategy variants):
  1. Generate StrategySpec via Ollama (strategy_designer.py)
  2. Render .py strategy code (strategy_code_writer.py)
  3. Screen all pairs, keep best 3
  4. Run combined multi-pair backtest
  5. Score & validate against thresholds
  6. If pass AND Walk-Forward passes → break (promote)
  7. Else → refine spec with failure feedback → repeat
```

---

## Detailed Steps

### Step 1 — Generate StrategySpec

Use the AI Agent workflow at `POST /api/ai-agent/workflow/auto-quant`. This endpoint runs an 8-step orchestration that includes strategy design, pair exploration, backtesting, optimization, and stress testing.

Alternatively, for direct control:

```python
# Via strategy_designer.py:
from backend.services.auto_quant.strategy_designer import generate_strategy_spec
from backend.services.auto_quant.ollama_service import create_ollama_client_from_settings

client = await create_ollama_client_from_settings(settings)
result = await generate_strategy_spec(
    client,
    trading_style="trend_following",    # from mapping above
    timeframe="1h",                      # from mapping above
    direction="long_only",
    risk_profile="balanced",
)
spec = result["spec"]   # StrategySpec pydantic model
```

The `StrategySpec` model (`backend/models/strategy_spec.py:75-99`) has:
- `name`, `description`, `timeframe`, `trading_style`
- `indicators: list[IndicatorSpec]` — supports `rsi`, `macd`, `bbands`, `ema_cross`, `adx`, `atr`, `cci`, `stoch`, `ichimoku`
- `entry_conditions`, `exit_conditions` with type/indicator/operator
- `stoploss`, `trailing`, `position_sizing`, `max_open_trades`, `roi`

### Step 2 — Render Strategy Code

Use `strategy_code_writer.py` to convert the spec to a runnable `.py` file:

```python
from backend.services.strategy.strategy_code_writer import render_strategy_from_spec

output_path = f"user_data/strategies/{spec.name}.py"
render_strategy_from_spec(spec, output_path)
```

This runs `py_compile` for syntax validation and saves atomically.

### Step 3 — Screen Pair Universe

Run a backtest on each of the 10 pairs individually. For each pair collect:
- net profit (after fees)
- profit factor
- max drawdown
- total trades
- expectancy
- win rate

Use `POST /api/backtest/run` with body:
```json
{
  "strategy_name": "MyStrategy_v1",
  "timeframe": "1h",
  "timerange": "20230101-20240101",
  "pairs": ["BTC/USDT"],
  "fee": 0.001
}
```

Then poll `GET /api/session/status/{session_id}` for results.

**Keep only pairs that pass discovery thresholds** (see criteria below). Select the **best 3** ranked by composite (profit factor × expectancy × win rate).

If fewer than 3 pairs pass → **do not proceed**. Skip to Step 6 (iterate).

### Step 4 — Combined Multi-Pair Backtest

Run a single backtest with the 3 selected pairs together:

```json
{
  "strategy_name": "MyStrategy_v1",
  "timeframe": "1h",
  "timerange": "20230101-20240101",
  "pairs": ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
  "max_open_trades": 3,
  "fee": 0.001
}
```

**Pass rules:**
- combined net profit > 0
- combined profit factor ≥ 1.3
- combined expectancy > 0
- max drawdown ≤ style threshold
- trade count ≥ 200
- no single pair contributes > 70% of total profit

### Step 5 — Score & Validate

Use the backend scoring system:

```python
from backend.services.auto_quant.policy import load_policy
from backend.services.auto_quant.pipeline_modules.scoring import compute_score

policy = load_policy()
result = policy.score_strategy(
    metrics=metrics,
    style="intraday",
    risk_profile="balanced",
    tier="validation",
)
# result.score        → 0-100 composite
# result.readiness    → "Elite" / "Strong" / "Candidate" / "Rejected"
```

**Required Walk-Forward pass** — the strategy must survive walk-forward optimization across multiple rolling windows. This is enabled in the `deep` analysis depth or via `wfo_enabled=True` in `StartAutoQuantRequest`.

Walk-Forward windows are generated by `backend/services/auto_quant/pipeline_modules/config.py:_generate_wfo_windows()` — rolling IS/OOS pairs.

**Walk-Forward pass criteria:**
- IS profit factor ≥ 1.3 across ≥ 60% of windows
- OOS profit factor ≥ 1.0 across ≥ 50% of windows
- OOS drawdown does not exceed IS drawdown by > 15%

### Step 6 — Iterate or Promote

**Promote** — all checks pass AND Walk-Forward passes:
- Generate final report
- Mark as "Validated" or "Production Candidate"
- Offer to export via `POST /api/auto-quant/export/{run_id}`
- Present to user with all metrics

**Iterate** — any check fails:
- Capture failure reason (which metric(s) failed, by how much)
- Feed back to Ollama via `strategy_designer.py` with specific guidance:
  ```
  Previous attempt failed:
  - Profit factor was 1.1 (need ≥ 1.3)
  - Drawdown was 42% (need ≤ 35%)
  - Only 2 of 10 pairs passed screening
  - Walk-Forward OOS retention was 0.35 (need ≥ 0.5)
  Suggest: reduce sensitivity, add volatility filter, use tighter stoploss
  ```
- Set `spec.iteration_count += 1` and `spec.parent_spec_hash = spec.spec_hash()`
- Loop back to Step 1

**Hard stop** — after 10 full strategy variants without a pass:
- Produce a detailed failure report
- Show the best candidate even if it didn't fully pass
- Ask user whether to increase the limit or adjust parameters

---

## Acceptance Criteria (Thresholds)

### Per-Style Discovery Thresholds (Screening)

| Metric | Scalping | Intraday | Swing | Position |
|--------|----------|----------|-------|----------|
| Min Profit Factor | 1.0 | 1.1 | 1.2 | 1.3 |
| Max Drawdown | 50% | 45% | 40% | 35% |
| Min Trades | 300 | 200 | 100 | 50 |
| Min Expectancy | 0.0001 | 0.0002 | 0.0003 | 0.0005 |
| Min Win Rate | 40% | 42% | 45% | 50% |

### Per-Style Validation Thresholds (Accept)

| Metric | Scalping | Intraday | Swing | Position |
|--------|----------|----------|-------|----------|
| Min Profit Factor | 1.2 | 1.3 | 1.4 | 1.5 |
| Max Drawdown | 40% | 35% | 30% | 25% |
| Min Trades | 300 | 200 | 100 | 50 |
| Min Expectancy | 0.0003 | 0.0004 | 0.0005 | 0.0008 |
| Min Win Rate | 45% | 47% | 50% | 55% |
| Min OOS Retention | 0.4 | 0.5 | 0.5 | 0.6 |

*(Sources: `backend/config/thresholds/{style}.json` — discovery and validation tiers)*

### Walk-Forward Thresholds

| Metric | Requirement |
|--------|-------------|
| IS windows passing PF ≥ 1.3 | ≥ 60% |
| OOS windows with PF ≥ 1.0 | ≥ 50% |
| OOS drawdown vs IS drawdown | within +15% |

### Combined Portfolio Thresholds

| Metric | Requirement |
|--------|-------------|
| Net Profit | > 0 after fees |
| Profit Factor | ≥ style validation threshold |
| Expectancy | > 0 |
| Drawdown | ≤ style validation threshold |
| Trade Count | ≥ style validation threshold |
| Single-pair profit share | ≤ 70% of total |

---

## Output

At the end of a successful discovery, deliver:

1. **Strategy name** and file path (`user_data/strategies/versions/{Name}/v{N}/strategy.py`)
2. **JSON config** path (`user_data/strategies/versions/{Name}/v{N}/config.json`)
3. **Selected pairs** (best 3 with individual metrics)
4. **Combined backtest metrics** (PF, drawdown, expectancy, trades)
5. **Walk-Forward result** (% windows passed, OOS retention)
6. **Score** (0-100 composite) and readiness label
7. **Final status**: `Failed` / `Candidate` / `Validated` / `Production Candidate`

Only call it `Production Candidate` if ALL validation checks + Walk-Forward pass.

---

## Important Constraints

- Do NOT claim profitability without backend-validated metrics
- Do NOT fake or manually compute metrics — always use real backtest results
- Do NOT skip Walk-Forward validation
- Do NOT loop more than 10 strategy variants without user approval
- Do NOT overwrite existing strategy files — strategy_code_writer creates versioned copies
- Use the AI Agent workflow (`POST /api/ai-agent/workflow/auto-quant`) as the primary path; fall back to direct API calls if finer control is needed
