/**
 * Error translation utilities for AutoQuant
 * Converts backend errors into helpful, user-friendly messages
 */

// Common error patterns and their translations
const ERROR_PATTERNS = [
  {
    pattern: /no such file or directory/i,
    userMessage: "Strategy file not found. Please check the file path and try again.",
    severity: "error",
    action: "verify_file",
  },
  {
    pattern: /syntax error/i,
    userMessage: "Strategy file contains syntax errors. Please review your code for typos or missing elements.",
    severity: "error",
    action: "fix_syntax",
  },
  {
    pattern: /indentation error/i,
    userMessage: "Strategy file has incorrect indentation. Python requires consistent spacing.",
    severity: "error",
    action: "fix_indentation",
  },
  {
    pattern: /name.*is not defined/i,
    userMessage: "Strategy uses an undefined variable or function. Check that all imports and variables are properly defined.",
    severity: "error",
    action: "check_variables",
  },
  {
    pattern: /module.*has no attribute/i,
    userMessage: "Strategy uses a function or attribute that doesn't exist in the imported module.",
    severity: "error",
    action: "check_api",
  },
  {
    pattern: /key error/i,
    userMessage: "Strategy is trying to access data that doesn't exist. Check your data access logic.",
    severity: "error",
    action: "check_data_access",
  },
  {
    pattern: /type error/i,
    userMessage: "Strategy has a type mismatch - using the wrong data type for an operation.",
    severity: "error",
    action: "check_types",
  },
  {
    pattern: /connection.*refused/i,
    userMessage: "Cannot connect to the exchange API. Please check your internet connection and API credentials.",
    severity: "error",
    action: "check_connection",
  },
  {
    pattern: /authentication.*failed/i,
    userMessage: "Exchange API authentication failed. Please verify your API keys are correct.",
    severity: "error",
    action: "check_credentials",
  },
  {
    pattern: /rate limit/i,
    userMessage: "Exchange API rate limit reached. Please wait a few minutes and try again.",
    severity: "warning",
    action: "wait_retry",
  },
  {
    pattern: /insufficient.*data/i,
    userMessage: "Not enough historical data available for the selected pairs and timeframe.",
    severity: "warning",
    action: "adjust_timerange",
  },
  {
    pattern: /no.*trades/i,
    userMessage: "Strategy generated no trades. The buy/sell conditions may be too strict.",
    severity: "warning",
    action: "relax_conditions",
  },
  {
    pattern: /memory.*error/i,
    userMessage: "System ran out of memory. Try reducing the number of pairs or the time range.",
    severity: "error",
    action: "reduce_scope",
  },
  {
    pattern: /timeout/i,
    userMessage: "Operation timed out. The task took longer than expected. Try with fewer pairs or shorter time range.",
    severity: "warning",
    action: "reduce_scope",
  },
  {
    pattern: /hyperopt.*no space/i,
    userMessage: "No parameter spaces defined for optimization. Please specify which parameters to optimize.",
    severity: "error",
    action: "configure_hyperopt",
  },
  {
    pattern: /drawdown.*exceed/i,
    userMessage: "Strategy drawdown exceeds acceptable limits. Consider adjusting risk management parameters.",
    severity: "warning",
    action: "adjust_risk",
  },
  {
    pattern: /profit.*below.*threshold/i,
    userMessage: "Strategy profitability is below the minimum threshold. The strategy may not be viable.",
    severity: "warning",
    action: "review_profitability",
  },
  {
    pattern: /validation.*failed/i,
    userMessage: "Strategy validation failed. Review the specific validation checks that failed.",
    severity: "error",
    action: "review_validation",
  },
  {
    pattern: /config.*error/i,
    userMessage: "Configuration error. Please check your strategy settings and parameters.",
    severity: "error",
    action: "check_config",
  },
  {
    pattern: /permission.*denied/i,
    userMessage: "Permission denied. Check file system permissions for the strategy file and output directories.",
    severity: "error",
    action: "check_permissions",
  },
];

// Stage-specific error messages
const STAGE_ERRORS = {
  "Sanity Backtest": {
    default: "Initial backtest failed. This may indicate issues with strategy logic or data availability.",
    checks: [
      "Verify strategy syntax is correct",
      "Check that required indicators are available",
      "Ensure data exists for the selected pairs and timeframe",
    ],
  },
  "Hyperopt Execution": {
    default: "Parameter optimization failed. Check hyperopt configuration and parameter spaces.",
    checks: [
      "Verify parameter spaces are defined",
      "Check that loss function is compatible",
      "Ensure sufficient data for optimization",
    ],
  },
  "Auto-Patching": {
    default: "Strategy patching failed. The automated improvements could not be applied.",
    checks: [
      "Check that strategy structure allows patching",
      "Verify patching configuration is valid",
      "Review patching logs for specific issues",
    ],
  },
  "Out-of-Sample Validation": {
    default: "Out-of-sample validation failed. Strategy may be overfitted to training data.",
    checks: [
      "Review in-sample vs out-of-sample performance",
      "Check for data leakage in strategy logic",
      "Consider simpler strategy to reduce overfitting",
    ],
  },
  "Multi-Pair Stress Test": {
    default: "Multi-pair stress test failed. Strategy may not perform consistently across different pairs.",
    checks: [
      "Review performance across different pairs",
      "Check for pair-specific overfitting",
      "Consider pair filtering or parameter adjustment",
    ],
  },
  "Risk Assessment": {
    default: "Risk assessment failed. Strategy risk profile is outside acceptable limits.",
    checks: [
      "Review maximum drawdown",
      "Check risk management parameters",
      "Consider position sizing adjustments",
    ],
  },
  "Delivery": {
    default: "Export failed. Could not generate final strategy files.",
    checks: [
      "Check file system permissions",
      "Verify output directory exists",
      "Review export configuration",
    ],
  },
};

