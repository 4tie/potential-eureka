export const API_BASE = "";

export const STAGE_NAMES = [
  "Sanity Backtest",
  "Hyperopt Execution",
  "Auto-Patching",
  "Out-of-Sample Validation",
  "Multi-Pair Stress Test",
  "Risk Assessment",
  "Delivery",
];

export const STAGE_ICONS = ["01", "02", "03", "04", "05", "06", "07"];

export const LEGAL_STATUS_TRANSITIONS = {
  pending: ["running", "cancelled", "interrupted"],
  running: ["completed", "failed", "cancelled", "interrupted"],
  completed: [],
  failed: [],
  cancelled: [],
  interrupted: ["running"],
};

export const DEFAULT_AUTOQUANT_FORM = {
  strategy: "",
  trading_style: "swing",
  risk_profile: "balanced",
  analysis_depth: "standard",
  timeframe: "5m",
  in_sample_range: "20230101-20240101",
  out_sample_range: "20240101-20241201",
  exchange: "binance",
  pair_universe: "",
  max_drawdown_threshold: 30,
  min_win_rate: 40,
  min_profit_factor: 1.0,
  min_sharpe: 0.5,
  min_oos_profit: 0.0,
  monte_carlo_threshold: 0.35,
  hyperopt_loss: "ProfitLockinHyperOptLoss",
  hyperopt_spaces: ["buy", "stoploss", "roi"],
  hyperopt_epochs: 100,
  wfo_enabled: false,
  wfo_is_months: 3,
  wfo_oos_months: 1,
  wfo_recency_weight: 1.0,
  ensemble_enabled: false,
};
