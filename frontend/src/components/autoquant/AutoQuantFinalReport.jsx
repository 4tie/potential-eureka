import { CheckCircleIcon, DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { API_BASE } from "../../features/autoquant/constants";
import AutoQuantMetricCard from "./AutoQuantMetricCard";
import AutoQuantRiskChecks from "./AutoQuantRiskChecks";
import AutoQuantSignalStrengthViz from "./AutoQuantSignalStrengthViz";
import AutoQuantMonteCarloBadge from "./AutoQuantMonteCarloBadge";
import AutoQuantRobustnessBadge from "./AutoQuantRobustnessBadge";
import AutoQuantEquityCurveChart from "./AutoQuantEquityCurveChart";
import AutoQuantPerPairProfitChart from "./AutoQuantPerPairProfitChart";

export default function AutoQuantFinalReport({ report, runId }) {
  const risk = report?.risk || {};
  const oos = report?.oos_validation || {};
  const sanity = report?.sanity_backtest || {};
  const stressTest = report?.stress_test || {};
  const files = report?.files || {};
  const thresholds = report?.thresholds || {};
  const monteCarlo = report?.monte_carlo ?? risk?.monte_carlo ?? null;
  const equityCurveOos = report?.equity_curves?.oos ?? null;
  const ensembleWeights = report?.ensemble_weights ?? null;
  const sensitivity = report?.sensitivity ?? null;
  const isEnsemble = report?.ensemble_enabled === true || (ensembleWeights && Object.keys(ensembleWeights).length > 0);

  // Use dynamic thresholds from the report; fall back to defaults
  const maxDrawdownThreshold = thresholds.max_drawdown ?? 30;
  const minWinRateThreshold = thresholds.min_win_rate ?? 40;
  const minProfitFactorThreshold = thresholds.min_profit_factor ?? 1.0;
  const minSharpeThreshold = thresholds.min_sharpe ?? 0.5;
  const minOosProfitThreshold = thresholds.min_oos_profit ?? 0;
  const mcThreshold = thresholds.monte_carlo_threshold ?? 0.35;

  const downloadFile = (filename) => {
    const url = `${API_BASE}/api/auto-quant/download/${runId}/${filename}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadHtmlReport = () => {
    const url = `${API_BASE}/api/auto-quant/report/${runId}/html`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${runId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success text-lg">
          <CheckCircleIcon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Pipeline Complete</h3>
          <p className="text-xs text-base-content/50">
            Optimized strategy ready for download
          </p>
        </div>
      </div>

      {/* Active thresholds badge */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] text-base-content/50 uppercase tracking-wider font-medium self-center mr-1">Active thresholds:</span>
        <span className="badge badge-xs badge-outline">DD &lt; {maxDrawdownThreshold}%</span>
        <span className="badge badge-xs badge-outline">Win &gt;= {minWinRateThreshold}%</span>
        <span className="badge badge-xs badge-outline">PF &gt;= {minProfitFactorThreshold}</span>
        <span className="badge badge-xs badge-outline">Sharpe &gt;= {minSharpeThreshold}</span>
        <span className="badge badge-xs badge-outline">OOS &gt;= {minOosProfitThreshold}</span>
        <span className="badge badge-xs badge-outline">MC p95 &lt; {(mcThreshold * 100).toFixed(1)}%</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AutoQuantMetricCard
          label="In-Sample Profit"
          value={sanity.profit_total_abs != null ? sanity.profit_total_abs.toFixed(2) : null}
          unit=" USDT"
        />
        <AutoQuantMetricCard
          label="OOS Profit"
          value={oos.profit_total != null ? (oos.profit_total * 100).toFixed(2) : null}
          unit="%"
          good={oos.profit_total != null ? oos.profit_total >= minOosProfitThreshold : null}
          threshold={`>= ${minOosProfitThreshold}%`}
        />
        <AutoQuantMetricCard
          label="Max Drawdown"
          value={risk.max_drawdown_pct != null ? risk.max_drawdown_pct.toFixed(1) : null}
          unit="%"
          good={risk.max_drawdown_pct != null ? risk.max_drawdown_pct < maxDrawdownThreshold : null}
          threshold={`< ${maxDrawdownThreshold}%`}
        />
        <AutoQuantMetricCard
          label="Win Rate"
          value={risk.win_rate_pct != null ? risk.win_rate_pct.toFixed(1) : null}
          unit="%"
          good={risk.win_rate_pct != null ? risk.win_rate_pct >= minWinRateThreshold : null}
          threshold={`>= ${minWinRateThreshold}%`}
        />
      </div>

      {sensitivity && (
        <div>
          <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">
            Robustness Check
          </h4>
          <AutoQuantRobustnessBadge sensitivity={sensitivity} />
        </div>
      )}

      {risk.checks && (
        <div>
          <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">
            Risk Checks
          </h4>
          <AutoQuantRiskChecks checks={risk.checks} />
        </div>
      )}

      {isEnsemble && ensembleWeights && Object.keys(ensembleWeights).length > 0 && (
        <div className="rounded-xl bg-secondary/8 border border-secondary/20 px-4 py-4">
          <AutoQuantSignalStrengthViz weights={ensembleWeights} />
        </div>
      )}

      {monteCarlo && (
        <div>
          <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">
            Monte Carlo Stress Test
          </h4>
          <AutoQuantMonteCarloBadge mc={monteCarlo} threshold={mcThreshold} />
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2">
          Equity Curve (OOS)
        </h4>
        <AutoQuantEquityCurveChart data={equityCurveOos} mcFan={monteCarlo?.equity_fan ?? null} />
      </div>

      {(stressTest.winning_pairs?.length > 0 || stressTest.failing_pairs?.length > 0 || stressTest.per_pair?.length > 0) && (
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            Stress Test Results
          </h4>

          {stressTest.per_pair?.length > 0 && (
            <AutoQuantPerPairProfitChart perPair={stressTest.per_pair} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-success mb-2">
                Winning Pairs ({stressTest.winning_pairs?.length ?? 0})
              </h4>
              <div className="flex flex-wrap gap-1">
                {(stressTest.winning_pairs || []).map((p) => (
                  <span key={p.key || p} className="badge badge-xs badge-success badge-outline gap-1">
                    <CheckCircleIcon className="h-3 w-3" />
                    {p.key || p}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-error mb-2">
                Filtered Pairs ({stressTest.failing_pairs?.length ?? 0})
              </h4>
              <div className="flex flex-wrap gap-1">
                {(stressTest.failing_pairs || []).map((p) => (
                  <span key={p} className="badge badge-xs badge-error badge-outline">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trading Window Filters */}
      {report?.excluded_time_windows && (
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            Trading Window Filters
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold text-warning mb-2">
                Blocked Hours
              </h4>
              <div className="flex flex-wrap gap-1">
                {report.excluded_time_windows.excluded_hours?.length > 0 ? (
                  report.excluded_time_windows.excluded_hours.map((h) => (
                    <span key={h} className="badge badge-xs badge-warning badge-outline">
                      {h}:00 UTC
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-base-content/40 italic">No hours blocked</span>
                )}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-warning mb-2">
                Blocked Days
              </h4>
              <div className="flex flex-wrap gap-1">
                {report.excluded_time_windows.excluded_days?.length > 0 ? (
                  report.excluded_time_windows.excluded_days.map((d) => {
                    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    return (
                      <span key={d} className="badge badge-xs badge-warning badge-outline">
                        {dayNames[d]}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[10px] text-base-content/40 italic">No days blocked</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Metrics */}
      {report?.ai_metrics && Object.keys(report.ai_metrics).length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
            AI Performance Metrics
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-base-300/30 border border-base-300 rounded-lg px-3 py-2">
              <div className="text-[10px] text-base-content/50 uppercase tracking-wider">Total Calls</div>
              <div className="text-lg font-mono font-semibold text-base-content">
                {report.ai_metrics.total_calls ?? 0}
              </div>
            </div>
            <div className="bg-base-300/30 border border-base-300 rounded-lg px-3 py-2">
              <div className="text-[10px] text-base-content/50 uppercase tracking-wider">JSON Success Rate</div>
              <div className="text-lg font-mono font-semibold text-base-content">
                {report.ai_metrics.total_calls > 0
                  ? ((report.ai_metrics.json_parse_success ?? 0) / report.ai_metrics.total_calls * 100).toFixed(1)
                  : "0.0"}%
              </div>
            </div>
            <div className="bg-base-300/30 border border-base-300 rounded-lg px-3 py-2">
              <div className="text-[10px] text-base-content/50 uppercase tracking-wider">Timeout Count</div>
              <div className="text-lg font-mono font-semibold text-base-content">
                {report.ai_metrics.timeout_count ?? 0}
              </div>
            </div>
            <div className="bg-base-300/30 border border-base-300 rounded-lg px-3 py-2">
              <div className="text-[10px] text-base-content/50 uppercase tracking-wider">Suggestions Applied</div>
              <div className="text-lg font-mono font-semibold text-base-content">
                {report.ai_metrics.suggestion_applied_count ?? 0}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        {files.optimized_strategy && (
          <button
            className="btn btn-primary btn-sm gap-2"
            onClick={() => downloadFile(files.optimized_strategy)}
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            Download Optimized Strategy (.py)
          </button>
        )}
        {files.config && (
          <button
            className="btn btn-outline btn-sm gap-2"
            onClick={() => downloadFile(files.config)}
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            Download Config (.json)
          </button>
        )}
        <button
          className="btn btn-outline btn-sm gap-2"
          onClick={downloadHtmlReport}
        >
          <DocumentArrowDownIcon className="h-4 w-4" />
          Download Report (.html)
        </button>
      </div>
    </div>
  );
}
