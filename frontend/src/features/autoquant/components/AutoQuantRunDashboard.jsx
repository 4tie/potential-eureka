import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ChartBarIcon,
  ClockIcon,
  CommandLineIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  StopCircleIcon,
} from "@heroicons/react/24/outline";
import AutoQuantStageStepper from "../../../components/autoquant/AutoQuantStageStepper";
import AutoQuantLiveFitnessCurve from "../../../components/autoquant/AutoQuantLiveFitnessCurve";
import AutoQuantLogTerminal from "../../../components/autoquant/AutoQuantLogTerminal";
import AutoQuantFailureReport from "../../../components/autoquant/AutoQuantFailureReport";
import AutoQuantInterruptedReport from "../../../components/autoquant/AutoQuantInterruptedReport";
import AutoQuantWfoWindowsTable from "../../../components/autoquant/AutoQuantWfoWindowsTable";
import AutoQuantRobustnessBadge from "../../../components/autoquant/AutoQuantRobustnessBadge";
import AutoQuantTradeDistributionChart from "../../../components/autoquant/AutoQuantTradeDistributionChart";
import AutoQuantFinalReport from "../../../components/autoquant/AutoQuantFinalReport";
import ProfessionalChartsTab from "../../../components/ProfessionalChartsTab";
import { formatElapsed, getEstimatedTimeRemaining, getProgressPercent, getRunStatusFlags, getRunStatusLabel } from "../viewModel";

function StatusDot({ flags }) {
  const cls = flags.isRunning
    ? "bg-primary animate-pulse neon-glow"
    : flags.isCompleted
      ? "bg-success neon-glow-green"
      : flags.isFailed
        ? "bg-error neon-glow-red"
        : flags.isAwaitingApproval
          ? "bg-warning animate-pulse neon-glow-orange"
        : flags.isInterrupted || flags.isCancelled
          ? "bg-warning neon-glow-orange"
          : "bg-base-content/30";

  return <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} />;
}

function PanelHeader({ title, eyebrow, icon: Icon, meta }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary/50" />}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/40">{eyebrow}</p>
          )}
          <h3 className="truncate text-xs font-semibold uppercase tracking-widest text-primary">{title}</h3>
        </div>
      </div>
      {meta}
    </div>
  );
}

