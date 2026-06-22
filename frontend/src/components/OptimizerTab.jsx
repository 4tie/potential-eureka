/* eslint-disable react-hooks/refs */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  C_GREEN,
  C_RED,
  AUTO_SAFE_PARAM_CAP,
  DATE_PRESETS,
  INITIAL_POLL_MS,
  MAX_LOG,
  MAX_POLL_MS,
  MIN_TRADE_THRESHOLD,
  PARAMETER_MODES,
  SCORE_METRICS,
  SEARCH_STRATEGIES,
  TABS,
  TERMINAL_STATUSES,
  TIMEFRAMES,
} from "../features/optimizer/constants";
import ErrorDisplay from "./shared/ErrorDisplay";
import { datePreset, fmtElapsed, fmtMoney, fmtNum, fmtPct, fmtScore, trialDuration } from "../features/optimizer/formatters";
import { buildOptimizerRunPayload } from "../features/optimizer/utils";
import {
  applyOptimizerTrial,
  cancelOptimizerSession,
  createOptimizerLogStream,
  exportOptimizerTrials,
  getApiSessionStatus,
  getOptimizerSession,
  getTrialApplicationPreview,
  getTrialParams,
  listOptimizerSessions,
  promoteOptimizerTrial,
  startOptimizer,
} from "../features/optimizer/api";
import { buildOptimizerViewModel, optimizerRunDisabledReason } from "../features/optimizer/viewModel";
import { useOptimizerForm } from "../features/optimizer/hooks/useOptimizerForm";
import { useOptimizerSearchSpaces } from "../features/optimizer/hooks/useOptimizerSearchSpaces";
import {
  AutoSafeEvents,
  BestSummary,
  EmptyState,
  MetricTile,
  Panel,
  ParamPreview,
  ParamValue,
  StatusBadge,
  TrialChart,
} from "../features/optimizer/components/OptimizerPrimitives";

