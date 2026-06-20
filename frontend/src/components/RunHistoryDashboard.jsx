import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import RunDetailPanel from "./RunDetailPanel";
import api from "../services/api";

const API_BASE = "";

function statusBadgeClass(status) {
  switch (status) {
    case "completed":   return "badge-success";
    case "failed":      return "badge-error";
    case "cancelled":   return "badge-warning";
    case "interrupted": return "badge-warning";
    case "awaiting_user_approval": return "badge-warning";
    case "running":     return "badge-primary";
    case "pending":     return "badge-ghost";
    default:            return "badge-ghost";
  }
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtPct(val) {
  if (val == null) return "—";
  return `${(val * 100).toFixed(2)}%`;
}

function fmtAbs(val) {
  if (val == null) return "—";
  return `${val.toFixed(2)} USDT`;
}

function fmtDD(val) {
  if (val == null) return "—";
  return `${val.toFixed(1)}%`;
}

function MonteCarloBadge({ mc }) {
  if (!mc) return null;
  const p95Pct = (mc.p95_drawdown * 100).toFixed(1);
  const medPct = (mc.median_final_return * 100).toFixed(1);
  const passed = mc.passed;
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs ${
      passed
        ? "border-success/30 bg-success/5"
        : "border-error/30 bg-error/10"
    }`}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-base-content/50 font-medium">
          Monte Carlo (1 000 shuffles)
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-bold text-sm ${passed ? "text-success" : "text-error"}`}>
            p95 DD: {p95Pct}%
          </span>
          <span className="text-base-content/50">·</span>
          <span className="text-base-content/70">Median return: {medPct}%</span>
        </div>
      </div>
      <span className={`badge badge-sm ml-auto shrink-0 ${passed ? "badge-success" : "badge-error"}`}>
        {passed ? "Passed" : "Failed"}
      </span>
    </div>
  );
}

