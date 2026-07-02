import { useState, useEffect, useRef, useCallback } from "react";
import { STAGE_NAMES } from "../features/autoquant/constants";
import AutoQuantConfigPanel from "../features/autoquant/components/AutoQuantConfigPanel";
import AutoQuantRunDashboard from "../features/autoquant/components/AutoQuantRunDashboard";
import useAutoQuantForm from "../features/autoquant/hooks/useAutoQuantForm";
import useAutoQuantPipeline from "../features/autoquant/hooks/useAutoQuantPipeline";
import useAutoQuantScreening from "../features/autoquant/hooks/useAutoQuantScreening";
import useAutoQuantStrategyGen from "../features/autoquant/hooks/useAutoQuantStrategyGen";
import useAutoQuantUI from "../features/autoquant/hooks/useAutoQuantUI";
import { parsePairUniverse } from "../features/autoquant/utils";

function Eyebrow({ isRunning }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className={`w-2 h-2 rounded-full bg-mint ${isRunning ? "pulse-mint" : ""}`} />
      <div className="h-px flex-1 bg-white/10" />
      <span className="font-mono text-xs text-mint tracking-wider">4TIE</span>
      <div className="h-px flex-1 bg-white/10" />
      <span className="font-mono text-[10px] text-muted">v1.1</span>
    </div>
  );
}

