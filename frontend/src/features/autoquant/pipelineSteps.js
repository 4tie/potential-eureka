/**
 * Pipeline step definitions for the premium AutoQuant Workflow UI
 * Each step includes metadata for rendering expandable cards with user-friendly explanations
 */

export const PIPELINE_STEPS = [
  {
    id: "preflight",
    name: "Pre-flight Filtering",
    icon: "rocket_launch",
    description: "Validates strategy syntax and configuration before running tests",
    whyItMatters: "Catches configuration errors early to save time and compute resources",
    inputs: ["Strategy file", "Configuration parameters", "Exchange connection"],
    checks: ["Syntax validation", "Parameter compatibility", "API connectivity"],
    metrics: ["Validation time", "Error count", "Warnings found"],
    statusMap: {
      "sanity_backtest": "passed",
      "failed": "failed",
    },
  },
  {
    id: "screening",
    name: "Pair Screening",
    icon: "filter_list",
    description: "Analyzes market data to find the most profitable trading pairs",
    whyItMatters: "Focuses computational resources on pairs with the highest potential returns",
    inputs: ["Pair universe", "Timeframe", "Historical data"],
    checks: ["Volume analysis", "Volatility screening", "Correlation filtering"],
    metrics: ["Candidates evaluated", "Pairs selected", "Screening duration"],
    statusMap: {
      "pair_screening": "passed",
      "failed": "failed",
    },
  },
  {
    id: "baseline",
    name: "Portfolio Baseline Backtest",
    icon: "assessment",
    description: "Runs initial backtest to establish performance baseline",
    whyItMatters: "Provides a reference point to measure optimization improvements",
    inputs: ["Selected pairs", "Strategy parameters", "Time range"],
    checks: ["Data quality", "Trade execution", "Risk limits"],
    metrics: ["Total profit", "Max drawdown", "Trade count", "Win rate"],
    statusMap: {
      "sanity_backtest": "passed",
      "failed": "failed",
    },
  },
  {
    id: "hyperopt",
    name: "WFA Hyperopt",
    icon: "tune",
    description: "Optimizes strategy parameters using Walk-Forward Analysis",
    whyItMatters: "Finds the best parameter combinations while avoiding overfitting",
    inputs: ["Baseline results", "Parameter spaces", "Optimization epochs"],
    checks: ["Convergence testing", "Overfitting detection", "Parameter stability"],
    metrics: ["Best parameters", "Improvement %", "Optimization epochs", "Time elapsed"],
    statusMap: {
      "hyperopt": "passed",
      "failed": "failed",
    },
  },
  {
    id: "robustness",
    name: "Robustness & Feature Injection",
    icon: "shield",
    description: "Tests strategy resilience and injects protective features",
    whyItMatters: "Ensures strategy performs well across different market conditions",
    inputs: ["Optimized parameters", "Market scenarios", "Risk thresholds"],
    checks: ["Market regime testing", "Sensitivity analysis", "Feature validation"],
    metrics: ["Robustness score", "Features added", "Stress test results"],
    statusMap: {
      "auto_patching": "passed",
      "robustness": "passed",
      "failed": "failed",
    },
  },
  {
    id: "competition",
    name: "Portfolio Competition",
    icon: "leaderboard",
    description: "Compares strategy against alternatives and selects best performers",
    whyItMatters: "Ensures the chosen strategy outperforms other viable options",
    inputs: ["Multiple strategies", "Performance metrics", "Risk profiles"],
    checks: ["Statistical significance", "Risk-adjusted returns", "Consistency ranking"],
    metrics: ["Competition score", "Rank position", "Advantage margin"],
    statusMap: {
      "ensemble": "passed",
      "competition": "passed",
      "failed": "failed",
    },
  },
  {
    id: "delivery",
    name: "Delivery / Export",
    icon: "package",
    description: "Generates final strategy files and comprehensive reports",
    whyItMatters: "Produces production-ready strategy files with full documentation",
    inputs: ["Validated strategy", "Configuration", "Test results"],
    checks: ["File generation", "Metadata completeness", "Export validation"],
    metrics: ["Files created", "Report pages", "Export time"],
    statusMap: {
      "delivery": "passed",
      "completed": "passed",
      "failed": "failed",
    },
  },
];

// Map legacy stage names to new pipeline step IDs
export const LEGACY_STAGE_MAP = {
  "Sanity Backtest": "baseline",
  "Hyperopt Execution": "hyperopt",
  "Auto-Patching": "robustness",
  "Out-of-Sample Validation": "robustness",
  "Multi-Pair Stress Test": "competition",
  "Risk Assessment": "robustness",
  "Delivery": "delivery",
};

// Helper to get step metadata by ID or legacy name
export function getPipelineStep(stepIdOrName) {
  return (
    PIPELINE_STEPS.find((step) => step.id === stepIdOrName) ||
    PIPELINE_STEPS.find((step) => step.name === stepIdOrName) ||
    PIPELINE_STEPS.find((step) => LEGACY_STAGE_MAP[stepIdOrName] === step.id) ||
    null
  );
}

// Helper to map stage status to card status
export function mapStageStatus(stageStatus, stageName) {
  const step = getPipelineStep(stageName);
  if (!step) return stageStatus;
  
  // Direct status mapping from step definition
  if (step.statusMap[stageStatus]) {
    return step.statusMap[stageStatus];
  }
  
  // Default status mapping
  const statusMap = {
    "pending": "pending",
    "running": "running",
    "passed": "passed",
    "failed": "failed",
    "warning": "warning",
    "skipped": "skipped",
    "completed": "passed",
  };
  
  return statusMap[stageStatus] || "pending";
}
