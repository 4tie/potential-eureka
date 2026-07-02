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
      // Backend statuses for this stage
      "running": "running",
      "passed": "passed",
      "failed": "failed",
      "pending": "pending",
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
      "running": "running",
      "passed": "passed",
      "failed": "failed",
      "pending": "pending",
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
      "running": "running",
      "passed": "passed",
      "failed": "failed",
      "pending": "pending",
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
      "running": "running",
      "passed": "passed",
      "failed": "failed",
      "pending": "pending",
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
      "running": "running",
      "passed": "passed",
      "failed": "failed",
      "pending": "pending",
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
      "running": "running",
      "passed": "passed",
      "failed": "failed",
      "pending": "pending",
    },
  },
];

// Map legacy stage names and backend stage names to new pipeline step IDs
export const LEGACY_STAGE_MAP = {
  // New premium pipeline stage names (direct match)
  "Pre-flight Filtering": "preflight",
  "Portfolio Baseline Backtest": "baseline",
  "WFA Hyperopt": "hyperopt",
  "Robustness & Feature Injection": "robustness",
  "Portfolio Competition": "competition",
  "Delivery / Export": "delivery",

  // Backend stage names (from backend/services/auto_quant/pipeline_modules/config.py)
  "Pre-Flight Filtering": "preflight",
  "Delivery": "delivery",

  // Legacy UI stage names (for backward compatibility)
  "Sanity Backtest": "baseline",
  "Hyperopt Execution": "hyperopt",
  "Auto-Patching": "robustness",
  "Out-of-Sample Validation": "robustness",
  "Multi-Pair Stress Test": "competition",
  "Risk Assessment": "robustness",
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
  
  // Default status mapping (stage-level - use 'passed' not 'completed')
  const statusMap = {
    "pending": "pending",
    "running": "running",
    "passed": "passed",
    "failed": "failed",
    "warning": "warning",
    "skipped": "skipped",
  };
  
  return statusMap[stageStatus] || "pending";
}