function EntryLogicChips({ bestParams }) {
  if (!bestParams) return <span className="text-[11px] text-base-content/40 italic">No hyperopt data</span>;

  const paramsDict = bestParams.params_dict || {};
  const entryKeys = Object.entries(paramsDict).filter(
    ([k]) => !["stoploss", "minimal_roi", "trailing_stop",
               "trailing_stop_positive", "trailing_stop_positive_offset",
               "trailing_only_offset_is_reached"].includes(k)
  );

  if (entryKeys.length === 0) {
    const allKeys = Object.entries(paramsDict);
    if (allKeys.length === 0) return <span className="text-[11px] text-base-content/40 italic">No parameters recorded</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {allKeys.map(([k, v]) => (
          <span key={k} className="badge badge-xs badge-outline font-mono">
            {k}: {typeof v === "number" ? v.toFixed(4) : String(v)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entryKeys.map(([k, v]) => (
        <span key={k} className="badge badge-xs badge-outline font-mono">
          {k}: {typeof v === "number" ? v.toFixed(4) : String(v)}
        </span>
      ))}
    </div>
  );
}

function RunCard({ run, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = run.status === "running" || run.status === "pending";
  const isCompleted = run.status === "completed";
  const isInterrupted = run.status === "interrupted";
  const isAwaitingApproval = run.status === "awaiting_user_approval";

  const report = run.report || {};
  const risk = report.risk || {};
  const oos = report.oos_validation || {};
  const sanity = report.sanity_backtest || {};
  const files = report.files || {};
  const bestParams = report.best_params || null;

  const downloadFile = (filename) => {
    const url = `${API_BASE}/api/auto-quant/download/${run.run_id}/${filename}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCardClick = () => {
    onSelect(run);
  };

  return (
    <div className="border border-base-300 rounded-xl bg-base-100 overflow-hidden transition-colors hover:border-base-content/20">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold truncate">{run.strategy || "—"}</span>
            <span className={`badge badge-xs ${statusBadgeClass(run.status)}`}>
              {run.status}
            </span>
            {isRunning && (
              <span className="loading loading-spinner loading-xs text-primary" />
            )}
            {isCompleted && (
              <>
                {oos.profit_total != null && (
                  <span className={`text-[10px] font-semibold ${oos.profit_total >= 0 ? "text-success" : "text-error"}`}>
                    OOS {fmtPct(oos.profit_total)}
                  </span>
                )}
                {risk.max_drawdown_pct != null && (
                  <span className={`text-[10px] font-semibold ${risk.max_drawdown_pct < 30 ? "text-success" : "text-error"}`}>
                    DD {fmtDD(risk.max_drawdown_pct)}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-base-content/50 flex-wrap">
            <span className="font-mono">{run.run_id?.slice(0, 8) || "—"}</span>
            <span>{run.timeframe} · {run.exchange}</span>
            <span>{formatDate(run.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            className="btn btn-ghost btn-xs text-xs text-base-content/50 hover:text-primary"
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
          >
            {isAwaitingApproval ? "Review →" : isCompleted ? "View →" : isRunning ? "Reconnect →" : isInterrupted ? "Details →" : "View →"}
          </button>
          <span className="text-base-content/30 text-xs select-none">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-base-300 px-4 py-4 bg-base-200/40 space-y-4">
          {/* Entry logic */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-base-content/50 font-medium mb-1.5">
              Hyperopt Best Parameters
            </p>
            <EntryLogicChips bestParams={bestParams} />
          </div>

          {/* Metrics */}
          {isCompleted && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-base-200 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-base-content/50 mb-1">IS Profit</p>
                <p className="text-sm font-bold">
                  {sanity.profit_total_abs != null ? fmtAbs(sanity.profit_total_abs) : "—"}
                </p>
              </div>
              <div className="bg-base-200 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-base-content/50 mb-1">OOS Profit</p>
                <p className={`text-sm font-bold ${
                  oos.profit_total != null
                    ? oos.profit_total >= 0 ? "text-success" : "text-error"
                    : ""
                }`}>
                  {oos.profit_total != null ? fmtPct(oos.profit_total) : "—"}
                </p>
              </div>
              <div className="bg-base-200 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-base-content/50 mb-1">Max Drawdown</p>
                <p className={`text-sm font-bold ${
                  risk.max_drawdown_pct != null
                    ? risk.max_drawdown_pct < 30 ? "text-success" : "text-error"
                    : ""
                }`}>
                  {risk.max_drawdown_pct != null ? fmtDD(risk.max_drawdown_pct) : "—"}
                </p>
              </div>
            </div>
          )}

          {/* Monte Carlo badge */}
          {isCompleted && report.monte_carlo && (
            <MonteCarloBadge mc={report.monte_carlo} />
          )}

          {/* Failed run summary */}
          {run.status === "failed" && run.error && (
            <div className="text-xs text-error bg-error/10 rounded-lg px-3 py-2">
              {run.error}
            </div>
          )}

          {/* Interrupted run notice */}
          {isInterrupted && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
                ⚠ Pipeline was interrupted (backend restarted)
              </p>
              {run.current_stage > 0 && (
                <p className="text-[11px] text-warning/70">
                  Stopped at stage {run.current_stage} of 7
                </p>
              )}
              <p className="text-[11px] text-base-content/50">
                The server restarted while this run was in progress. Start a new run to try again.
              </p>
            </div>
          )}

          {/* Download buttons */}
          {isCompleted && (
            <div className="flex gap-2 flex-wrap pt-1">
              {files.optimized_strategy && (
                <button
                  className="btn btn-primary btn-xs gap-1.5"
                  onClick={() => downloadFile(files.optimized_strategy)}
                >
                  ⬇ Strategy (.py)
                </button>
              )}
              {files.config && (
                <button
                  className="btn btn-outline btn-xs gap-1.5"
                  onClick={() => downloadFile(files.config)}
                >
                  ⬇ Config (.json)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const RunHistoryDashboard = forwardRef(function RunHistoryDashboard({ onLoad } = {}, ref) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState(null);

  const refresh = useCallback(() => {
    api.autoquant.listRuns()
      .then((data) => {
        const sorted = [...(data.runs || [])].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        setRuns(sorted);
      })
      .catch((err) => {
        console.debug("Failed to load AutoQuant run history:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-base-content/50 py-2">
        <span className="loading loading-spinner loading-xs" />
        Loading runs...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="text-xs text-base-content/40 italic py-1">No previous runs found.</p>
    );
  }

  return (
    <>
      {selectedRun && (
        <RunDetailPanel
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
          API_BASE={API_BASE}
        />
      )}
      <div className="flex flex-col gap-2">
        {runs.map((run) => (
          <RunCard
            key={run.run_id}
            run={run}
            onSelect={onLoad || setSelectedRun}
          />
        ))}
      </div>
    </>
  );
});

export default RunHistoryDashboard;
