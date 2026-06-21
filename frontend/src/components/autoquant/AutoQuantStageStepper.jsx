import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { STAGE_ICONS } from "../../features/autoquant/constants";
import { fmtMmSs } from "../../features/autoquant/utils";

function StageStatusIcon({ status, stageNumber }) {
  if (status === "running") {
    return <span className="loading loading-spinner loading-xs text-primary" aria-label="Running" />;
  }
  if (status === "passed") {
    return <CheckCircleIcon className="h-4 w-4 text-success" aria-label="Passed" />;
  }
  if (status === "failed") {
    return <XCircleIcon className="h-4 w-4 text-error" aria-label="Failed" />;
  }
  if (status === "warning") {
    return <ExclamationTriangleIcon className="h-4 w-4 text-warning" aria-label="Warning" />;
  }
  return (
    <span className="font-mono text-[10px] font-semibold text-base-content/40" aria-label={`Stage ${stageNumber}`}>
      {stageNumber}
    </span>
  );
}

export default function AutoQuantStageStepper({ stages, nowMs }) {
  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((stage, i) => {
        const stageNumber = STAGE_ICONS[i] || String(stage.index ?? i + 1).padStart(2, "0");
        let stageElapsed = null;
        if (nowMs && stage.status === "running" && stage.started_at) {
          const secs = Math.floor((nowMs - new Date(stage.started_at).getTime()) / 1000);
          stageElapsed = fmtMmSs(Math.max(0, secs));
        }
        return (
          <div key={stage.index}>
            <div
              className={`flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${
                stage.status === "running"
                  ? "bg-primary/15 border border-primary/30 shadow-sm shadow-primary/10"
                  : stage.status === "passed"
                  ? "bg-success/8 border border-success/20"
                  : stage.status === "failed"
                  ? "bg-error/10 border border-error/25"
                  : "border border-base-300/40 opacity-60"
              }`}
            >
              <div className="flex flex-col items-center shrink-0 gap-0.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors ${
                  stage.status === "running"
                    ? "bg-primary/20"
                    : stage.status === "passed"
                    ? "bg-success/15"
                    : stage.status === "failed"
                    ? "bg-error/15"
                    : stage.status === "warning"
                    ? "bg-warning/15"
                    : "bg-base-300/50"
                }`}>
                  <StageStatusIcon status={stage.status} stageNumber={stageNumber} />
                </div>
                {i < stages.length - 1 && (
                  <div className={`w-px h-2 mt-0.5 rounded-full transition-colors ${
                    stage.status === "passed" ? "bg-success/40" : "bg-base-300/40"
                  }`} />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${
                    stage.status === "running" ? "text-primary" :
                    stage.status === "passed" ? "text-success/90" :
                    stage.status === "failed" ? "text-error" :
                    stage.status === "warning" ? "text-warning" :
                    "text-base-content/40"
                  }`}>
                    <span className="font-mono text-[10px] uppercase tracking-wider opacity-70">S{stageNumber}</span>{" "}
                    {stage.name}
                  </span>
                  {stage.status === "running" && stageElapsed && (
                    <span className="text-[10px] font-mono text-primary/70 tabular-nums">{stageElapsed}</span>
                  )}
                  {stage.status === "running" && (
                    <span className="badge badge-xs badge-primary animate-pulse">live</span>
                  )}
                  {stage.status === "passed" && stage.duration_s != null && (
                    <span className="text-[10px] font-mono text-base-content/35 tabular-nums">{stage.duration_s}s</span>
                  )}
                </div>
                {stage.message && stage.status === "passed" && (
                  <p className="text-[10px] text-base-content/50 mt-0.5 leading-relaxed truncate">
                    {stage.message}
                  </p>
                )}
                {stage.status === "passed" && stage.data && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {stage.data.profit_total_abs != null && (
                      <span className={`text-[9px] font-mono ${stage.data.profit_total_abs >= 0 ? "text-success/70" : "text-error/70"}`}>
                        P: {stage.data.profit_total_abs >= 0 ? "+" : ""}{stage.data.profit_total_abs.toFixed(3)}
                      </span>
                    )}
                    {stage.data.max_drawdown_account != null && (
                      <span className="text-[9px] font-mono text-base-content/50">
                        DD: {(stage.data.max_drawdown_account * 100).toFixed(1)}%
                      </span>
                    )}
                    {stage.data.trade_count != null && (
                      <span className="text-[9px] font-mono text-base-content/50">
                        T: {stage.data.trade_count}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {stage.status === "failed" && stage.message && (
              <details className="mt-1 ml-10">
                <summary className="text-[10px] text-error/70 cursor-pointer select-none hover:text-error transition-colors">
                  Error details
                </summary>
                <pre className="mt-1 text-[10px] text-error/80 bg-error/5 border border-error/15 rounded-lg p-2 whitespace-pre-wrap break-words leading-relaxed">
                  {stage.message}
                </pre>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
