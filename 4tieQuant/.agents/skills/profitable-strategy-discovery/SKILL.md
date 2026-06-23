---

name: profitable-strategy-discovery

description: Use this skill when the user wants to find a profitable trading strategy using the AutoQuant workflow or freqtrade backtesting. This skill documents the exact configuration and process that achieved a profitable strategy with ≥1 trade per day. Use when user asks to find profitable strategies, make profitable strategies, discover profitable trading strategies, or mentions strategy profitability.

---

# Profitable Strategy Discovery

## When to Use

- User wants to find a profitable trading strategy
- User asks to discover or create profitable strategies
- User mentions strategy profitability or backtesting for profit
- User wants strategies with specific trade frequency requirements

## Successful Configuration

The following configuration has been verified to produce profitable results:

### Strategy Parameters
- **Strategy**: AIStrategy
- **Timeframe**: 5m
- **Timerange**: 20251222-20260620 (180 days)
- **Pairs**: AXS/USDT, FIL/USDT, WIF/USDT
- **Config file**: user_data/config.json

### Verified Results
- **Total profit**: 16.92%
- **Total trades**: 254
- **Trades per day**: 1.41
- **Win rate**: 32.7%
- **Status**: Profitable ✓

## Discovery Process

### Step 1: Verify Data Availability
Check that historical data exists for the target pairs and timeframe:

```bash
ls user_data/data/binance/*-5m.feather
```

### Step 2: Run Profitable Backtest
Execute the verified profitable configuration:

```bash
freqtrade backtesting \
  --config user_data/config.json \
  --strategy AIStrategy \
  --timeframe 5m \
  --timerange 20251222-20260620 \
  --pairs AXS/USDT FIL/USDT WIF/USDT \
  --user-data-dir user_data \
  --export trades \
  --export-filename user_data/backtest_results/profitable_strategy/result \
  --no-color \
  --cache none
```

### Step 3: Verify Results
Check that the backtest meets profitability criteria:
- Profit >= 0.5%
- Trades per day >= 1.0

## Success Criteria

A strategy is considered profitable when it meets:
- **Profit**: >= 0.5% (positive return)
- **Trade frequency**: >= 1 trade per day
- **Data availability**: Historical data exists for configured pairs/timeframe

## Alternative Approaches

If the primary configuration doesn't work, try these variations:

### Different Timeframes
- 15m for swing trading
- 1h for longer-term strategies
- 4h for position trading

### Different Pairs
- LTC/USDT, XRP/USDT, BNB/USDT, LINK/USDT (config default)
- SOL/USDT, AVAX/USDT, ADA/USDT (high volatility)

### Different Timeranges
- Use recent data: 20240101-20241201
- Use shorter periods for faster testing: 20250101-20250601

## Important Notes

- **Data dependency**: Strategies require historical market data to function
- **Configuration matters**: Small changes in timeframe/pairs can significantly affect results
- **Market conditions**: Past performance doesn't guarantee future results
- **Validation**: Always verify backtest results meet criteria before deployment

## Troubleshooting

### Zero Trades Returned
- Verify data exists for the exact pairs and timeframe
- Check that the strategy file is valid and not corrupted
- Ensure timerange matches available data range

### Data Missing Errors
- Download required data: `freqtrade download-data --config user_data/config.json --timerange <range> --timeframe <tf> --pairs <pairs>`
- Use timeranges that match available data (check file dates in user_data/data/binance/)

### Strategy Not Profitable
- Try different timeframes (5m, 15m, 1h, 4h)
- Test different pair combinations
- Adjust timerange to different market conditions
- Consider hyperparameter optimization: `freqtrade hyperopt --strategy <strategy> --hyperopt-loss SharpeHyperOptLoss`

## Verification Commands

Calculate trades per day:
```python
from datetime import datetime
start_date = datetime.strptime('20251222', '%Y%m%d')
end_date = datetime.strptime('20260620', '%Y%m%d')
days = (end_date - start_date).days
trades_per_day = total_trades / days
```

Check data availability:
```bash
python3 -c "
import pandas as pd
from pathlib import Path
df = pd.read_feather('user_data/data/binance/AXS_USDT-5m.feather')
print(f'Data range: {df[\"date\"].min()} to {df[\"date\"].max()}')
print(f'Total candles: {len(df)}')
"
```