/**
 * Translate a backend error message into a user-friendly message
 */
export function translateError(errorMessage, stageName = null) {
  if (!errorMessage) {
    return {
      userMessage: "An unknown error occurred.",
      severity: "error",
      action: "contact_support",
      originalMessage: errorMessage,
    };
  }

  // Try to match against known patterns
  for (const { pattern, userMessage, severity, action } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        userMessage,
        severity,
        action,
        originalMessage: errorMessage,
      };
    }
  }

  // Fall back to stage-specific default
  if (stageName && STAGE_ERRORS[stageName]) {
    return {
      userMessage: STAGE_ERRORS[stageName].default,
      severity: "error",
      action: "review_stage",
      checks: STAGE_ERRORS[stageName].checks,
      originalMessage: errorMessage,
    };
  }

  // Generic fallback
  return {
    userMessage: "An error occurred during pipeline execution. Please review the technical details.",
    severity: "error",
    action: "review_logs",
    originalMessage: errorMessage,
  };
}

/**
 * Get suggested actions for a given error action type
 */
export function getSuggestedActions(action) {
  const actionSuggestions = {
    verify_file: [
      "Check that the strategy file path is correct",
      "Ensure the file exists in the specified location",
      "Verify file extensions are correct (.py for strategies)",
    ],
    fix_syntax: [
      "Review your code for typos and missing punctuation",
      "Check that all parentheses, brackets, and quotes are properly closed",
      "Use a code editor with syntax highlighting to identify errors",
    ],
    fix_indentation: [
      "Ensure consistent indentation (use spaces, not tabs)",
      "Check that indentation levels are correct for nested code blocks",
      "Python requires consistent indentation for code blocks",
    ],
    check_variables: [
      "Review all variable names for typos",
      "Ensure all imported functions/variables are used correctly",
      "Check that variables are defined before use",
    ],
    check_api: [
      "Review Freqtrade documentation for correct API usage",
      "Check that function names and parameters are correct",
      "Ensure you're using the correct Freqtrade version",
    ],
    check_data_access: [
      "Review how you access dataframe columns",
      "Check that column names match your data structure",
      "Use .get() method for safer dictionary access",
    ],
    check_types: [
      "Review data types being used in operations",
      "Add type conversions where needed (str(), int(), float())",
      "Check function return types match expected usage",
    ],
    check_connection: [
      "Verify your internet connection is working",
      "Check exchange API status",
      "Try accessing exchange website directly",
    ],
    check_credentials: [
      "Verify API keys are correct and have required permissions",
      "Check that API keys are not expired or revoked",
      "Ensure IP whitelist allows your address if configured",
    ],
    wait_retry: [
      "Wait a few minutes for rate limits to reset",
      "Reduce the frequency of API calls",
      "Consider using fewer pairs to reduce API load",
    ],
    adjust_timerange: [
      "Extend the historical time range",
      "Try different pairs with more data availability",
      "Check exchange data availability for your selection",
    ],
    relax_conditions: [
      "Review buy/sell signal conditions",
      "Consider relaxing indicator thresholds",
      "Check that strategy logic allows for trade generation",
    ],
    reduce_scope: [
      "Reduce the number of pairs in the universe",
      "Shorten the backtest time range",
      "Close other applications to free memory",
    ],
    configure_hyperopt: [
      "Define parameter spaces in strategy or config",
      "Specify which parameters to optimize (buy, sell, stoploss, etc.)",
      "Check hyperopt configuration in settings",
    ],
    adjust_risk: [
      "Review and tighten stop-loss settings",
      "Implement position sizing limits",
      "Consider reducing leverage or exposure",
    ],
    review_profitability: [
      "Review strategy logic for profitability issues",
      "Check if transaction costs are eating profits",
      "Consider different market conditions or timeframes",
    ],
    review_validation: [
      "Review specific validation checks that failed",
      "Check validation thresholds in settings",
      "Examine validation logs for details",
    ],
    check_config: [
      "Review strategy configuration parameters",
      "Check that all required settings are provided",
      "Verify configuration format is correct",
    ],
    check_permissions: [
      "Check read/write permissions on strategy file",
      "Verify output directory permissions",
      "Run with appropriate user permissions",
    ],
    review_stage: [
      "Review the specific stage that failed",
      "Check stage-specific requirements",
      "Examine stage logs for details",
    ],
    review_logs: [
      "Review the technical error logs",
      "Check for specific error messages",
      "Consider reporting the issue if it persists",
    ],
    contact_support: [
      "Review all available error information",
      "Check documentation for known issues",
      "Report the issue with full error details",
    ],
  };

  return actionSuggestions[action] || [
    "Review the error details",
    "Check the technical logs for more information",
    "Consider consulting documentation or support",
  ];
}

/**
 * Format error details for display in technical section
 */
export function formatErrorDetails(errorTranslation) {
  const { originalMessage, action, checks } = errorTranslation;

  const details = [];
  
  if (originalMessage) {
    details.push({
      label: "Technical Error",
      value: originalMessage,
    });
  }

  if (action) {
    const suggestions = getSuggestedActions(action);
    details.push({
      label: "Suggested Actions",
      value: suggestions.join("\n• "),
    });
  }

  if (checks && checks.length > 0) {
    details.push({
      label: "Checks to Perform",
      value: checks.join("\n• "),
    });
  }

  return details;
}
