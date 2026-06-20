import { useCallback, useEffect, useRef } from "react";
import { STAGE_NAMES } from "../features/autoquant/constants";
import { parsePairUniverse } from "../features/autoquant/utils";
import AutoQuantConfigPanel from "../features/autoquant/components/AutoQuantConfigPanel";
import AutoQuantRunDashboard from "../features/autoquant/components/AutoQuantRunDashboard";
import useAutoQuantForm from "../features/autoquant/hooks/useAutoQuantForm";
import useAutoQuantPipeline from "../features/autoquant/hooks/useAutoQuantPipeline";
import useAutoQuantScreening from "../features/autoquant/hooks/useAutoQuantScreening";
import useAutoQuantStrategyGen from "../features/autoquant/hooks/useAutoQuantStrategyGen";
import useAutoQuantUI from "../features/autoquant/hooks/useAutoQuantUI";

export default function AutoQuantTab({
  strategies = [],
  strategiesLoading = false,
  onAgentContextChange = null,
  pipelineState: initialPipelineState = null,
}) {
  const formState = useAutoQuantForm();
  const pipeline = useAutoQuantPipeline(initialPipelineState);
  const strategyGen = useAutoQuantStrategyGen(strategies);
  const screening = useAutoQuantScreening();
  const uiState = useAutoQuantUI();
  const runHistoryRef = useRef(null);

  const { form, setForm } = formState;
  const {
    runId,
    setRunId,
    pipelineState,
    setPipelineState,
    setReport,
    setRunStartedAtMs,
    setWfoWindows,
    startPipeline,
    resumePipeline,
    cancelPipeline,
    loadReport,
    resetPipelineState,
  } = pipeline;

  useEffect(() => {
    if (!onAgentContextChange) return;
    onAgentContextChange({
      active_panel: pipelineState?.current_stage ? `stage-${pipelineState.current_stage}` : null,
      strategy_name: pipelineState?.strategy || form.strategy || null,
      auto_quant_run_id: runId,
      optimizer_session_id: null,
      backtest_run_id: null,
      api_session_id: null,
    });
  }, [form.strategy, onAgentContextChange, pipelineState?.current_stage, pipelineState?.strategy, runId]);

  const handleStart = async () => {
    if (!form.strategy) return;
    try {
      await startPipeline({
        ...form,
        pair_universe: parsePairUniverse(form.pair_universe),
      });
    } catch (err) {
      console.error("Failed to start pipeline:", err);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPipeline();
    } catch (err) {
      console.error("Failed to cancel pipeline:", err);
    }
  };

  const handleRetryRelaxed = (bestAttempt, thresholds, bestStrategyName) => {
    const bestProfit = bestAttempt?.profit ?? null;
    const bestDd = bestAttempt?.drawdown ?? thresholds?.max_drawdown_threshold ?? 30;
    const relaxedProfit = bestProfit != null ? parseFloat((bestProfit - 0.01).toFixed(4)) : 0;
    const relaxedDd = Math.min(35, parseFloat((bestDd + 5).toFixed(1)));
    setForm((prev) => ({
      ...prev,
      min_oos_profit: relaxedProfit,
      max_drawdown_threshold: relaxedDd,
      ...(bestStrategyName ? { strategy: bestStrategyName } : {}),
    }));
    resetPipelineState();
    setRunId(null);
    setPipelineState(null);
  };

  const handleReset = () => {
    resetPipelineState();
    setRunId(null);
    setPipelineState(null);
  };

  const handleLoadRun = useCallback(
    (run) => {
      setRunId(run.run_id);
      if (run.created_at) {
        const createdAtMs = new Date(run.created_at).getTime();
        setRunStartedAtMs(Number.isNaN(createdAtMs) ? null : createdAtMs);
      } else {
        setRunStartedAtMs(null);
      }
      setReport(run.report || null);
      setWfoWindows(run.wfo_windows || []);
      setPipelineState({
        run_id: run.run_id,
        strategy: run.strategy,
        timeframe: run.timeframe,
        in_sample_range: run.in_sample_range,
        out_sample_range: run.out_sample_range,
        exchange: run.exchange,
        status: run.status,
        current_stage: run.current_stage || 0,
        stages:
          run.stages ||
          STAGE_NAMES.map((name, i) => ({
            index: i + 1,
            name,
            status: "pending",
            message: "",
            data: {},
          })),
        error: run.error || null,
        created_at: run.created_at,
        completed_at: run.completed_at,
        retry_history: run.retry_history || [],
        generalization_failure: run.generalization_failure || null,
        sensitivity: run.sensitivity || null,
        thresholds: run.thresholds || null,
        selected_pairs: run.selected_pairs || [],
        winning_pairs: run.winning_pairs || [],
        user_approved_pairs: run.user_approved_pairs || [],
        portfolio_baseline_result: run.portfolio_baseline_result || {},
        progress: run.progress ?? run.progress_percent ?? null,
        progress_percent: run.progress_percent ?? run.progress ?? null,
        eta_seconds: run.eta_seconds ?? null,
        progress_counters: run.progress_counters || {},
        validation_notes: run.validation_notes || [],
      });

      if (run.status === "completed" && !run.report) {
        loadReport(run.run_id).catch((err) => console.error("Failed to load report:", err));
      }
    },
    [loadReport, setPipelineState, setReport, setRunId, setRunStartedAtMs, setWfoWindows]
  );

  return (
    <div className="py-6 px-4 sm:px-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Auto-Quant Factory</h1>
          <p className="text-sm text-base-content/60 mt-1">
            Fully automated 7-stage strategy optimization - sanity check, hyperopt, parameter injection,
            OOS validation, stress test, risk assessment, and delivery.
          </p>
        </div>
        <button
          type="button"
          onClick={uiState.toggleNotif}
          title={uiState.notifEnabled ? "Notifications on - click to disable" : "Enable run notifications"}
          className={`btn btn-sm btn-circle shrink-0 mt-0.5 transition-all ${
            uiState.notifEnabled
              ? "btn-primary shadow-sm shadow-primary/30"
              : "btn-ghost text-base-content/40 hover:text-base-content/70"
          }`}
        >
          Bell
        </button>
      </div>

      {!pipelineState && (
        <AutoQuantConfigPanel
          formState={formState}
          strategyGen={strategyGen}
          screening={screening}
          uiState={uiState}
          strategiesLoading={strategiesLoading}
          isConnecting={pipeline.isConnecting}
          runHistoryRef={runHistoryRef}
          onStart={handleStart}
          onLoadRun={handleLoadRun}
        />
      )}

      {pipelineState && (
        <AutoQuantRunDashboard
          form={form}
          pipelineState={pipelineState}
          runId={runId}
          logLines={pipeline.logLines}
          report={pipeline.report}
          setReport={setReport}
          fitnessCurve={pipeline.fitnessCurve}
          hyperoptProgress={pipeline.hyperoptProgress}
          elapsedSeconds={pipeline.elapsedSeconds}
          runStartedAtMs={pipeline.runStartedAtMs}
          wfoWindows={pipeline.wfoWindows}
          dataHealingStatus={pipeline.dataHealingStatus}
          pairStatusMap={pipeline.pairStatusMap}
          logFilter={uiState.logFilter}
          setLogFilter={uiState.setLogFilter}
          loadReport={loadReport}
          onResume={resumePipeline}
          onCancel={handleCancel}
          onReset={handleReset}
          onRetryRelaxed={handleRetryRelaxed}
        />
      )}
    </div>
  );
}