function SummaryCell({ label, value, tone = "" }) {
  const toneClass = tone === "success" ? "text-success neon-glow-green" :
                     tone === "warning" ? "text-warning neon-glow-orange" :
                     tone === "error" ? "text-error neon-glow-red" :
                     tone === "primary" ? "text-primary neon-glow" :
                     "text-base-content";
  
  return (
    <div className="rounded-lg border border-primary/30 bg-base-200/50 px-3 py-2 transition-all duration-300 hover:scale-105 hover:border-primary/50">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-primary/50">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function pairKey(pair) {
  if (typeof pair === "string") return pair;
  return pair?.key || pair?.pair || "";
}

function formatRatioPct(value) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${(num * 100).toFixed(2)}%`;
}

function formatMaybeNumber(value, digits = 2) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : "-";
}

function firstNonEmptyArray(...values) {
  return values.find((value) => Array.isArray(value) && value.length > 0) || [];
}

function TopCandidates({ data }) {
  const rows = useMemo(() => {
    return [...(data || [])]
      .filter((point) => point && Number.isFinite(Number(point.profit_usdt)))
      .sort((a, b) => Number(b.profit_usdt) - Number(a.profit_usdt))
      .slice(0, 5);
  }, [data]);

  if (!rows.length) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-primary/30 bg-base-200/50 neon-glow">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-primary/50">
            <th>Rank</th>
            <th className="text-right">Epoch</th>
            <th className="text-right">Profit</th>
            <th className="text-right">Objective</th>
            <th className="text-right">Trades</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((point, index) => (
            <tr key={`${point.epoch}-${index}`} className="text-xs transition-all duration-300 hover:bg-primary/20">
              <td className="font-mono text-primary/40">{index + 1}</td>
              <td className="text-right font-mono text-primary">{point.epoch ?? "-"}</td>
              <td className={`text-right font-mono font-bold ${point.profit_usdt >= 0 ? "text-success neon-glow-green" : "text-error neon-glow-red"}`}>
                {point.profit_usdt >= 0 ? "+" : ""}
                {Number(point.profit_usdt).toFixed(4)} USDT
              </td>
              <td className="text-right font-mono text-base-content/60">
                {point.objective != null ? Number(point.objective).toFixed(4) : "-"}
              </td>
              <td className="text-right font-mono text-base-content/60">{point.trades ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getApprovalReview(pipelineState) {
  if (pipelineState?.status !== "awaiting_user_approval") return null;

  const stage =
    (pipelineState.stages || []).find((item) => item.index === pipelineState.current_stage) ||
    (pipelineState.stages || [])[0] ||
    null;
  const data = stage?.data || {};
  const rows = firstNonEmptyArray(data.all_pairs, data.per_pair, pipelineState.selected_pairs);
  const recommended = firstNonEmptyArray(
    data.pre_selected,
    data.passing_pairs,
    data.current_pairs,
    pipelineState.user_approved_pairs,
    (pipelineState.selected_pairs || []).map(pairKey).filter(Boolean)
  );
  const isPortfolioReview =
    pipelineState.current_stage === 2 ||
    data.type === "portfolio_baseline_review" ||
    data.portfolio_summary ||
    data.portfolio_profit != null;

  return {
    stage,
    data,
    rows: rows.filter((row) => pairKey(row)),
    recommended: recommended.map(pairKey).filter(Boolean),
    isPortfolioReview,
  };
}

function ApprovalReviewPanel({ pipelineState, onResume }) {
  const review = useMemo(() => getApprovalReview(pipelineState), [pipelineState]);
  const [selectedPairs, setSelectedPairs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectionSeedRef = useRef("");

  const recommendedKey = (review?.recommended || []).join("|");
  const selectionSeed = `${review?.stage?.index || ""}|${recommendedKey}`;
  useEffect(() => {
    if (!review) return;
    if (selectionSeedRef.current === selectionSeed) return;
    selectionSeedRef.current = selectionSeed;
    setSelectedPairs(review.recommended);
    setError("");
  }, [review, selectionSeed]);

  if (!review) return null;

  const { data, rows, recommended, isPortfolioReview } = review;
  const selectedSet = new Set(selectedPairs);
  const sortedRows = [...rows].sort((a, b) => {
    const aRecommended = recommended.includes(pairKey(a)) ? 1 : 0;
    const bRecommended = recommended.includes(pairKey(b)) ? 1 : 0;
    if (aRecommended !== bRecommended) return bRecommended - aRecommended;
    return Number(b.profit_factor || b.profit_total || 0) - Number(a.profit_factor || a.profit_total || 0);
  });

  const togglePair = (pair) => {
    setSelectedPairs((prev) =>
      prev.includes(pair) ? prev.filter((item) => item !== pair) : [...prev, pair]
    );
  };

  const handleResume = async () => {
    if (!selectedPairs.length || !onResume) return;
    setBusy(true);
    setError("");
    try {
      await onResume(selectedPairs);
    } catch (err) {
      setError(err.message || "Failed to resume pipeline.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card bg-warning/8 border border-warning/30">
      <div className="card-body p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-warning/20 text-warning flex items-center justify-center font-bold shrink-0">
            !
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-warning">
              {isPortfolioReview ? "Portfolio Review Required" : "Pair Selection Review Required"}
            </h3>
            <p className="text-xs text-base-content/60 mt-1">
              AutoQuant paused after producing review data. Select the pairs to approve, then continue the run.
            </p>
          </div>
          <span className="badge badge-warning badge-sm shrink-0">paused</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg bg-base-200/70 border border-base-300 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-base-content/45">Tested</div>
            <div className="font-mono text-sm font-bold">{data.total_tested ?? rows.length}</div>
          </div>
          <div className="rounded-lg bg-base-200/70 border border-base-300 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-base-content/45">Recommended</div>
            <div className="font-mono text-sm font-bold text-warning">{recommended.length}</div>
          </div>
          <div className="rounded-lg bg-base-200/70 border border-base-300 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-base-content/45">
              {isPortfolioReview ? "Portfolio Profit" : "Total Profit"}
            </div>
            <div className="font-mono text-sm font-bold">
              {isPortfolioReview
                ? `${formatMaybeNumber(data.portfolio_profit, 2)} USDT`
                : formatRatioPct(data.profit_total)}
            </div>
          </div>
          <div className="rounded-lg bg-base-200/70 border border-base-300 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-base-content/45">
              {isPortfolioReview ? "Portfolio Trades" : "Total Trades"}
            </div>
            <div className="font-mono text-sm font-bold">{data.portfolio_trades ?? data.total_trades ?? "-"}</div>
          </div>
        </div>

        {data.validation_notes?.length > 0 && (
          <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-warning/80 mb-1">Validation Notes</p>
            <ul className="space-y-1">
              {data.validation_notes.map((note, index) => (
                <li key={index} className="text-xs text-base-content/70">{note}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" className="btn btn-xs btn-outline" onClick={() => setSelectedPairs(recommended)}>
            Recommended
          </button>
          <button type="button" className="btn btn-xs btn-outline" onClick={() => setSelectedPairs(rows.map(pairKey).filter(Boolean))}>
            All
          </button>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setSelectedPairs([])}>
            Clear
          </button>
          <span className="text-[10px] text-base-content/45 ml-auto">
            {selectedPairs.length} selected
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-base-300 bg-base-100">
          <table className="table table-xs">
            <thead>
              <tr className="text-[10px] text-base-content/45 uppercase">
                <th>Use</th>
                <th>Pair</th>
                <th className="text-right">Profit</th>
                <th className="text-right">PF</th>
                <th className="text-right">Trades</th>
                <th className="text-right">Win</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const key = pairKey(row);
                const selected = selectedSet.has(key);
                const isRecommended = recommended.includes(key);
                return (
                  <tr key={key} className={selected ? "bg-warning/5" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-warning"
                        checked={selected}
                        onChange={() => togglePair(key)}
                      />
                    </td>
                    <td className="font-mono">
                      {key}
                      {isRecommended && <span className="badge badge-xs badge-warning ml-2">suggested</span>}
                    </td>
                    <td className={`text-right font-mono ${Number(row.profit_total) >= 0 ? "text-success" : "text-error"}`}>
                      {formatRatioPct(row.profit_total)}
                    </td>
                    <td className="text-right font-mono">{formatMaybeNumber(row.profit_factor, 2)}</td>
                    <td className="text-right font-mono">{row.trades ?? row.trade_count ?? "-"}</td>
                    <td className="text-right font-mono">
                      {row.win_rate != null ? `${formatMaybeNumber(row.win_rate, 1)}%` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <div className="alert alert-error py-2 text-xs">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-warning btn-sm"
            disabled={busy || selectedPairs.length === 0}
            onClick={handleResume}
          >
            {busy ? <span className="loading loading-spinner loading-xs" /> : null}
            Approve {selectedPairs.length} Pair{selectedPairs.length === 1 ? "" : "s"} & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function DataHealingPanel({ dataHealingStatus, pairStatusMap }) {
  if (!dataHealingStatus) return null;

  return (
    <div className="mb-3 p-3 bg-primary/5 border border-primary/30 rounded-lg neon-glow scan-effect">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider flex items-center gap-1.5">
          Pre-Flight Filtering
          {dataHealingStatus.in_progress && <span className="loading loading-spinner loading-xs text-primary" />}
        </span>
        <span className="text-[10px] text-primary/50 font-mono">
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
                <span className="font-mono text-primary/70">{pair}</span>
                <span
                  className={`font-medium ${
                    status.status === "downloading"
                      ? "text-primary animate-pulse neon-glow"
                      : status.status === "healed"
                        ? "text-success neon-glow-green"
                        : status.status === "evicted"
                          ? "text-error neon-glow-red"
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
  onResume,
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
      <div className="card bg-base-200/50 border border-primary/30 neon-glow scan-effect">
        <div className="card-body p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <StatusDot flags={flags} />
              <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold truncate text-primary crt-flicker">{pipelineState.strategy}</span>
                {pipelineState.timeframe && <span className="badge badge-xs badge-ghost font-mono border-primary/30 text-primary">{pipelineState.timeframe}</span>}
                {pipelineState.exchange && <span className="badge badge-xs badge-ghost border-primary/30 text-primary">{pipelineState.exchange}</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="text-xs text-base-content/50">{getRunStatusLabel(pipelineState, flags)}</span>
                {flags.isRunning && elapsedSeconds > 0 && (
                  <span className="text-sm font-bold text-primary font-mono bg-primary/10 px-2 py-0.5 rounded neon-glow">
                    {formatElapsed(elapsedSeconds)}
                  </span>
                )}
                {flags.isRunning && estimatedTimeRemaining != null && estimatedTimeRemaining > 0 && (
                  <span className="text-xs text-primary/60 font-mono">
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
            </div>
            <div className="grid grid-cols-3 gap-2 xl:w-[28rem]">
              <SummaryCell label="Progress" value={`${progress}%`} tone={flags.isFailed ? "error" : flags.isCompleted ? "success" : "primary"} />
              <SummaryCell label="Stage" value={`${pipelineState.current_stage || 0}/7`} />
              <SummaryCell
                label="Status"
                value={pipelineState.status || "starting"}
                tone={flags.isAwaitingApproval ? "warning" : flags.isFailed ? "error" : flags.isCompleted ? "success" : ""}
              />
            </div>
            <div className="flex gap-2 shrink-0">
              {(flags.isRunning || flags.isAwaitingApproval) && (
                <button className="btn btn-error btn-sm gap-1.5 neon-glow-red hover:shadow-lg hover:shadow-error/25 transition-all duration-300" onClick={onCancel}>
                  <StopCircleIcon className="h-4 w-4" />
                  Stop
                </button>
              )}
              {flags.isDone && (
                <button className="btn btn-outline btn-sm gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all duration-300" onClick={onReset}>
                  <ArrowPathIcon className="h-4 w-4" />
                  New Run
                </button>
              )}
            </div>
          </div>
          <div className="mt-3">
            <progress
              className={`progress w-full h-1.5 ${
                flags.isCompleted
                  ? "progress-success neon-glow-green"
                  : flags.isFailed
                    ? "progress-error neon-glow-red"
                    : flags.isAwaitingApproval || flags.isInterrupted || flags.isCancelled
                      ? "progress-warning neon-glow-orange"
                      : "progress-primary neon-glow"
              }`}
              value={progress}
              max="100"
            />
          </div>
        </div>
      </div>

      <ApprovalReviewPanel pipelineState={pipelineState} onResume={onResume} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <div className="card bg-base-200/50 border border-primary/30 h-full neon-glow">
            <div className="card-body p-4">
              <PanelHeader
                title="Pipeline Stages"
                eyebrow="Validation path"
                icon={flags.isAwaitingApproval ? PauseCircleIcon : flags.isRunning ? PlayCircleIcon : ClockIcon}
                meta={flags.isRunning && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
              />
              <DataHealingPanel dataHealingStatus={dataHealingStatus} pairStatusMap={pairStatusMap} />
              <AutoQuantStageStepper stages={pipelineState.stages || []} nowMs={stageNowMs} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="card bg-base-200/50 border border-primary/30 neon-glow">
            <div className="card-body p-4">
              <PanelHeader
                title="Live Fitness Curve"
                eyebrow="Hyperopt telemetry"
                icon={ChartBarIcon}
                meta={
                  fitnessCurve.length > 0 && (
                    <span className="text-[10px] text-primary/65">{fitnessCurve.length} epochs</span>
                  )
                }
              />
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
                <PanelHeader title="Top Candidates" eyebrow="Best live epochs" icon={ChartBarIcon} />
                <TopCandidates data={fitnessCurve} />
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

          {flags.isCompleted && runId && (
            <div className="card bg-base-200 border border-base-300">
              <div className="card-body p-4">
                <h3 className="text-[10px] font-semibold text-base-content/50 uppercase tracking-widest mb-3">
                  Professional Charts
                </h3>
                <ProfessionalChartsTab runId={runId} runType="autoquant" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-4">
          <PanelHeader
            title="Live Output"
            eyebrow="Event stream"
            icon={CommandLineIcon}
            meta={
              <div className="flex items-center gap-2">
                {flags.isRunning && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                {flags.isAwaitingApproval && <span className="badge badge-xs badge-warning">review paused</span>}
                <span className="text-[10px] text-base-content/30">{logLines.length} lines</span>
              </div>
            }
          />
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
