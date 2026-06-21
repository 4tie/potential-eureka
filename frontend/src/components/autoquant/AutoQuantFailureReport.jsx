import { useState, Fragment } from "react";
import {
  ArrowPathIcon,
  BeakerIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

function RetryHistoryTable({ history }) {
  const [expandedReasoning, setExpandedReasoning] = useState({});

  if (!history || history.length === 0) return null;
  
  const toggleReasoning = (attempt) => {
    setExpandedReasoning(prev => ({
      ...prev,
      [attempt]: !prev[attempt]
    }));
  };
  
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

function GeneralizationFailurePanel({ gf, onRetryRelaxed }) {
  const [open, setOpen] = useState(false);
  if (!gf) return null;
  const { thresholds, attempts, best_attempt, best_attempt_file, best_attempt_strategy_name, suggestions } = gf;

  return (
    <div className="space-y-3 mt-3">
      {/* Structured diagnostics block */}
      <div className={`rounded-xl border p-4 space-y-3 ${gf.reason === "sharp_peak" ? "border-secondary/25 bg-secondary/5" : "border-error/25 bg-error/5"}`}>
        <div className="flex items-start gap-2">
          {gf.reason === "sharp_peak" ? (
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
          ) : (
            <BeakerIcon className="mt-0.5 h-5 w-5 shrink-0 text-error" />
          )}
            <div>
              <p className={`text-xs font-semibold ${gf.reason === "sharp_peak" ? "text-secondary" : "text-error"}`}>
                {gf.reason === "sharp_peak" ? "Robustness Check Failure (Sharp Peak)" : "Generalization Failure Diagnostics"}
              </p>
              <p className="text-[10px] text-base-content/50 mt-0.5">
                {gf.reason === "sharp_peak"
                  ? "Strategy params are too sensitive. Small variations cause massive performance drops."
                  : `Active gates - OOS profit >= ${thresholds?.min_oos_profit ?? 0} / Max drawdown < ${thresholds?.max_drawdown_threshold ?? 30}%`
                }
              </p>
            </div>
          </div>

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
          {open && <RetryHistoryTable history={attempts} />}
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
      </div>

      {/* Retry with relaxed thresholds button is not applicable for Sharp Peak failures. */}
      {onRetryRelaxed && best_attempt && gf.reason !== "sharp_peak" && (() => {
        const relaxedProfit = best_attempt.profit != null
          ? parseFloat((best_attempt.profit - 0.01).toFixed(4))
          : null;
        const relaxedDd = Math.min(35, parseFloat(((best_attempt.drawdown ?? thresholds?.max_drawdown_threshold ?? 30) + 5).toFixed(1)));
        return (
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
        );
      })()}
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
