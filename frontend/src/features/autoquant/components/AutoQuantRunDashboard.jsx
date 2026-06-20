import AutoQuantStageStepper from "../../../components/autoquant/AutoQuantStageStepper";
import AutoQuantLiveFitnessCurve from "../../../components/autoquant/AutoQuantLiveFitnessCurve";
import AutoQuantLogTerminal from "../../../components/autoquant/AutoQuantLogTerminal";
import AutoQuantFailureReport from "../../../components/autoquant/AutoQuantFailureReport";
import AutoQuantInterruptedReport from "../../../components/autoquant/AutoQuantInterruptedReport";
import AutoQuantWfoWindowsTable from "../../../components/autoquant/AutoQuantWfoWindowsTable";
import AutoQuantRobustnessBadge from "../../../components/autoquant/AutoQuantRobustnessBadge";
import AutoQuantTradeDistributionChart from "../../../components/autoquant/AutoQuantTradeDistributionChart";
import AutoQuantFinalReport from "../../../components/autoquant/AutoQuantFinalReport";
import { formatElapsed, getEstimatedTimeRemaining, getProgressPercent, getRunStatusFlags, getRunStatusLabel } from "../viewModel";

function StatusDot({ flags }) {
  const cls = flags.isRunning
    ? "bg-primary animate-pulse"
    : flags.isCompleted
      ? "bg-success"
      : flags.isFailed
        ? "bg-error"
        : flags.isInterrupted || flags.isCancelled
          ? "bg-warning"
          : "bg-base-content/30";

  return <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} />;
}

function DataHealingPanel({ dataHealingStatus, pairStatusMap }) {
  if (!dataHealingStatus) return null;

  return (
    <div className="mb-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider flex items-center gap-1.5">
          Pre-Flight Filtering
          {dataHealingStatus.in_progress && <span className="loading loading-spinner loading-xs text-primary" />}
        </span>
        <span className="text-[10px] text-base-content/50 font-mono">
          {dataHealingStatus.surviving_pairs != null
            ? `${dataHealingStatus.surviving_pairs}/${dataHealingStatus.total_pairs} pairs`
            : `${dataHealingStatus.total_pairs} pairs`}
        </span>
      </div>

      {Object.keys(pairStatusMap).length > 0 && (
        <div className="max-h-32 overflow-y-auto space-y-1">
          {Object.entries(pairStatusMap)
            .slice(-10)
            .map(([pair, status]) => (
              <div key={pair} className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-base-content/70">{pair}</span>
                <span
                  className={`font-medium ${
                    status.status === "downloading"
                      ? "text-primary animate-pulse"
                      : status.status === "healed"
                        ? "text-success"
                        : status.status === "evicted"
                          ? "text-error"
                          : "text-base-content/50"
                  }`}
                >
                  {status.status}
                  {status.reason && status.status === "evicted" && ` (${status.reason})`}
                </span>
              </div>
            ))}
        </div>
      )}

      {!dataHealingStatus.in_progress && dataHealingStatus.surviving_pairs != null && (
        <div className="mt-2 pt-2 border-t border-primary/10">
          <span className="text-[10px] text-success/80">
            Complete: {dataHealingStatus.surviving_pairs} pairs passed, {dataHealingStatus.evicted_pairs} evicted
          </span>
        </div>
      )}
    </div>
  );
}

