import { useState, Fragment } from "react";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import ErrorDisplay from "../shared/ErrorDisplay";

function RetryHistoryTable({ history, onAcceptFix, onRejectFix }) {
  const [expandedDetails, setExpandedDetails] = useState({});
  const [expandedMetrics, setExpandedMetrics] = useState({});
  const [expandedReasoning, setExpandedReasoning] = useState({});

  if (!history || history.length === 0) return null;

  const toggleDetails = (attempt) => {
    setExpandedDetails(prev => ({
      ...prev,
      [attempt]: !prev[attempt]
    }));
  };

  const toggleMetrics = (attempt) => {
    setExpandedMetrics(prev => ({
      ...prev,
      [attempt]: !prev[attempt]
    }));
  };

  const toggleReasoning = (attempt) => {
    setExpandedReasoning(prev => ({
      ...prev,
      [attempt]: !prev[attempt]
    }));
  };

  // Check if this is the new retry history structure
  const isNewStructure = history.length > 0 && history[0].error_code !== undefined;

  if (isNewStructure) {
    // New structure with enhanced retry history
    return (
      <div className="mt-3 space-y-2">
        {history.map((attempt, index) => (
          <div
            key={attempt.attempt || index}
            className="rounded-lg bg-base-200/50 border border-base-300 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                  {attempt.error_code && (
                    <span className={`badge badge-xs ${
                      attempt.error_code === "sharp_peak" ? "badge-secondary" :
                      "badge-error"
                    }`}>
                      {attempt.error_code}
                    </span>
                  )}
                </div>
                {attempt.action && (
                  <p className="text-[10px] text-base-content/50 mt-1">
                    Action: <span className="font-mono text-primary/80">{attempt.action}</span>
                  </p>
                )}
                {attempt.reason && (
                  <p className="text-[10px] text-base-content/70 mt-1 italic">{attempt.reason}</p>
                )}
              </div>
              <div className="text-[10px] text-base-content/40">
                {attempt.timestamp && new Date(attempt.timestamp).toLocaleTimeString()}
              </div>
            </div>

            {/* Metrics comparison */}
            {(attempt.metrics_before || attempt.metrics_after) && (
              <div className="mt-2 pt-2 border-t border-base-300/50">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[10px] text-base-content/60 hover:text-base-content transition-colors"
                  onClick={() => toggleMetrics(attempt.attempt || index)}
                >
                  <ChevronRightIcon
                    className={`h-3 w-3 transition-transform duration-200 ${
                      expandedMetrics[attempt.attempt || index] ? "rotate-90" : ""
                    }`}
                  />
                  {expandedMetrics[attempt.attempt || index] ? "Hide" : "Show"} metrics
                </button>
                {expandedMetrics[attempt.attempt || index] && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-base-300/30 rounded p-2">
                      <span className="text-base-content/50 font-semibold">Before:</span>
                      <div className="font-mono text-base-content/70 mt-1">
                        {attempt.metrics_before &&
                          Object.entries(attempt.metrics_before).map(([k, v]) => (
                            <span key={k} className="mr-2">
                              {k}: {typeof v === "number" ? v.toFixed(3) : v}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="bg-base-300/30 rounded p-2">
                      <span className="text-base-content/50 font-semibold">After:</span>
                      <div className="font-mono text-base-content/70 mt-1">
                        {attempt.metrics_after &&
                          Object.entries(attempt.metrics_after).map(([k, v]) => (
                            <span key={k} className="mr-2">
                              {k}: {typeof v === "number" ? v.toFixed(3) : v}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Parameter changes */}
            {(attempt.before || attempt.after) && (
              <div className="mt-2 pt-2 border-t border-base-300/50">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[10px] text-base-content/60 hover:text-base-content transition-colors"
                  onClick={() => toggleDetails(attempt.attempt || index)}
                >
                  <ChevronRightIcon
                    className={`h-3 w-3 transition-transform duration-200 ${
                      expandedDetails[attempt.attempt || index] ? "rotate-90" : ""
                    }`}
                  />
                  {expandedDetails[attempt.attempt || index] ? "Hide" : "Show"} parameter changes
                </button>
                {expandedDetails[attempt.attempt || index] && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-base-300/30 rounded p-2">
                      <span className="text-base-content/50 font-semibold">Before:</span>
                      <pre className="font-mono text-base-content/70 mt-1 overflow-x-auto">
                        {JSON.stringify(attempt.before, null, 2)}
                      </pre>
                    </div>
                    <div className="bg-base-300/30 rounded p-2">
                      <span className="text-base-content/50 font-semibold">After:</span>
                      <pre className="font-mono text-base-content/70 mt-1 overflow-x-auto">
                        {JSON.stringify(attempt.after, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
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
    );
  }

  // Old structure (backward compatibility)
  return (
    <div className="overflow-x-auto mt-2">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-base-content/40 text-[9px] uppercase tracking-wider">
            <th className="font-semibold">Attempt</th>
            <th className="font-semibold">Loss Function</th>
            <th className="font-semibold">Spaces</th>
            <th className="font-semibold text-right">OOS Profit</th>
            <th className="font-semibold text-right">Max DD</th>
            <th className="font-semibold text-right">Trades</th>
            <th className="font-semibold text-center">Fail Reason</th>
            <th className="font-semibold text-center">AI</th>
          </tr>
        </thead>
        <tbody>
          {history.map((a) => (
            <Fragment key={a.attempt}>
              <tr className="text-xs border-b border-base-300/30">
                <td className="font-medium text-base-content/80">{a.label}</td>
                <td className="font-mono text-[10px] text-primary/80">{a.loss}</td>
                <td className="font-mono text-[10px] text-base-content/50">{(a.spaces || []).join(", ")}</td>
                <td className={`text-right font-mono font-semibold ${
                  a.profit == null ? "text-base-content/30" :
                  a.profit >= 0 ? "text-success" : "text-error"
                }`}>
                  {a.profit == null ? "-" : `${a.profit >= 0 ? "+" : ""}${(a.profit * 100).toFixed(2)}%`}
                </td>
                <td className={`text-right font-mono ${
                  a.drawdown == null ? "text-base-content/30" :
                  a.drawdown > 20 ? "text-error" : a.drawdown > 10 ? "text-warning" : "text-base-content/60"
                }`}>
                  {a.drawdown == null ? "-" : `${a.drawdown.toFixed(1)}%`}
                </td>
                <td className="text-right font-mono text-base-content/60">{a.trades ?? "-"}</td>
                <td className="text-center">
                  <span className={`badge badge-xs ${
                    a.reason === "sharp_peak" ? "badge-secondary" :
                    "badge-error"
                  }`}>
                    {a.reason === "drawdown" ? "High DD" :
                     a.reason === "sharp_peak" ? "Sharp Peak" :
                     a.reason === "both" ? "Profit+DD" :
                     a.reason === "no_trades" ? "No Trades" :
                     "Low Profit"}
                  </span>
                </td>
                <td className="text-center">
                  {a.ollama_suggestions ? (
                    <div className="flex items-center justify-center gap-1">
                      <span className="badge badge-xs badge-info gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                          <path d="M2 17l10 5 10-5"/>
                          <path d="M2 12l10 5 10-5"/>
                        </svg>
                        AI
                      </span>
                      {a.ollama_suggestions.reasoning && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs p-0 h-5 min-h-0 w-5"
                          onClick={() => toggleReasoning(a.attempt)}
                          title="View AI reasoning"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className={`w-3 h-3 transition-transform duration-200 ${expandedReasoning[a.attempt] ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 9l6 6 6-6"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-base-content/20">-</span>
                  )}
                </td>
              </tr>
              {a.ollama_suggestions?.reasoning && expandedReasoning[a.attempt] && (
                <tr>
                  <td colSpan="8" className="p-2 bg-base-200/30">
                    <div className="text-[10px] text-base-content/70">
                      <span className="font-semibold text-info">AI Reasoning:</span>
                      <p className="mt-1 italic">{a.ollama_suggestions.reasoning}</p>
                      {a.ollama_suggestions.hyperopt_loss && (
                    <div className="mt-1 font-mono text-[9px] text-base-content/50">
                      Suggested: loss={a.ollama_suggestions.hyperopt_loss}, spaces={a.ollama_suggestions.hyperopt_spaces?.join(",")}, epochs={a.ollama_suggestions.hyperopt_epochs}
                    </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeneralizationFailurePanel({ gf, onRetryRelaxed, onAcceptFix, onRejectFix }) {
  const [open, setOpen] = useState(false);
  if (!gf) return null;
  const { thresholds, attempts, best_attempt, best_attempt_file, best_attempt_strategy_name, suggestions } = gf;

  // Determine error code from reason
  const errorCode = gf.reason === "sharp_peak" ? "sharp_peak" : "robustness_failed";
  const severity = gf.reason === "sharp_peak" ? "high" : "high";
  const canAutoFix = gf.reason === "sharp_peak"; // Only sharp_peak allows auto-fix

  // Calculate relaxed thresholds for button
  const relaxedProfit = best_attempt?.profit != null
    ? parseFloat((best_attempt.profit - 0.01).toFixed(4))
    : null;
  const relaxedDd = best_attempt?.drawdown != null || thresholds?.max_drawdown_threshold != null
    ? Math.min(35, parseFloat(((best_attempt?.drawdown ?? thresholds?.max_drawdown_threshold ?? 30) + 5).toFixed(1)))
    : null;

  return (
    <div className="space-y-3 mt-3">
      {/* Use ErrorDisplay for consistent error presentation */}
      <ErrorDisplay
        errorCode={errorCode}
        title={gf.reason === "sharp_peak" ? "Robustness Check Failure (Sharp Peak)" : "Generalization Failure Diagnostics"}
        reason={gf.reason === "sharp_peak"
          ? "Strategy params are too sensitive. Small variations cause massive performance drops."
          : `Active gates - OOS profit >= ${thresholds?.min_oos_profit ?? 0} / Max drawdown < ${thresholds?.max_drawdown_threshold ?? 30}%`
        }
        severity={severity}
        canAutoFix={canAutoFix}
        suggestedAction={gf.reason === "sharp_peak"
          ? "Apply ROI smoothing auto-fix to reduce parameter sensitivity"
          : suggestions && suggestions.length > 0 ? suggestions[0] : "Review parameters and retry with adjusted thresholds"
        }
        retryHistory={attempts}
        showRetryHistory={false} // We show retry history separately below
      />

      {/* Active thresholds summary */}
      <div className="flex flex-wrap gap-1.5">
        {gf.reason === "sharp_peak" ? (
          <span className="badge badge-xs badge-outline badge-secondary">
            Sensitivity {'>'} 25% (Robustness Gate)
          </span>
        ) : (
          <>
            <span className="badge badge-xs badge-outline badge-error">
              Min OOS Profit: {thresholds?.min_oos_profit ?? 0}
            </span>
            <span className="badge badge-xs badge-outline badge-error">
              Max DD: {thresholds?.max_drawdown_threshold ?? 30}%
            </span>
          </>
        )}
        {best_attempt && best_attempt.profit != null && (
          <span className={`badge badge-xs badge-outline ${gf.reason === "sharp_peak" ? "badge-secondary" : "badge-warning"}`}>
            Best profit: {best_attempt.profit >= 0 ? "+" : ""}{(best_attempt.profit * 100).toFixed(2)}%
            ({best_attempt.label})
          </span>
        )}
      </div>

        {/* Retry history table (collapsible) */}
        <div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[10px] text-error/70 hover:text-error cursor-pointer select-none transition-colors"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronRightIcon className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
            {open ? "Hide" : "Show"} attempt history ({attempts?.length ?? 0} attempts)
          </button>
          {open && <RetryHistoryTable history={attempts} onAcceptFix={onAcceptFix} onRejectFix={onRejectFix} />}
        </div>

        {/* Best attempt artifact */}
        {best_attempt_file && (
          <div className="rounded-lg bg-base-300/50 border border-base-300 px-3 py-2 flex items-center gap-2">
            <DocumentTextIcon className="h-4 w-4 shrink-0 text-warning" />
            <span className="text-[10px] text-base-content/70">
              Best attempt saved as <span className="font-mono text-base-content/90">{best_attempt_file}</span>
              {best_attempt_strategy_name && (
                <span> and added to your strategy list as <span className="font-mono text-success/80">{best_attempt_strategy_name}</span></span>
              )}
            </span>
          </div>
        )}

        {/* Actionable suggestions */}
        {suggestions && suggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-base-content/50 uppercase tracking-wider">Suggestions</p>
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-base-content/70">
                  <ChevronRightIcon className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Retry with relaxed thresholds button is not applicable for Sharp Peak failures. */}
        {onRetryRelaxed && best_attempt && gf.reason !== "sharp_peak" && (
          <button
            type="button"
            className="btn btn-sm btn-outline btn-warning gap-2 w-full"
            onClick={() => onRetryRelaxed(best_attempt, thresholds, best_attempt_strategy_name)}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Retry with Relaxed Thresholds
            {relaxedProfit != null && (
              <span className="text-[10px] opacity-70 normal-case">
                (OOS gate to {relaxedProfit.toFixed(4)}, DD to {relaxedDd}%
                {best_attempt_strategy_name ? `, strategy to ${best_attempt_strategy_name}` : ""})
              </span>
            )}
          </button>
        )}
    </div>
  );
}

export default function AutoQuantFailureReport({ state, onRetryRelaxed }) {
  const failedStage = state.stages?.find((s) => s.status === "failed");
  const gf = state.generalization_failure
    ?? (failedStage?.data?.attempts ? failedStage.data : null);
  // Stage 4 = OOS overfitting exhaustion; Stage 2 = Sharp Peak sensitivity exhaustion
  const isGeneralizationFailure = (failedStage?.index === 4 || failedStage?.index === 2) && gf;

  return (
    <div className={`rounded-xl border p-4 ${isGeneralizationFailure ? (gf.reason === "sharp_peak" ? "border-secondary/30 bg-secondary/5" : "border-error/30 bg-error/5") : "border-error/40 bg-error/10"}`}>
      <div className="flex items-start gap-2">
        {gf?.reason === "sharp_peak" ? (
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-secondary" />
        ) : (
          <XCircleIcon className="h-5 w-5 shrink-0 text-error" />
        )}
        <div className="flex-1 min-w-0">
          <h4 className={`font-bold text-sm ${gf?.reason === "sharp_peak" ? "text-secondary" : "text-error"}`}>
            {gf?.reason === "sharp_peak" ? "Robustness Gate Failed" : "Pipeline Failed"}
          </h4>
          {failedStage && (
            <p className="text-xs mt-1 text-base-content/70">
              Stage {failedStage.index} - {failedStage.name}
              {isGeneralizationFailure ? "" : `: ${failedStage.message}`}
            </p>
          )}
          {!failedStage && state.error && (
            <p className="text-xs mt-1 text-base-content/70">{state.error}</p>
          )}
          {isGeneralizationFailure && (
            <GeneralizationFailurePanel gf={gf} onRetryRelaxed={onRetryRelaxed} />
          )}
        </div>
      </div>
    </div>
  );
}
