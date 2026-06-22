import { useState } from "react";
import {
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

// Severity color mappings
const SEVERITY_CONFIG = {
  critical: {
    bgColor: "bg-error/10",
    borderColor: "border-error/30",
    iconColor: "text-error",
    badgeColor: "badge-error",
  },
  high: {
    bgColor: "bg-error/5",
    borderColor: "border-error/20",
    iconColor: "text-error",
    badgeColor: "badge-error",
  },
  medium: {
    bgColor: "bg-warning/10",
    borderColor: "border-warning/30",
    iconColor: "text-warning",
    badgeColor: "badge-warning",
  },
  low: {
    bgColor: "bg-info/10",
    borderColor: "border-info/30",
    iconColor: "text-info",
    badgeColor: "badge-info",
  },
  info: {
    bgColor: "bg-info/5",
    borderColor: "border-info/20",
    iconColor: "text-info",
    badgeColor: "badge-info",
  },
};

// Error code to title mapping (should match backend taxonomy)
const ERROR_TITLES = {
  optimization_failed: "Optimization Failed",
  robustness_failed: "Robustness Check Failed",
  sharp_peak: "Sharp Peak Detected",
  low_trades: "Low Trade Count",
  high_drawdown: "High Drawdown",
  missing_data: "Missing Data",
  config_error: "Configuration Error",
  strategy_syntax_error: "Strategy Syntax Error",
  empty_pair_list: "Empty Pair List",
  exchange_download_failure: "Exchange Data Download Failed",
  export_ready: "Export Ready",
  overfit_roi: "Overfit ROI",
  aggressive_stoploss: "Aggressive Stoploss",
  aggressive_trailing: "Aggressive Trailing",
};

// Retry History Timeline Component
function RetryHistoryTimeline({ retryHistory, onAcceptFix, onRejectFix }) {
  const [expanded, setExpanded] = useState(false);

  if (!retryHistory || retryHistory.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        className="flex items-center gap-2 text-xs text-base-content/60 hover:text-base-content transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRightIcon
          className={`h-3 w-3 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        {expanded ? "Hide" : "Show"} retry history ({retryHistory.length} attempts)
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {retryHistory.map((attempt, index) => (
            <div
              key={attempt.attempt || index}
              className="rounded-lg bg-base-200/50 border border-base-300 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge badge-xs badge-outline">
                      Attempt {attempt.attempt || index + 1}
                    </span>
                    <span className={`badge badge-xs ${
                      attempt.status === "improved" ? "badge-success" :
                      attempt.status === "declined" ? "badge-warning" :
                      attempt.status === "failed" ? "badge-error" :
                      "badge-neutral"
                    }`}>
                      {attempt.status || "pending"}
                    </span>
                    {attempt.accepted !== undefined && (
                      <span className={`badge badge-xs ${
                        attempt.accepted ? "badge-success" : "badge-error"
                      }`}>
                        {attempt.accepted ? "Accepted" : "Rejected"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-base-content/70 font-medium">
                    {attempt.error_code || "Unknown error"}
                  </p>
                  {attempt.action && (
                    <p className="text-[10px] text-base-content/50 mt-1">
                      Action: <span className="font-mono">{attempt.action}</span>
                    </p>
                  )}
                  {attempt.reason && (
                    <p className="text-[10px] text-base-content/50 mt-1 italic">
                      {attempt.reason}
                    </p>
                  )}
                </div>
                <div className="text-[10px] text-base-content/40">
                  {new Date(attempt.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {/* Metrics comparison */}
              {(attempt.metrics_before || attempt.metrics_after) && (
                <div className="mt-2 pt-2 border-t border-base-300/50">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-base-content/50">Before:</span>
                      <div className="font-mono text-base-content/70">
                        {attempt.metrics_before &&
                          Object.entries(attempt.metrics_before).map(([k, v]) => (
                            <span key={k} className="mr-2">
                              {k}: {typeof v === "number" ? v.toFixed(3) : v}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-base-content/50">After:</span>
                      <div className="font-mono text-base-content/70">
                        {attempt.metrics_after &&
                          Object.entries(attempt.metrics_after).map(([k, v]) => (
                            <span key={k} className="mr-2">
                              {k}: {typeof v === "number" ? v.toFixed(3) : v}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons for pending attempts */}
              {attempt.status === "pending" && onAcceptFix && onRejectFix && (
                <div className="mt-2 pt-2 border-t border-base-300/50 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-xs btn-success gap-1"
                    onClick={() => onAcceptFix(attempt)}
                  >
                    <CheckCircleIcon className="h-3 w-3" />
                    Accept Fix
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-error gap-1"
                    onClick={() => onRejectFix(attempt)}
                  >
                    <XCircleIcon className="h-3 w-3" />
                    Reject Fix
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Main ErrorDisplay Component
export default function ErrorDisplay({
  errorCode,
  title,
  reason,
  severity = "high",
  canAutoFix = false,
  suggestedAction,
  retryHistory,
  onNextAction,
  onApplyAutoFix,
  nextActionLabel = "Next",
  showRetryHistory = true,
}) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.high;
  const displayTitle = title || ERROR_TITLES[errorCode] || "Error";
  const Icon =
    severity === "critical" || severity === "high"
      ? XCircleIcon
      : severity === "medium"
      ? ExclamationTriangleIcon
      : InformationCircleIcon;

  return (
    <div
      className={`rounded-xl border p-4 ${config.bgColor} ${config.borderColor}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 shrink-0 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          {/* Error Title and Severity Badge */}
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`font-bold text-sm ${config.iconColor}`}>
              {displayTitle}
            </h4>
            <span className={`badge badge-xs ${config.badgeColor}`}>
              {severity}
            </span>
            {canAutoFix !== undefined && (
              <span className={`badge badge-xs ${
                canAutoFix ? "badge-success" : "badge-neutral"
              }`}>
                {canAutoFix ? "Auto-fix available" : "Manual fix required"}
              </span>
            )}
          </div>

          {/* Error Reason */}
          {reason && (
            <p className="text-xs text-base-content/70 mt-1">{reason}</p>
          )}

          {/* Suggested Action */}
          {suggestedAction && (
            <div className="mt-2 rounded-lg bg-base-300/30 border border-base-300/50 p-2">
              <p className="text-[10px] text-base-content/50 uppercase tracking-wider font-semibold mb-1">
                Suggested Action
              </p>
              <p className="text-xs text-base-content/80">{suggestedAction}</p>
            </div>
          )}

          {/* Retry History */}
          {showRetryHistory && retryHistory && retryHistory.length > 0 && (
            <RetryHistoryTimeline
              retryHistory={retryHistory}
              onAcceptFix={onApplyAutoFix ? (attempt) => onApplyAutoFix(attempt, true) : undefined}
              onRejectFix={onApplyAutoFix ? (attempt) => onApplyAutoFix(attempt, false) : undefined}
            />
          )}

          {/* Next Action Button */}
          {onNextAction && (
            <div className="mt-3">
              <button
                type="button"
                className="btn btn-sm btn-outline gap-2"
                onClick={onNextAction}
              >
                {canAutoFix && onApplyAutoFix ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4" />
                    Apply Auto-Fix
                  </>
                ) : (
                  nextActionLabel
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