function VectorBTReportSummary({ report }) {
  if (!report) {
    return (
      <div className="rounded-lg border border-base-300 bg-base-300/20 px-3 py-2 text-xs text-base-content/45">
        VectorBT pre-screening runs before the first Freqtrade trial when enabled.
      </div>
    );
  }
  const reason = report.skipped_reason || report.error;
  return (
    <div className="rounded-lg border border-base-300 bg-base-300/20 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/40">VectorBT Pre-Screen</div>
          <div className="mt-1 font-mono text-base-content/70">{report.status}</div>
        </div>
        {report.duration_seconds != null && (
          <div className="font-mono text-base-content/45">{fmtElapsed(report.duration_seconds)}</div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] uppercase text-base-content/35">Evaluated</div>
          <div className="font-mono">{report.evaluated_count ?? 0}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-base-content/35">Selected</div>
          <div className="font-mono">{report.selected_count ?? 0}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-base-content/35">Reduction</div>
          <div className="font-mono">{report.reduction_pct != null ? fmtPct(report.reduction_pct, 1, false) : "-"}</div>
        </div>
      </div>
      {reason && <div className="mt-2 text-[11px] text-warning">{reason}</div>}
    </div>
  );
}

function VectorBTTopCandidates({ candidates }) {
  if (!candidates?.length) {
    return <EmptyState>No VectorBT candidate rankings are available for this session.</EmptyState>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-base-content/35">
            <th>Rank</th>
            <th className="text-right">Score</th>
            <th className="text-right">Profit %</th>
            <th className="text-right">Drawdown</th>
            <th className="text-right">Trades</th>
            <th>Parameters</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map(candidate => {
            const metrics = candidate.metrics || {};
            const params = Object.entries(candidate.parameters || {})
              .map(([key, value]) => `${key}=${value}`)
              .join(", ");
            return (
              <tr key={candidate.rank}>
                <td className="font-mono">#{candidate.rank}</td>
                <td className="text-right font-mono">{fmtScore(metrics.score)}</td>
                <td className="text-right font-mono">{fmtPct(metrics.net_profit_pct)}</td>
                <td className="text-right font-mono text-warning">{metrics.max_drawdown_pct != null ? fmtPct(Math.abs(metrics.max_drawdown_pct), 2, false) : "-"}</td>
                <td className="text-right font-mono">{metrics.total_trades ?? "-"}</td>
                <td className="font-mono max-w-[520px] truncate" title={params}>{params || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function OptimizerTab({
  strategies = [],
  strategiesLoading = false,
  sharedState = null,
  sharedLoading = false,
  syncSharedState = null,
  onAgentContextChange = null,
}) {
  const {
    strategyName,
    setStrategyName,
    timeframe,
    setTimeframe,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
    pairsText,
    setPairsText,
    totalTrials,
    setTotalTrials,
    searchStrategy,
    setSearchStrategy,
    parameterMode,
    setParameterMode,
    scoreMetric,
    setScoreMetric,
    maxOpenTrades,
    setMaxOpenTrades,
    wallet,
    setWallet,
    enableVectorbtScreening,
    setEnableVectorbtScreening,
    vectorbtCandidateCount,
    setVectorbtCandidateCount,
    vectorbtKeepRatio,
    setVectorbtKeepRatio,
    vectorbtTimeoutSeconds,
    setVectorbtTimeoutSeconds,
    pairList,
    timerange,
    validDateRange,
  } = useOptimizerForm({ sharedState, sharedLoading, syncSharedState });

  const {
    searchSpaces,
    spacesLoading,
    enabledSpaces,
    autoSafeEligibleCount,
    gridCount,
    groupedSpaces,
    toggleParam,
    updateParam,
    setAllParams,
  } = useOptimizerSearchSpaces({ strategyName, parameterMode, setParameterMode });

  const [activeTab, setActiveTab] = useState("setup");
  const [optSessionId, setOptSessionId] = useState(null);
  const [apiSessionId, setApiSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [sessionError, setSessionError] = useState(null);
  const [sessionTimeout, setSessionTimeout] = useState(false);

  const [selectedTrial, setSelectedTrial] = useState(null);
  const [checkedTrials, setCheckedTrials] = useState(new Set());
  const [toasts, setToasts] = useState([]);

  const [promotingCandidate, setPromotingCandidate] = useState(false);
  const [candidateResult, setCandidateResult] = useState(null);

  const [paramsModalOpen, setParamsModalOpen] = useState(false);
  const [paramsModalData, setParamsModalData] = useState(null);
  const [paramsModalTitle, setParamsModalTitle] = useState("Best Trial Parameters");
  const [paramsLoading, setParamsLoading] = useState(false);

  const [applyConfirmTrial, setApplyConfirmTrial] = useState(null);
  const [applyConfirmText, setApplyConfirmText] = useState("");
  const [applyPreview, setApplyPreview] = useState(null);
  const [applyPreviewLoading, setApplyPreviewLoading] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [logLines, setLogLines] = useState([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const logBoxRef = useRef(null);
  const pollRef = useRef(null);
  const pollDelayRef = useRef(INITIAL_POLL_MS);
  const esRef = useRef(null);
  const toastIdRef = useRef(0);
  const retryCountRef = useRef(0);
  const startTimeRef = useRef(null);
  const toastTimeoutsRef = useRef(new Map());
  const timeoutWarnedRef = useRef(false);
  const pendingRequestsRef = useRef(new Set());
  const MAX_POLL_RETRIES = 3;
  const API_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

  const clearToastTimeouts = useCallback(() => {
    toastTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    toastTimeoutsRef.current.clear();
  }, []);

  const runRequest = useCallback(async requestFn => {
    const controller = new AbortController();
    pendingRequestsRef.current.add(controller);
    try {
      return await requestFn(controller.signal);
    } finally {
      pendingRequestsRef.current.delete(controller);
    }
  }, []);

  const abortPendingRequests = useCallback(() => {
    pendingRequestsRef.current.forEach(controller => controller.abort());
    pendingRequestsRef.current.clear();
  }, []);

  const isAbortError = useCallback(err => err?.name === "AbortError", []);

  useEffect(() => {
    if (!onAgentContextChange) return;
    onAgentContextChange({
      active_panel: activeTab,
      strategy_name: strategyName || null,
      auto_quant_run_id: null,
      optimizer_session_id: optSessionId,
      optimizer_trial_number: selectedTrial?.trial_number ?? null,
      backtest_run_id: null,
      api_session_id: apiSessionId,
    });
  }, [activeTab, apiSessionId, onAgentContextChange, optSessionId, selectedTrial, strategyName]);

  const fetchOptimizerSession = useCallback(async optId => {
    try {
      const sessionData = await runRequest(signal => getOptimizerSession(optId, { signal }));
      // Validate session matches current strategy
      if (sessionData.strategy_name && strategyName && sessionData.strategy_name !== strategyName) {
        setSessionError(`Session ${optId} belongs to strategy '${sessionData.strategy_name}', but current strategy is '${strategyName}'`);
        return null;
      }
      setSession(sessionData);
      setSessionError(null);
      retryCountRef.current = 0;
      return sessionData;
    } catch (err) {
      if (isAbortError(err)) return null;
      setSessionError(`Failed to load session ${optId}: ${err.message}`);
      throw err;
    }
  }, [isAbortError, runRequest, strategyName]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(apiId => {
    stopPolling();
    pollDelayRef.current = INITIAL_POLL_MS;
    retryCountRef.current = 0;
    startTimeRef.current = Date.now();

    const poll = async () => {
      try {
        // Check for timeout
        if (
          startTimeRef.current &&
          Date.now() - startTimeRef.current > API_TIMEOUT_MS &&
          !timeoutWarnedRef.current
        ) {
          timeoutWarnedRef.current = true;
          setSessionTimeout(true);
          setSessionError(`Optimizer has been running for more than ${API_TIMEOUT_MS / 60000} minutes. Polling will continue; check logs if progress looks stale.`);
        }

        const sd = await runRequest(signal => getApiSessionStatus(apiId, { signal }));
        setApiStatus(sd.status);

        const optId = sd.result?.optimizer_session_id;
        if (optId) {
          setOptSessionId(optId);
          try {
            await fetchOptimizerSession(optId);
            retryCountRef.current = 0; // Reset retry count on success
          } catch {
            retryCountRef.current++;
            if (retryCountRef.current >= MAX_POLL_RETRIES) {
              pollRef.current = null;
              setIsRunning(false);
              setSessionError(`Failed to load optimizer session after ${MAX_POLL_RETRIES} retries`);
              return;
            }
          }
        }

        if (TERMINAL_STATUSES.has(sd.status)) {
          pollRef.current = null;
          setIsRunning(false);
          setActiveTab(sd.status === "completed" ? "candidate" : "trials");
          if (optId) await fetchOptimizerSession(optId);
          return;
        }

        // Exponential backoff: 1s → 2s → 5s → 10s (cap at 10s)
        const backoffSteps = [1000, 2000, 5000, 10000];
        const currentStep = backoffSteps.findIndex(step => step >= pollDelayRef.current);
        const nextDelay = backoffSteps[Math.min(currentStep + 1, backoffSteps.length - 1)];
        pollDelayRef.current = nextDelay;

        pollRef.current = setTimeout(poll, pollDelayRef.current);
      } catch (err) {
        if (isAbortError(err)) return;
        retryCountRef.current++;
        if (retryCountRef.current >= MAX_POLL_RETRIES) {
          pollRef.current = null;
          setIsRunning(false);
          setSessionError(`Polling failed after ${MAX_POLL_RETRIES} retries: ${err.message}`);
          return;
        }
        // On error, increase backoff and retry
        pollDelayRef.current = Math.min(pollDelayRef.current * 2, MAX_POLL_MS);
        pollRef.current = setTimeout(poll, pollDelayRef.current);
      }
    };

    pollRef.current = setTimeout(poll, pollDelayRef.current);
  }, [API_TIMEOUT_MS, fetchOptimizerSession, isAbortError, runRequest, stopPolling]);

  const startLogs = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setLogLines([]);
    const es = createOptimizerLogStream();
    esRef.current = es;
    es.onmessage = e => {
      let line = e.data;
      try {
        const payload = JSON.parse(e.data);
        line = payload.message || e.data;
      } catch {
        // Ignore malformed log payloads and show the raw SSE data.
      }
      setLogLines(prev => {
        const next = [...prev, line];
        return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
      });
    };
    es.onerror = () => {};
  }, []);

  useEffect(() => {
    if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
  }, [logLines, logsOpen]);

  useEffect(() => () => {
    stopPolling();
    abortPendingRequests();
    clearToastTimeouts();
    if (esRef.current) esRef.current.close();
  }, [abortPendingRequests, stopPolling, clearToastTimeouts]);

  const addToast = useCallback((message, type = "success") => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    
    const timeoutId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      toastTimeoutsRef.current.delete(id);
    }, 4000);
    
    toastTimeoutsRef.current.set(id, timeoutId);
  }, []);

  const viewModel = useMemo(
    () => buildOptimizerViewModel({ session, apiStatus, totalTrials }),
    [apiStatus, session, totalTrials],
  );
  const {
    phase,
    trials,
    totalCount,
    completedCount,
    failedCount,
    runningCount,
    terminalCount,
    progressPct,
    elapsedSec,
    etaSec,
    bestTrialNum,
    bestTrial,
    topFiveTrials,
    autoLockEvents,
    vectorbtScreening,
    topVectorbtCandidates,
    visibleTrials,
    completedWithMetrics,
    profitData,
    drawdownData,
  } = viewModel;
  const runDisabledReason = optimizerRunDisabledReason({
    strategyName,
    dateStart,
    dateEnd,
    validDateRange,
    pairList,
    enabledSpaces,
    isRunning,
  });
  const canRun = runDisabledReason == null;

  const toggleCheck = (e, trialNumber) => {
    e.stopPropagation();
    setCheckedTrials(prev => {
      const next = new Set(prev);
      if (next.has(trialNumber)) next.delete(trialNumber);
      else next.add(trialNumber);
      return next;
    });
  };

  const handleRun = async () => {
    if (runDisabledReason) {
      setSubmitError(runDisabledReason);
      return;
    }
    if (isRunning) {
      setSubmitError("An optimizer session is already running. Cancel it first or wait for it to finish.");
      return;
    }
    setSubmitError(null);
    setSessionError(null);
    setSessionTimeout(false);
    timeoutWarnedRef.current = false;
    setSession(null);
    setSelectedTrial(null);
    setCheckedTrials(new Set());
    setCandidateResult(null);
    setOptSessionId(null);
    setApiSessionId(null);
    setApiStatus("running");
    setIsRunning(true);
    setActiveTab("live");
    setLogsOpen(false);
    pollDelayRef.current = INITIAL_POLL_MS; // Reset polling delay for new optimization
    retryCountRef.current = 0;
    startTimeRef.current = Date.now();

    try {
      const data = await runRequest(signal => startOptimizer(buildOptimizerRunPayload({
        strategyName,
        dateStart,
        dateEnd,
        timeframe,
        pairList,
        totalTrials,
        searchStrategy,
        parameterMode,
        scoreMetric,
        maxOpenTrades,
        wallet,
        searchSpaces,
        enableVectorbtScreening,
        vectorbtCandidateCount,
        vectorbtKeepRatio,
        vectorbtTimeoutSeconds,
      }), { signal }));
      startLogs();
      setApiSessionId(data.session_id);
      startPolling(data.session_id);
    } catch (err) {
      setSubmitError(err.message || String(err));
      setIsRunning(false);
      setApiStatus(null);
      setApiSessionId(null);
      setActiveTab("setup");
    }
  };

  const handleStop = async () => {
    stopPolling();
    setApiStatus("cancelled");
    setIsRunning(false);
    if (optSessionId) {
      try {
        await runRequest(signal => cancelOptimizerSession(optSessionId, { signal }));
        await fetchOptimizerSession(optSessionId);
      } catch {
        // Cancellation is reflected by the optimistic status update above.
      }
    }
  };

  const handleApplyTrial = async trial => {
    if (!trial?.parameters) return;
    try {
      await runRequest(signal => applyOptimizerTrial({ strategyName, parameters: trial.parameters }, { signal }));
      addToast(`Trial #${trial.trial_number} parameters overwritten on accepted version.`, "success");
    } catch (err) {
      if (isAbortError(err)) return;
      addToast(err.message || "Network error while applying parameters.", "error");
    }
  };

  const openApplyConfirm = async trial => {
    if (!trial) return;
    setApplyConfirmTrial(trial);
    setApplyConfirmText("");
    setApplyPreview(null);
    setApplyPreviewLoading(true);
    try {
      const data = await runRequest(signal => getTrialApplicationPreview({ optimizerSessionId: optSessionId, trialNumber: trial.trial_number }, { signal }));
      setApplyPreview(data);
    } catch (err) {
      if (isAbortError(err)) return;
      setApplyPreview({ error: err.message || "Preview unavailable due to a network error." });
    } finally {
      setApplyPreviewLoading(false);
    }
  };

  const handleViewParams = async (trialNumber = null) => {
    if (!optSessionId) return;
    setParamsLoading(true);
    setParamsModalOpen(true);
    setParamsModalData(null);
    setParamsModalTitle(trialNumber == null ? "Best Trial Parameters" : `Trial #${trialNumber} Parameters`);
    try {
      const data = await runRequest(signal => getTrialParams({ optimizerSessionId: optSessionId, trialNumber }, { signal }));
      setParamsModalData(data);
    } catch (err) {
      if (isAbortError(err)) return;
      setParamsModalData({ error: err.message || "Network error loading params." });
    } finally {
      setParamsLoading(false);
    }
  };

  const handlePromoteCandidate = async (trial = null) => {
    if (!optSessionId) return;
    setPromotingCandidate(true);
    setCandidateResult(null);
    try {
      const data = await runRequest(signal => promoteOptimizerTrial({ optimizerSessionId: optSessionId, trial }, { signal }));
      setCandidateResult({ ok: true, ...data });
      addToast(`Candidate version created: ${data.candidate_version_id}`, "success");
    } catch (err) {
      if (isAbortError(err)) return;
      setCandidateResult({ ok: false, error: err.message || "Promotion failed." });
      addToast(err.message || "Network error during promotion.", "error");
    } finally {
      setPromotingCandidate(false);
    }
  };

  const loadHistory = async () => {
    if (!strategyName) return;
    setHistoryLoading(true);
    setHistoryOpen(true);
    try {
      const data = await runRequest(signal => listOptimizerSessions(strategyName, { signal }));
      setHistorySessions(Array.isArray(data) ? data : []);
    } catch (err) {
      if (isAbortError(err)) return;
      setHistorySessions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectHistory = async historyId => {
    setHistoryOpen(false);
    setSessionError(null);
    setSessionTimeout(false);
    setOptSessionId(historyId);
    setApiSessionId(null);
    setIsRunning(false);
    setApiStatus(null);
    setSession(null);
    setSelectedTrial(null);
    setCheckedTrials(new Set());
    setCandidateResult(null);
    setParamsModalOpen(false);
    setApplyConfirmTrial(null);
    setActiveTab("candidate");
    stopPolling();
    retryCountRef.current = 0;
    try {
      await fetchOptimizerSession(historyId);
      const pollHistory = async () => {
        try {
          const s = await runRequest(signal => getOptimizerSession(historyId, { signal }));
          setSession(s);
          if (TERMINAL_STATUSES.has(s.phase)) {
            pollRef.current = null;
            return;
          }
        } catch (err) {
          if (isAbortError(err)) return;
          retryCountRef.current++;
          if (retryCountRef.current >= MAX_POLL_RETRIES) {
            pollRef.current = null;
            setSessionError(`Failed to load historical session after ${MAX_POLL_RETRIES} retries`);
            return;
          }
        }
        pollRef.current = setTimeout(pollHistory, 1500);
      };
      pollRef.current = setTimeout(pollHistory, 1500);
      addToast("Loaded historical optimizer session.", "success");
    } catch (err) {
      if (isAbortError(err)) return;
      setSessionError(`Failed to load historical session: ${err.message}`);
    }
  };

  const handleExportSelected = async (specificTrial = null) => {
    const toExport = specificTrial ? [specificTrial] : trials.filter(t => checkedTrials.has(t.trial_number));
    if (!toExport.length) return;
    const payload = {
      trials: toExport.map(t => ({
        strategy_name: strategyName,
        trial_number: t.trial_number,
        score: t.metrics?.score ?? null,
        parameters: t.parameters || {},
        metrics: {
          net_profit_pct: t.metrics?.net_profit_pct ?? null,
          net_profit_abs: t.metrics?.net_profit_abs ?? null,
          max_drawdown_pct: t.metrics?.max_drawdown_pct ?? null,
          max_drawdown_abs: t.metrics?.max_drawdown_abs ?? null,
          total_trades: t.metrics?.total_trades ?? null,
          win_rate_pct: t.metrics?.win_rate_pct ?? null,
          profit_factor: t.metrics?.profit_factor ?? null,
          sharpe_ratio: t.metrics?.sharpe_ratio ?? null,
        },
      })),
    };
    try {
      await runRequest(signal => exportOptimizerTrials(payload.trials, { signal }));
      addToast(`${toExport.length} configuration${toExport.length > 1 ? "s" : ""} exported to Stress Test Lab.`, "success");
      if (!specificTrial) setCheckedTrials(new Set());
    } catch (err) {
      if (isAbortError(err)) return;
      addToast(err.message || "Network error during export.", "error");
    }
  };

  const metricTone = value => value > 0 ? "good" : value < 0 ? "bad" : "neutral";
  const scoreLabel = SCORE_METRICS.find(s => s.value === scoreMetric)?.label || scoreMetric;
  const confirmToken = applyConfirmTrial ? `OVERWRITE ${applyConfirmTrial.trial_number}` : "";
  const previewChangedCount = applyPreview?.original_json && applyPreview?.modified_json
    ? Object.keys(applyPreview.modified_json).length
    : null;

  const renderSetup = () => (
    <div className="h-full overflow-y-auto p-5">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 max-w-[1500px] mx-auto">
        <div className="space-y-5">
          <Panel title="Strategy & Market">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Strategy</span>
                <select
                  className="select select-bordered select-sm w-full"
                  value={strategyName}
                  onChange={e => setStrategyName(e.target.value)}
                  disabled={isRunning || strategiesLoading}
                >
                  <option value="">Select strategy</option>
                  {strategies.map(s => (
                    <option key={s.strategy_name} value={s.strategy_name}>{s.strategy_name}</option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Pairs</span>
                <textarea
                  className="textarea textarea-bordered min-h-[84px] text-xs font-mono"
                  value={pairsText}
                  placeholder="BTC/USDT, ETH/USDT"
                  onChange={e => setPairsText(e.target.value)}
                  disabled={isRunning}
                />
              </label>
            </div>
          </Panel>

          <Panel title="Timerange & Execution">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Timeframe</span>
                <select className="select select-bordered select-sm" value={timeframe} onChange={e => setTimeframe(e.target.value)} disabled={isRunning}>
                  {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Start</span>
                <input type="date" className="input input-bordered input-sm" value={dateStart} onChange={e => setDateStart(e.target.value)} disabled={isRunning} />
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">End</span>
                <input type="date" className="input input-bordered input-sm" value={dateEnd} onChange={e => setDateEnd(e.target.value)} disabled={isRunning} />
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Trials</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="input input-bordered input-sm"
                  value={totalTrials}
                  onChange={e => setTotalTrials(Math.max(1, Math.min(500, Number(e.target.value))))}
                  disabled={isRunning}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              {DATE_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn-xs btn-ghost border border-base-300"
                  disabled={isRunning}
                  onClick={() => {
                    const { start, end } = datePreset(p.days);
                    setDateStart(start);
                    setDateEnd(end);
                  }}
                >
                  {p.label}
                </button>
              ))}
              <span className={`text-[11px] font-mono self-center ${validDateRange ? "text-base-content/35" : "text-error"}`}>
                {timerange}
              </span>
            </div>
          </Panel>

          <Panel title="Optimization Method">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Parameter Mode</span>
                <div className="join">
                  {PARAMETER_MODES.map(mode => (
                    <button
                      key={mode.value}
                      type="button"
                      className={`btn btn-sm join-item flex-1 ${parameterMode === mode.value ? "btn-primary" : "btn-ghost border border-base-300"}`}
                      disabled={isRunning}
                      onClick={() => setParameterMode(mode.value)}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Search Method</span>
                <select className="select select-bordered select-sm" value={searchStrategy} onChange={e => setSearchStrategy(e.target.value)} disabled={isRunning}>
                  {SEARCH_STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Score Metric</span>
                <select className="select select-bordered select-sm" value={scoreMetric} onChange={e => setScoreMetric(e.target.value)} disabled={isRunning}>
                  {SCORE_METRICS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Max Open Trades</span>
                <input type="number" min={1} className="input input-bordered input-sm" value={maxOpenTrades} onChange={e => setMaxOpenTrades(Number(e.target.value))} disabled={isRunning} />
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Wallet</span>
                <input type="number" min={1} className="input input-bordered input-sm" value={wallet} onChange={e => setWallet(Number(e.target.value))} disabled={isRunning} />
              </label>
            </div>
          </Panel>

          <Panel title="VectorBT Pre-Screening">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Screening</span>
                <div className="flex h-8 items-center gap-3 rounded border border-base-300 px-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-xs toggle-primary"
                    checked={enableVectorbtScreening}
                    onChange={e => setEnableVectorbtScreening(e.target.checked)}
                    disabled={isRunning}
                  />
                  <span className="text-xs font-mono">{enableVectorbtScreening ? "enabled" : "disabled"}</span>
                </div>
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Candidates</span>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  className="input input-bordered input-sm"
                  value={vectorbtCandidateCount}
                  onChange={e => setVectorbtCandidateCount(Math.max(1, Math.min(100000, Number(e.target.value))))}
                  disabled={isRunning || !enableVectorbtScreening}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Keep Ratio</span>
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  className="input input-bordered input-sm"
                  value={vectorbtKeepRatio}
                  onChange={e => setVectorbtKeepRatio(Math.max(0.01, Math.min(1, Number(e.target.value))))}
                  disabled={isRunning || !enableVectorbtScreening}
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Timeout Seconds</span>
                <input
                  type="number"
                  min={1}
                  max={3600}
                  className="input input-bordered input-sm"
                  value={vectorbtTimeoutSeconds}
                  onChange={e => setVectorbtTimeoutSeconds(Math.max(1, Math.min(3600, Number(e.target.value))))}
                  disabled={isRunning || !enableVectorbtScreening}
                />
              </label>
            </div>
            <div className="mt-3 rounded-lg border border-base-300 bg-base-300/20 px-3 py-2 text-xs text-base-content/45">
              VectorBT ranks parameter candidates quickly; Freqtrade still validates every saved optimizer trial.
            </div>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel
            title="Run Preview"
            action={<button className="btn btn-ghost btn-xs border border-base-300" disabled={!strategyName} onClick={loadHistory}>History</button>}
          >
            <div className="space-y-3 text-xs">
              <div className="flex justify-between gap-3"><span className="text-base-content/40">Strategy</span><span className="font-mono text-right truncate">{strategyName || "-"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/40">Pairs</span><span className="font-mono text-right">{pairList.length || 0}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/40">Timerange</span><span className="font-mono text-right">{timerange}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/40">Method</span><span className="font-mono text-right">{searchStrategy}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/40">Mode</span><span className="font-mono text-right">{parameterMode === "auto_safe" ? "auto_safe" : "manual"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/40">Score</span><span className="font-mono text-right">{scoreLabel}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/40">Optimized Params</span><span className="font-mono text-right">{enabledSpaces.length} / {searchSpaces.length}</span></div>
              <div className="flex justify-between gap-3"><span className="text-base-content/40">VectorBT</span><span className="font-mono text-right">{enableVectorbtScreening ? `${vectorbtCandidateCount} @ ${Math.round(vectorbtKeepRatio * 100)}%` : "off"}</span></div>
              {parameterMode === "auto_safe" && autoSafeEligibleCount > AUTO_SAFE_PARAM_CAP && (
                <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                  Auto Safe capped enabled params at {AUTO_SAFE_PARAM_CAP}; {autoSafeEligibleCount - AUTO_SAFE_PARAM_CAP} safe buy/sell param{autoSafeEligibleCount - AUTO_SAFE_PARAM_CAP === 1 ? "" : "s"} remain locked.
                </div>
              )}
              {searchStrategy === "grid" && (
                <div className={`rounded border px-3 py-2 ${gridCount > totalTrials ? "border-warning/30 bg-warning/10 text-warning" : "border-base-300 bg-base-300/20 text-base-content/45"}`}>
                  Grid has about <span className="font-mono">{gridCount.toLocaleString()}</span> combinations; this run will execute {totalTrials} trials.
                </div>
              )}
              {pairList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {pairList.slice(0, 8).map(pair => <span key={pair} className="badge badge-sm badge-ghost font-mono">{pair}</span>)}
                  {pairList.length > 8 && <span className="badge badge-sm badge-ghost">+{pairList.length - 8}</span>}
                </div>
              )}
              <button onClick={handleRun} disabled={!canRun} className="btn btn-primary btn-sm w-full mt-2">
                {isRunning ? <><span className="loading loading-spinner loading-xs" />Running</> : "Run Optimizer"}
              </button>
              {runDisabledReason && <div className="text-error text-[11px]">{runDisabledReason}</div>}
            </div>
          </Panel>

          {historyOpen && (
            <Panel title="Previous Runs" action={<button className="btn btn-ghost btn-xs" onClick={() => setHistoryOpen(false)}>Close</button>}>
              <div className="max-h-80 overflow-y-auto -mx-1">
                {historyLoading && <div className="py-8 text-center text-xs text-base-content/35"><span className="loading loading-spinner loading-xs" /> Loading</div>}
                {!historyLoading && historySessions.length === 0 && <div className="py-8 text-center text-xs text-base-content/35">No previous sessions found.</div>}
                {!historyLoading && historySessions.map(s => (
                  <button key={s.session_id} className="w-full text-left rounded px-3 py-2 hover:bg-base-300/45" onClick={() => handleSelectHistory(s.session_id)}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-base-content/70">{s.session_id.slice(0, 8)}</span>
                      <StatusBadge status={s.phase} />
                    </div>
                    <div className="mt-1 text-[10px] text-base-content/35 font-mono">
                      {s.completed_trials} / {s.total_trials} trials {s.best_score != null ? `- score ${fmtScore(s.best_score)}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );

  const renderParameters = () => (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-[1500px] mx-auto space-y-4">
        <Panel
          title="Parameter Search Spaces"
          action={(
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-base-content/35">{enabledSpaces.length} enabled</span>
              <button className="btn btn-ghost btn-xs border border-base-300" disabled={isRunning || !searchSpaces.length} onClick={() => setAllParams(true)}>Enable all</button>
              <button className="btn btn-ghost btn-xs border border-base-300" disabled={isRunning || !searchSpaces.length} onClick={() => setAllParams(false)}>Lock all</button>
            </div>
          )}
        >
          {!strategyName && <EmptyState>Select a strategy to inspect optimizable parameters.</EmptyState>}
          {strategyName && spacesLoading && <EmptyState><span className="loading loading-spinner loading-sm" /> Loading parameters</EmptyState>}
          {strategyName && !spacesLoading && searchSpaces.length === 0 && <EmptyState>No optimizable parameters were found for this strategy.</EmptyState>}
          {searchSpaces.length > 0 && (
            <div className="space-y-6">
              <div className="rounded-lg border border-base-300 bg-base-300/20 px-3 py-2 text-xs text-base-content/45">
                Enabled rows are sampled by the optimizer. Locked rows stay at the accepted version values when temporary trial versions are created.
              </div>
              {groupedSpaces.map(group => (
                <div key={group.key} className="overflow-hidden rounded-lg border border-base-300">
                  <div className="flex items-center justify-between bg-base-300/35 px-3 py-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">{group.label}</div>
                    <div className="text-[10px] font-mono text-base-content/30">{group.items.filter(s => s.enabled).length} / {group.items.length}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table table-xs w-full">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-base-content/35">
                          <th className="w-24">Optimize</th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Flags</th>
                          <th className="text-right">Default</th>
                          <th className="text-right">Min</th>
                          <th className="text-right">Max</th>
                          <th className="text-right">Step</th>
                          <th>Choices</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map(sp => {
                          const idx = searchSpaces.findIndex(item => item.name === sp.name);
                          const choiceText = sp.choices?.length ? sp.choices.map(v => String(v)).join(", ") : "-";
                          return (
                            <tr key={sp.name} className={sp.enabled ? "" : "opacity-50"}>
                              <td>
                                <label className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider">
                                  <input type="checkbox" className="toggle toggle-xs toggle-primary" checked={!!sp.enabled} onChange={() => toggleParam(idx)} disabled={isRunning} />
                                  {sp.enabled ? "On" : "Locked"}
                                </label>
                              </td>
                              <td className="font-mono text-base-content/75 min-w-[180px]">{sp.name}</td>
                              <td className="font-mono text-base-content/45">{sp.param_type}</td>
                              <td className="text-[10px] text-base-content/35">{sp.optimizable === false ? "optimize=false" : "-"}</td>
                              <td className="text-right font-mono"><ParamValue value={sp.default} /></td>
                              <td className="text-right">
                                {sp.choices ? <span className="font-mono text-base-content/25">-</span> : (
                                  <input type="number" className="input input-xs input-bordered w-28 text-right font-mono" value={sp.min_value ?? ""} disabled={isRunning || !sp.enabled} onChange={e => updateParam(idx, "min_value", e.target.value)} step="any" />
                                )}
                              </td>
                              <td className="text-right">
                                {sp.choices ? <span className="font-mono text-base-content/25">-</span> : (
                                  <input type="number" className="input input-xs input-bordered w-28 text-right font-mono" value={sp.max_value ?? ""} disabled={isRunning || !sp.enabled} onChange={e => updateParam(idx, "max_value", e.target.value)} step="any" />
                                )}
                              </td>
                              <td className="text-right">
                                {sp.choices ? <span className="font-mono text-base-content/25">-</span> : (
                                  <input type="number" className="input input-xs input-bordered w-24 text-right font-mono" value={sp.step ?? ""} disabled={isRunning || !sp.enabled} onChange={e => updateParam(idx, "step", e.target.value)} step="any" />
                                )}
                              </td>
                              <td className="font-mono text-[11px] text-base-content/45 max-w-[260px] truncate" title={choiceText}>{choiceText}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );

  const renderLive = () => (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-[1500px] mx-auto space-y-5">
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          <MetricTile label="Progress" value={`${progressPct.toFixed(1)}%`} sub={`${terminalCount} / ${totalCount} terminal`} tone="primary" />
          <MetricTile label="Completed" value={completedCount} tone="good" />
          <MetricTile label="Failed" value={failedCount} tone={failedCount > 0 ? "bad" : "neutral"} />
          <MetricTile label="Running" value={runningCount} tone={runningCount ? "primary" : "neutral"} />
          <MetricTile label="Elapsed" value={fmtElapsed(elapsedSec)} />
          <MetricTile label="ETA" value={etaSec != null && isRunning ? fmtElapsed(etaSec) : "-"} />
        </div>

        <Panel title="VectorBT Screening">
          <div className="space-y-3">
            <VectorBTReportSummary report={vectorbtScreening} />
            <div className="text-[11px] text-base-content/40">
              These rankings only choose candidate order. Freqtrade backtests remain the persisted optimizer results.
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <TrialChart data={profitData} dataKey="profit" color={C_GREEN} title="Net Profit % Per Trial" />
          <TrialChart data={drawdownData} dataKey="drawdown" color={C_RED} title="Max Drawdown % Per Trial" abs />
        </div>

        {topFiveTrials.length > 0 ? (
          <Panel title="Best So Far (Top 5)">
            <div className="space-y-4">
              {topFiveTrials.map((trial, idx) => (
                <div key={trial.trial_number} className={`p-3 rounded-lg border ${idx === 0 ? "border-primary/30 bg-primary/5" : "border-base-300 bg-base-300/20"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-base-content/70">
                      #{idx + 1} Trial {trial.trial_number}
                    </span>
                    <span className="text-xs font-mono text-base-content/50">
                      Score: {trial.metrics?.score?.toFixed(2) ?? "N/A"}
                    </span>
                  </div>
                  <BestSummary trial={trial} />
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <EmptyState>{isRunning ? "Waiting for the first completed trial." : "Run the optimizer to populate live results."}</EmptyState>
        )}

        <Panel title="Top VectorBT Candidates">
          <VectorBTTopCandidates candidates={topVectorbtCandidates} />
        </Panel>

        {phase === "completed" && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
            <span className="font-bold uppercase">OOS Validation Recommended: </span>
            Results are based on in-sample data only. Run a separate backtest on out-of-sample data (a different
            timerange) to validate stability before relying on these parameters.
          </div>
        )}

        <AutoSafeEvents events={autoLockEvents} />
      </div>
    </div>
  );

  const renderTrials = () => (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-[1500px] mx-auto space-y-5">
        <Panel
          title="Trial Comparison"
          action={checkedTrials.size > 0 && (
            <button className="btn btn-primary btn-xs" onClick={() => handleExportSelected()}>
              Export {checkedTrials.size} to Stress Lab
            </button>
          )}
        >
          {visibleTrials.length === 0 ? (
            <EmptyState>{isRunning ? "Waiting for trials to appear." : "No optimizer trials yet."}</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm w-full">
                <thead className="sticky top-0 z-10 bg-base-200">
                  <tr className="text-[10px] uppercase tracking-wider text-base-content/35">
                    <th className="w-8">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={checkedTrials.size > 0 && checkedTrials.size === visibleTrials.filter(t => t.status === "completed").length}
                        onChange={e => {
                          if (e.target.checked) setCheckedTrials(new Set(visibleTrials.filter(t => t.status === "completed").map(t => t.trial_number)));
                          else setCheckedTrials(new Set());
                        }}
                      />
                    </th>
                    <th>Trial</th>
                    <th>Status</th>
                    <th className="text-right">Score</th>
                    <th className="text-right">Profit %</th>
                    <th className="text-right">Profit Abs</th>
                    <th className="text-right">Drawdown</th>
                    <th className="text-right">Trades</th>
                    <th className="text-right">Win %</th>
                    <th className="text-right">PF</th>
                    <th className="text-right">Sharpe</th>
                    <th className="text-right">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrials.map(t => {
                    const isBest = t.trial_number === bestTrialNum;
                    const isChecked = checkedTrials.has(t.trial_number);
                    const profit = t.metrics?.net_profit_pct;
                    return (
                      <tr key={t.trial_number} className={`cursor-pointer hover:bg-base-300/35 ${isBest ? "bg-success/5" : ""}`} onClick={() => setSelectedTrial(t)}>
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs"
                            checked={isChecked}
                            disabled={t.status !== "completed"}
                            onChange={e => toggleCheck(e, t.trial_number)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="font-mono font-semibold">#{t.trial_number}{isBest && <span className="ml-2 text-success text-[10px] uppercase">best</span>}</td>
                        <td><StatusBadge status={t.status} /></td>
                        <td className="text-right font-mono font-semibold">{fmtScore(t.metrics?.score)}</td>
                        <td className={`text-right font-mono font-semibold ${profit > 0 ? "text-success" : profit < 0 ? "text-error" : "text-base-content/45"}`}>{fmtPct(profit)}</td>
                        <td className="text-right font-mono">{fmtMoney(t.metrics?.net_profit_abs)}</td>
                        <td className="text-right font-mono text-warning">{t.metrics?.max_drawdown_pct != null ? fmtPct(Math.abs(t.metrics.max_drawdown_pct), 2, false) : "-"}</td>
                        <td className={`text-right font-mono ${t.metrics?.total_trades != null && t.metrics.total_trades < MIN_TRADE_THRESHOLD ? "text-warning" : ""}`}>{t.metrics?.total_trades ?? "-"}</td>
                        <td className="text-right font-mono">{t.metrics?.win_rate_pct != null ? fmtPct(t.metrics.win_rate_pct, 1, false) : "-"}</td>
                        <td className="text-right font-mono">{fmtNum(t.metrics?.profit_factor, 3)}</td>
                        <td className="text-right font-mono">{fmtNum(t.metrics?.sharpe_ratio, 3)}</td>
                        <td className="text-right font-mono">{trialDuration(t)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <AutoSafeEvents events={autoLockEvents} />
      </div>
    </div>
  );

  const renderCandidate = () => (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="space-y-5">
          <Panel title="VectorBT Screening">
            <div className="space-y-3">
              <VectorBTReportSummary report={vectorbtScreening} />
              <div className="text-[11px] text-base-content/40">
                Pre-screening only chooses candidate order; Freqtrade backtests remain the saved optimizer results.
              </div>
            </div>
          </Panel>
          <Panel title="Top VectorBT Candidates">
            <VectorBTTopCandidates candidates={topVectorbtCandidates} />
          </Panel>
          {bestTrial ? (
            <>
              <Panel title="Best Result Summary">
                <BestSummary trial={bestTrial} />
              </Panel>
              <Panel title="Best Parameter Overrides">
                <ParamPreview trial={bestTrial} spaces={searchSpaces} />
              </Panel>
              <Panel title="Top Completed Trials">
                <div className="overflow-x-auto">
                  <table className="table table-xs w-full">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-base-content/35">
                        <th>Trial</th>
                        <th className="text-right">Score</th>
                        <th className="text-right">Profit</th>
                        <th className="text-right">Drawdown</th>
                        <th className="text-right">Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...completedWithMetrics].sort((a, b) => (b.metrics?.score ?? -Infinity) - (a.metrics?.score ?? -Infinity)).slice(0, 8).map(t => (
                        <tr key={t.trial_number} className="cursor-pointer hover:bg-base-300/35" onClick={() => setSelectedTrial(t)}>
                          <td className="font-mono">#{t.trial_number}{t.trial_number === bestTrialNum && <span className="ml-2 text-success text-[10px] uppercase">best</span>}</td>
                          <td className="text-right font-mono">{fmtScore(t.metrics?.score)}</td>
                          <td className={`text-right font-mono ${metricTone(t.metrics?.net_profit_pct) === "good" ? "text-success" : metricTone(t.metrics?.net_profit_pct) === "bad" ? "text-error" : ""}`}>{fmtPct(t.metrics?.net_profit_pct)}</td>
                          <td className="text-right font-mono text-warning">{t.metrics?.max_drawdown_pct != null ? fmtPct(Math.abs(t.metrics.max_drawdown_pct), 2, false) : "-"}</td>
                          <td className="text-right font-mono">{t.metrics?.total_trades ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : (
            <EmptyState>No best result is available yet.</EmptyState>
          )}
        </div>

        <aside className="space-y-5">
          <Panel title="Candidate Workflow">
            <div className="space-y-3">
              <button
                className="btn btn-primary btn-sm w-full"
                disabled={!bestTrial || !bestTrial.parameters || promotingCandidate || phase !== "completed"}
                onClick={() => handlePromoteCandidate()}
              >
                {promotingCandidate ? <><span className="loading loading-spinner loading-xs" />Promoting</> : "Promote Best to Candidate"}
              </button>
              <button className="btn btn-ghost btn-sm w-full border border-base-300" disabled={!bestTrial || !optSessionId} onClick={() => handleViewParams()}>
                View Best Params
              </button>
              <button className="btn btn-ghost btn-sm w-full border border-base-300" disabled={!bestTrial} onClick={() => handleExportSelected(bestTrial)}>
                Export Best to Stress Lab
              </button>
              {candidateResult && (
                <div className={`rounded-lg border px-3 py-3 text-xs ${candidateResult.ok ? "border-success/30 bg-success/10 text-success" : "border-error/30 bg-error/10 text-error"}`}>
                  {candidateResult.ok ? (
                    <>
                      <div className="font-semibold">Candidate version created</div>
                      <div className="font-mono break-all mt-1">{candidateResult.candidate_version_id}</div>
                    </>
                  ) : candidateResult.error}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Advanced / Danger Zone">
            <button className="btn btn-ghost btn-sm w-full border border-warning/30 text-warning" onClick={() => setDangerOpen(v => !v)}>
              {dangerOpen ? "Hide overwrite actions" : "Show overwrite actions"}
            </button>
            {dangerOpen && (
              <div className="mt-3 space-y-3">
                <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Overwrite writes directly into the accepted version params.json. Candidate promotion is the safer workflow.
                </div>
                <button
                  className="btn btn-warning btn-sm w-full"
                  disabled={!bestTrial || !bestTrial.parameters}
                  onClick={() => openApplyConfirm(bestTrial)}
                >
                  Overwrite Accepted with Best Trial
                </button>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );

  return (
    <>
      <div className="h-full flex flex-col overflow-hidden bg-base-100">
        <header className="shrink-0 border-b border-base-300 bg-base-200/80">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight">Parameter Optimizer</div>
              <div className="text-[10px] text-base-content/35 font-mono truncate">
                {strategyName || "No strategy selected"} {optSessionId ? `- ${optSessionId.slice(0, 8)}` : ""}
              </div>
            </div>
            {phase && <StatusBadge status={phase} />}
            <div className="hidden md:flex items-center gap-3 text-xs text-base-content/40 font-mono">
              <span>{terminalCount} / {totalCount} terminal</span>
              <span>Elapsed {fmtElapsed(elapsedSec)}</span>
              {etaSec != null && isRunning && <span>ETA {fmtElapsed(etaSec)}</span>}
              {bestTrial?.metrics?.score != null && <span>Best {fmtScore(bestTrial.metrics.score)}</span>}
              {autoLockEvents.length > 0 && <span>Auto locks {autoLockEvents.length}</span>}
            </div>
            <div className="flex-1" />
            <button className="btn btn-ghost btn-sm border border-base-300" onClick={() => setLogsOpen(v => !v)}>
              Logs {logLines.length ? `(${logLines.length})` : ""}
            </button>
            {isRunning && (
              <button onClick={handleStop} className="btn btn-ghost btn-sm border border-error/30 text-error">
                Stop
              </button>
            )}
            <button onClick={handleRun} disabled={!canRun} className="btn btn-primary btn-sm px-5">
              {isRunning ? <><span className="loading loading-spinner loading-xs" />Running</> : "Run Optimizer"}
            </button>
          </div>
          <div className="px-4 pb-3">
            <div className="h-2 rounded-full overflow-hidden bg-base-300">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%`, background: phase === "completed" ? C_GREEN : phase === "failed" ? C_RED : "#3b82f6" }}
              />
            </div>
          </div>
          <nav className="px-4 pb-2 flex gap-1 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`btn btn-xs ${activeTab === tab.id ? "btn-primary" : "btn-ghost border border-base-300"}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        {submitError && (
          <div className="shrink-0 mx-4 mt-2">
            <ErrorDisplay
              errorCode="config_error"
              title="Configuration Error"
              reason={submitError}
              severity="high"
              canAutoFix={false}
              suggestedAction="Review your optimizer settings and try again"
            />
          </div>
        )}

        {sessionError && (
          <div className="shrink-0 mx-4 mt-2">
            <ErrorDisplay
              errorCode="config_error"
              title="Session Error"
              reason={sessionError}
              severity="medium"
              canAutoFix={false}
              suggestedAction="Check the optimizer logs for more details"
            />
          </div>
        )}

        {sessionTimeout && (
          <div className="shrink-0 mx-4 mt-2">
            <ErrorDisplay
              errorCode="config_error"
              title="Long Running Session"
              reason="Session is taking longer than usual. Polling is still active, and the optimizer may continue running in the background."
              severity="low"
              canAutoFix={false}
              suggestedAction="Wait for the session to complete or check logs for progress"
            />
          </div>
        )}

        {toasts.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
              <div key={t.id} className={`px-4 py-2.5 rounded-lg border text-xs font-medium shadow-lg pointer-events-auto ${t.type === "error" ? "bg-error/15 border-error/40 text-error" : "bg-success/15 border-success/40 text-success"}`}>
                {t.message}
              </div>
            ))}
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-hidden">
          {activeTab === "setup" && renderSetup()}
          {activeTab === "parameters" && renderParameters()}
          {activeTab === "live" && renderLive()}
          {activeTab === "trials" && renderTrials()}
          {activeTab === "candidate" && renderCandidate()}
        </main>
      </div>

      {logsOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-base-300 bg-base-200 shadow-2xl" style={{ maxHeight: "45vh" }}>
          <div className="flex items-center gap-3 px-5 py-2 border-b border-base-300">
            <div className="text-xs font-bold uppercase tracking-wider text-base-content/45">Live Logs</div>
            <div className="text-[10px] font-mono text-base-content/30">{logLines.length} lines</div>
            <div className="flex-1" />
            <button className="btn btn-ghost btn-xs border border-base-300" onClick={() => setLogLines([])} disabled={!logLines.length}>Clear</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setLogsOpen(false)}>Close</button>
          </div>
          <div ref={logBoxRef} className="overflow-y-auto px-5 py-3 font-mono text-[11px] leading-relaxed" style={{ maxHeight: "calc(45vh - 42px)" }}>
            {logLines.length === 0 ? (
              <div className="text-base-content/25 italic">Logs will appear when a session starts.</div>
            ) : logLines.map((line, i) => (
              <div key={i} className={line.includes("ERROR") || line.includes("error") ? "text-error/85" : line.includes("WARN") ? "text-warning/85" : line.includes("Trial") || line.includes("trial") ? "text-primary/75" : "text-base-content/50"}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTrial && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-base-200 border-l border-base-300 shadow-2xl flex flex-col">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-base-300">
            <div>
              <div className="text-sm font-bold">Trial #{selectedTrial.trial_number}</div>
              <div className="text-[10px] text-base-content/35 font-mono">{trialDuration(selectedTrial)}</div>
            </div>
            <StatusBadge status={selectedTrial.status} />
            <div className="flex-1" />
            <button className="btn btn-ghost btn-xs" onClick={() => setSelectedTrial(null)}>Close</button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {selectedTrial.metrics && <BestSummary trial={selectedTrial} compact />}
            <ParamPreview trial={selectedTrial} spaces={searchSpaces} />
            {selectedTrial.error && <div className="rounded border border-error/30 bg-error/10 p-3 text-xs text-error">{selectedTrial.error}</div>}
          </div>
          <div className="border-t border-base-300 p-4 flex flex-wrap gap-2 justify-end">
            <button className="btn btn-ghost btn-xs border border-base-300" disabled={selectedTrial.status !== "completed"} onClick={() => handleViewParams(selectedTrial.trial_number)}>View Params</button>
            <button className="btn btn-ghost btn-xs border border-base-300" disabled={selectedTrial.status !== "completed"} onClick={() => handleExportSelected(selectedTrial)}>Export to Stress Lab</button>
            <button className="btn btn-primary btn-xs" disabled={selectedTrial.status !== "completed" || promotingCandidate} onClick={() => handlePromoteCandidate(selectedTrial)}>Promote Trial</button>
            <button className="btn btn-warning btn-xs" disabled={selectedTrial.status !== "completed"} onClick={() => openApplyConfirm(selectedTrial)}>Overwrite Accepted</button>
          </div>
        </div>
      )}

      {paramsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setParamsModalOpen(false)}>
          <div className="bg-base-200 border border-base-300 rounded-lg shadow-2xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: "82vh" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
              <div>
                <div className="text-sm font-bold">{paramsModalTitle}</div>
                <div className="text-[10px] text-base-content/40 mt-0.5">Freqtrade-compatible JSON format</div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => setParamsModalOpen(false)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {paramsLoading && <div className="py-12 text-center text-xs text-base-content/40"><span className="loading loading-spinner loading-sm" /> Loading params</div>}
              {!paramsLoading && paramsModalData?.error && <div className="text-xs text-error bg-error/10 border border-error/20 rounded px-3 py-2">{paramsModalData.error}</div>}
              {!paramsLoading && paramsModalData && !paramsModalData.error && (
                <pre className="text-[11px] font-mono text-base-content/65 bg-base-300/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(paramsModalData, null, 2)}
                </pre>
              )}
            </div>
            {!paramsLoading && paramsModalData && !paramsModalData.error && (
              <div className="px-5 py-3 border-t border-base-300 flex gap-2 justify-end">
                <button
                  className="btn btn-ghost btn-xs border border-base-300"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(paramsModalData, null, 2));
                    addToast("Params JSON copied to clipboard.", "success");
                  }}
                >
                  Copy JSON
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {applyConfirmTrial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm" onClick={() => setApplyConfirmTrial(null)}>
          <div className="bg-base-200 border border-warning/40 rounded-lg shadow-2xl w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-warning/20">
              <div className="text-sm font-bold text-warning">Overwrite Accepted Params</div>
              <div className="text-[10px] text-base-content/40 mt-1">Trial #{applyConfirmTrial.trial_number} will be written into the accepted version params.json.</div>
            </div>
            <div className="px-5 py-4 space-y-4 text-xs">
              <div className="rounded border border-warning/30 bg-warning/10 p-3 text-warning">
                This bypasses the candidate review workflow. It does not create a new version and it cannot be undone automatically.
              </div>
              {applyPreviewLoading && <div className="text-base-content/40"><span className="loading loading-spinner loading-xs" /> Loading preview</div>}
              {!applyPreviewLoading && applyPreview?.error && <div className="rounded border border-error/30 bg-error/10 p-3 text-error">{applyPreview.error}</div>}
              {!applyPreviewLoading && applyPreview && !applyPreview.error && (
                <div className="rounded border border-base-300 bg-base-300/20 p-3">
                  <div className="font-semibold mb-2 text-base-content/70">Preview loaded</div>
                  <div className="text-base-content/40">Original and modified params are available for this trial. Top-level sections: {previewChangedCount ?? "-"}</div>
                  <pre className="mt-3 max-h-56 overflow-auto text-[10px] font-mono text-base-content/50 whitespace-pre-wrap break-all">
                    {JSON.stringify(applyPreview.modified_json, null, 2)}
                  </pre>
                </div>
              )}
              <label className="form-control">
                <span className="label-text text-xs text-base-content/50 mb-1">Type {confirmToken} to confirm</span>
                <input className="input input-bordered input-sm font-mono" value={applyConfirmText} onChange={e => setApplyConfirmText(e.target.value)} />
              </label>
            </div>
            <div className="px-5 py-3 border-t border-base-300 flex gap-2 justify-end">
              <button className="btn btn-ghost btn-xs" onClick={() => setApplyConfirmTrial(null)}>Cancel</button>
              <button
                className="btn btn-warning btn-xs"
                disabled={applyConfirmText !== confirmToken}
                onClick={() => {
                  handleApplyTrial(applyConfirmTrial);
                  setApplyConfirmTrial(null);
                }}
              >
                Yes, Overwrite Accepted Params
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
