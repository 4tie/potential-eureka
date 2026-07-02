export const API_BASE = "";

// Premium user-facing pipeline stage names (matches PIPELINE_STEPS order in pipelineSteps.js).
// These are used as fallback stage names when the backend does not supply a stages array,
// and also as display labels in the status bar / run dashboard.
export const STAGE_NAMES = [
  "Pre-flight Filtering",
  "Portfolio Baseline Backtest",
  "WFA Hyperopt",
  "Robustness & Feature Injection",
  "Portfolio Competition",
  "Delivery / Export",
];

export const STAGE_ICONS = ["01", "02", "03", "04", "05", "06"];

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
  workflow_mode: "auto_quant",
  max_attempts: 3,
  trading_style: "swing",
  risk_profile: "balanced",
  analysis_depth: "standard",
  timeframe: "5m",
  in_sample_range: "", // Will be fetched from backend /api/auto-quant/default-ranges
  out_sample_range: "", // Will be fetched from backend /api/auto-quant/default-ranges
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