function PipelineStatsStrip({ pipelineState }) {
  const stats = pipelineState || {};
  const totalStages = stats.stages?.length || STAGE_NAMES.length;

  const statsArray = [
    {
      label: 'Stage',
      value: stats.current_stage !== undefined ? `${stats.current_stage + 1}/${totalStages}` : `0/${totalStages}`,
      color: 'mint',
      subtext: stats.current_stage !== undefined ? STAGE_NAMES[stats.current_stage] : 'Not started'
    },
    { 
      label: 'Progress', 
      value: `${stats.progress || 0}%`, 
      color: 'cyan', 
      subtext: stats.eta_seconds ? `${Math.floor(stats.eta_seconds / 60)}m remaining` : 'Calculating...' 
    },
    { 
      label: 'Pairs', 
      value: (stats.selected_pairs || []).length.toString(), 
      color: 'violet-glow', 
      subtext: `${(stats.winning_pairs || []).length} winning` 
    },
    { 
      label: 'Profit', 
      value: stats.thresholds?.min_oos_profit ? `${(stats.thresholds.min_oos_profit * 100).toFixed(1)}%` : '0%', 
      color: 'gold', 
      subtext: 'Min target' 
    },
    { 
      label: 'Drawdown', 
      value: `${stats.thresholds?.max_drawdown_threshold || 30}%`, 
      color: 'pink', 
      subtext: 'Max allowed' 
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {statsArray.map((stat) => (
        <div
          key={stat.label}
          className="bg-base-100 border border-base-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
          style={{ borderTop: `2px solid var(--${stat.color})` }}
        >
          <div className="text-[10px] font-semibold text-base-content/60 uppercase tracking-wider mb-1">{stat.label}</div>
          <div className="text-lg font-semibold text-base-content" style={{ fontWeight: 600 }}>
            {stat.value}
          </div>
          <div className="text-[9px] text-base-content/50 font-mono mt-1">{stat.subtext}</div>
        </div>
      ))}
    </div>
  );
}

function PipelineProgress({ pipelineState }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [progressData, setProgressData] = useState([]);

  useEffect(() => {
    if (!pipelineState || !pipelineState.stages) {
      setTimeout(() => setProgressData([]), 0);
      return;
    }

    const data = pipelineState.stages.map(stage => {
      if (stage.status === 'passed') return 1.0;
      if (stage.status === 'running') return 0.5;
      if (stage.status === 'failed') return 0.2;
      return 0.0;
    });
    setTimeout(() => setProgressData(data), 0);
  }, [pipelineState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = 80 * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = '80px';
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return; // Null guard for canvas context

    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const totalStages = pipelineState?.stages?.length || STAGE_NAMES.length;
      const data = progressData.length > 0 ? progressData : Array.from({ length: totalStages }, () => 0);
      const maxVal = 1.0;
      const displayWidth = width / window.devicePixelRatio;
      const displayHeight = height / window.devicePixelRatio;

      const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
      gradient.addColorStop(1, 'rgba(125, 211, 252, 0.1)');

      ctx.beginPath();
      ctx.moveTo(0, displayHeight);
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * displayWidth;
        const y = displayHeight - (val / maxVal) * displayHeight * 0.8;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(displayWidth, displayHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * displayWidth;
        const y = displayHeight - (val / maxVal) * displayHeight * 0.8;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * displayWidth;
        const y = displayHeight - (val / maxVal) * displayHeight * 0.8;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        
        if (pipelineState?.stages?.[i]?.status === 'passed') {
          ctx.fillStyle = '#7DD3FC';
        } else if (pipelineState?.stages?.[i]?.status === 'running') {
          ctx.fillStyle = '#F472B6';
        } else if (pipelineState?.stages?.[i]?.status === 'failed') {
          ctx.fillStyle = '#EF4444';
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        }
        
        ctx.fill();
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    draw();

    const interval = setInterval(() => {
      draw();
    }, 900);

    return () => clearInterval(interval);
  }, [progressData, pipelineState]);

  const completedStages = pipelineState?.status === 'completed'
    ? (pipelineState?.stages?.length || 6)
    : (pipelineState?.stages?.filter(s => s.status === 'passed').length || 0);
  const totalStages = pipelineState?.stages?.length || 6;

  return (
    <div className="bg-base-100 border border-base-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-primary">{completedStages}/{totalStages}</div>
          <span className="text-xs text-base-content/60">stages completed</span>
        </div>
        <span className={`badge badge-sm ${
          pipelineState?.status === 'completed' ? 'badge-success' :
          pipelineState?.status === 'running' ? 'badge-info' :
          pipelineState?.status === 'failed' ? 'badge-error' : 'badge-ghost'
        }`}>
          {pipelineState?.status ? pipelineState.status.toUpperCase() : 'IDLE'}
        </span>
      </div>
      <div ref={containerRef} className="w-full">
        <canvas ref={canvasRef} className="w-full rounded-lg" style={{ height: '80px' }} />
      </div>
    </div>
  );
}

function ResultsCard({ pipelineState }) {
  const report = pipelineState?.report;
  const portfolioBaseline = pipelineState?.portfolio_baseline_result || {};
  
  const getMetricValue = (value, fallback = '-', suffix = '') => {
    if (value === null || value === undefined) return fallback;
    return `${value}${suffix}`;
  };

  const getMetricTone = (value, type = 'neutral') => {
    if (value === null || value === undefined) return 'neutral';
    if (type === 'higher_is_better') {
      return value > 0 ? 'success' : value < 0 ? 'error' : 'neutral';
    }
    if (type === 'lower_is_better') {
      return value < 10 ? 'success' : value < 20 ? 'warning' : 'error';
    }
    return 'neutral';
  };

  const metrics = [
    { label: 'Total Profit', value: getMetricValue(report?.profit ?? portfolioBaseline?.profit, '-', '%'), tone: getMetricTone(report?.profit ?? portfolioBaseline?.profit, 'higher_is_better') },
    { label: 'Profit Factor', value: getMetricValue(report?.profit_factor ?? portfolioBaseline?.profit_factor, '-'), tone: getMetricTone(report?.profit_factor ?? portfolioBaseline?.profit_factor, 'higher_is_better') },
    { label: 'Max Drawdown', value: getMetricValue(report?.max_drawdown ?? portfolioBaseline?.max_drawdown, '-', '%'), tone: getMetricTone(report?.max_drawdown ?? portfolioBaseline?.max_drawdown, 'lower_is_better') },
    { label: 'Sharpe Ratio', value: getMetricValue(report?.sharpe ?? portfolioBaseline?.sharpe, '-'), tone: getMetricTone(report?.sharpe ?? portfolioBaseline?.sharpe, 'higher_is_better') },
    { label: 'Win Rate', value: getMetricValue(report?.win_rate ?? portfolioBaseline?.win_rate, '-', '%'), tone: getMetricTone(report?.win_rate ?? portfolioBaseline?.win_rate, 'higher_is_better') },
    { label: 'Total Trades', value: getMetricValue(report?.total_trades ?? portfolioBaseline?.total_trades, '-') },
  ];

  return (
    <div className="bg-base-100 border border-base-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">Results Summary</h4>
        {pipelineState?.status === 'completed' && (
          <span className="badge badge-success badge-xs">Complete</span>
        )}
      </div>
      
      {pipelineState?.status === 'completed' && (report || portfolioBaseline) ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {metrics.map((metric, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg border ${
                  metric.tone === 'success' ? 'border-success/30 bg-success/5' :
                  metric.tone === 'warning' ? 'border-warning/30 bg-warning/5' :
                  metric.tone === 'error' ? 'border-error/30 bg-error/5' :
                  'border-base-200 bg-base-50'
                }`}
              >
                <div className="text-[9px] font-semibold text-base-content/50 uppercase tracking-wider mb-1">{metric.label}</div>
                <div className={`text-sm font-bold font-mono ${
                  metric.tone === 'success' ? 'text-success' :
                  metric.tone === 'warning' ? 'text-warning' :
                  metric.tone === 'error' ? 'text-error' :
                  'text-base-content'
                }`}>
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
          
          {pipelineState?.selected_pairs && pipelineState.selected_pairs.length > 0 && (
            <div className="pt-2 border-t border-base-200">
              <div className="text-[9px] font-semibold text-base-content/50 uppercase tracking-wider mb-2">Selected Pairs</div>
              <div className="flex flex-wrap gap-1">
                {pipelineState.selected_pairs.slice(0, 6).map((pair, index) => (
                  <span key={index} className="badge badge-ghost badge-xs font-mono">{String(pair)}</span>
                ))}
                {pipelineState.selected_pairs.length > 6 && (
                  <span className="badge badge-ghost badge-xs">+{pipelineState.selected_pairs.length - 6}</span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-base-content/40">
          {pipelineState?.status === 'running' ? 'Results will appear after pipeline completes' : 'No results available'}
        </div>
      )}
    </div>
  );
}

export default function AutoQuantOverview({ strategies = [], strategiesLoading = false, onAgentContextChange = null, pipelineState: initialPipelineState = null, syncSharedState = null }) {
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

  useEffect(() => {
    if (!syncSharedState) return;
    const activeStatuses = new Set(["pending", "running", "awaiting_user_approval"]);
    const isRunning = pipelineState?.status && activeStatuses.has(pipelineState.status);
    syncSharedState({ isWorkRunning: isRunning });
  }, [syncSharedState, pipelineState?.status]);

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
            status: run.status === "completed" ? "completed" : "pending",
            message: run.status === "completed" ? "Completed" : "",
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

  const hasActiveRun = Boolean(pipelineState);
  const activeStatuses = new Set(["pending", "running", "awaiting_user_approval"]);
  const isRunning = pipelineState?.status && activeStatuses.has(pipelineState.status);

  return (
    <div className="space-y-6">
      <Eyebrow isRunning={isRunning} />
      <PipelineStatsStrip pipelineState={pipelineState} />
      
      {!hasActiveRun && (
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

      {hasActiveRun && (
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

      <div className="grid grid-cols-[1.2fr_1fr] gap-6">
        <PipelineProgress pipelineState={pipelineState} />
        <ResultsCard pipelineState={pipelineState} />
      </div>
    </div>
  );
}