export default function AutoQuantRunDashboard({
  form,
  pipelineState,
  runId,
  logLines,
  report,
  setReport,
  fitnessCurve,
  hyperoptProgress,
  elapsedSeconds,
  runStartedAtMs,
  wfoWindows,
  dataHealingStatus,
  pairStatusMap,
  logFilter,
  setLogFilter,
  loadReport,
  onCancel,
  onReset,
  onRetryRelaxed,
}) {
  const flags = getRunStatusFlags(pipelineState?.status);
  const progress = getProgressPercent(pipelineState);
  const estimatedTimeRemaining = getEstimatedTimeRemaining({
    elapsedSeconds,
    currentStage: pipelineState?.current_stage || 0,
    isRunning: flags.isRunning,
  });
  const stageNowMs = runStartedAtMs ? runStartedAtMs + elapsedSeconds * 1000 : null;
  const tradeDistribution =
    pipelineState?.stages?.[3]?.data?.trade_distribution || pipelineState?.stages?.[0]?.data?.trade_distribution;

  return (
    <div className="space-y-4">
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <div className="flex items-center gap-4">
            <StatusDot flags={flags} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold truncate">{pipelineState.strategy}</span>
                {pipelineState.timeframe && <span className="badge badge-xs badge-ghost font-mono">{pipelineState.timeframe}</span>}
                {pipelineState.exchange && <span className="badge badge-xs badge-ghost">{pipelineState.exchange}</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="text-xs text-base-content/50">{getRunStatusLabel(pipelineState, flags)}</span>
                {flags.isRunning && elapsedSeconds > 0 && (
                  <span className="text-sm font-bold text-primary font-mono bg-primary/10 px-2 py-0.5 rounded">
                    {formatElapsed(elapsedSeconds)}
                  </span>
                )}
                {flags.isRunning && estimatedTimeRemaining != null && estimatedTimeRemaining > 0 && (
                  <span className="text-xs text-base-content/60 font-mono">
                    {formatElapsed(estimatedTimeRemaining)} remaining
                  </span>
                )}
                {hyperoptProgress && flags.isRunning && (
                  <span className="text-xs text-primary/70 font-mono">
                    Epoch {hyperoptProgress.current}/{hyperoptProgress.total || "?"}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`text-lg font-bold shrink-0 ${
                flags.isCompleted
                  ? "text-success"
                  : flags.isFailed
                    ? "text-error"
                    : flags.isInterrupted || flags.isCancelled
                      ? "text-warning"
                      : "text-primary"
              }`}
            >
              {progress}%
            </span>
            <div className="flex gap-2 shrink-0">
              {flags.isRunning && (
                <button className="btn btn-error btn-sm gap-1.5" onClick={onCancel}>
                  Stop
                </button>
              )}
              {flags.isDone && (
                <button className="btn btn-outline btn-sm gap-1.5" onClick={onReset}>
                  New Run
                </button>
              )}
            </div>
          </div>
          <div className="mt-3">
            <progress
              className={`progress w-full h-1.5 ${
                flags.isCompleted
                  ? "progress-success"
                  : flags.isFailed
                    ? "progress-error"
                    : flags.isInterrupted || flags.isCancelled
                      ? "progress-warning"
                      : "progress-primary"
              }`}
              value={progress}
              max={100}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <div className="card bg-base-200 border border-base-300 h-full">
            <div className="card-body p-4">
              <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span>Pipeline Stages</span>
                {flags.isRunning && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
              </h3>
              <DataHealingPanel dataHealingStatus={dataHealingStatus} pairStatusMap={pairStatusMap} />
              <AutoQuantStageStepper stages={pipelineState.stages || []} nowMs={stageNowMs} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest flex items-center gap-2">
                  Live Fitness Curve
                  {fitnessCurve.length > 0 && (
                    <span className="text-primary/60 normal-case tracking-normal font-normal">
                      ({fitnessCurve.length} epochs)
                    </span>
                  )}
                </h3>
              </div>
              <AutoQuantLiveFitnessCurve data={fitnessCurve} hyperoptProgress={hyperoptProgress} />
            </div>
          </div>

          {tradeDistribution && (
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-4">
                <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest mb-3">
                  Trade Distribution
                </h3>
                <AutoQuantTradeDistributionChart tradeDistribution={tradeDistribution} />
              </div>
            </div>
          )}

          {fitnessCurve.length > 0 && (
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-4">
                <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest mb-3">
                  Top Candidates
                </h3>
                <div className="text-xs text-base-content/50 italic">CandidateLeaderboard component extracted to separate file</div>
              </div>
            </div>
          )}

          {pipelineState?.sensitivity && (
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-4">
                <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest mb-2">
                  Robustness Check
                </h3>
                <AutoQuantRobustnessBadge sensitivity={pipelineState.sensitivity} />
              </div>
            </div>
          )}

          {(pipelineState?.wfo_enabled || wfoWindows.length > 0) && (
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-4">
                <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest mb-3">
                  Walk-Forward Windows
                </h3>
                <AutoQuantWfoWindowsTable windows={wfoWindows} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest flex items-center gap-2">
              Live Output
              {flags.isRunning && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
            </h3>
            <span className="text-[10px] text-base-content/30">{logLines.length} lines</span>
          </div>
          <input
            type="text"
            className="input input-xs input-bordered w-full font-mono text-[11px] bg-base-300 border-base-content/15 placeholder:text-base-content/25 mb-2"
            placeholder="Filter log lines..."
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
          />
          <AutoQuantLogTerminal lines={logLines} filter={logFilter} />
        </div>
      </div>

      {flags.isFailed && <AutoQuantFailureReport state={pipelineState} onRetryRelaxed={onRetryRelaxed} />}
      {flags.isInterrupted && <AutoQuantInterruptedReport state={pipelineState} />}
      {flags.isCancelled && (
        <div className="alert alert-warning">
          <span className="text-sm">Pipeline was cancelled by user.</span>
        </div>
      )}

      {flags.isCompleted && report && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-5">
            <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest mb-4">
              Results &amp; Downloads
            </h3>
            <AutoQuantFinalReport report={report} runId={runId} strategy={pipelineState?.strategy || form.strategy} />
          </div>
        </div>
      )}

      {flags.isCompleted && !report && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body p-5 flex items-center gap-3">
            <span className="loading loading-spinner loading-sm" />
            <span className="text-sm text-base-content/60">Loading report...</span>
            <button
              className="btn btn-xs btn-ghost ml-auto"
              onClick={() =>
                loadReport(runId)
                  .then(setReport)
                  .catch((err) => console.error("Failed to load report:", err))
              }
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
