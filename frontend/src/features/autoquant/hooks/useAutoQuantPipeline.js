import { useState, useRef, useCallback, useEffect } from "react";
import { playChime } from "../utils";
import api from "../../../services/api";
import { mapEventToStageIndex } from "../eventToStepMapper";

const TERMINAL_STATUSES = new Set(["completed", "failed", "interrupted", "cancelled"]);
const ACTIVE_STATUSES = new Set(["pending", "running", "awaiting_user_approval"]);

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return {
    ...snapshot,
    stages: Array.isArray(snapshot.stages) ? snapshot.stages : [],
    wfo_windows: Array.isArray(snapshot.wfo_windows) ? snapshot.wfo_windows : [],
    recent_events: Array.isArray(snapshot.recent_events) ? snapshot.recent_events : [],
  };
}

function mergeSnapshot(prev, snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  if (!normalized) return prev;
  return {
    ...(prev || {}),
    ...normalized,
    stages: normalized.stages.length > 0 ? normalized.stages : prev?.stages || [],
  };
}

function eventLogKey(event) {
  return [
    event.ts || "",
    event.type || "",
    event.stage ?? "",
    event.status || "",
    event.message || "",
  ].join("|");
}

function eventToLogLine(event) {
  if (!event || !event.message) return "";
  if (event.status === "log") return event.message;
  const stage = event.stage != null && event.stage >= 0 ? `Stage ${event.stage}` : "Pipeline";
  const status = event.status ? ` ${event.status}` : "";
  return `[${stage}${status}] ${event.message}`;
}

export default function useAutoQuantPipeline(initialPipelineState = null) {
  const [runId, setRunId] = useState(initialPipelineState?.run_id ?? null);
  const [pipelineState, setPipelineState] = useState(initialPipelineState);
  const [logLines, setLogLines] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [report, setReport] = useState(null);
  const [fitnessCurve, setFitnessCurve] = useState([]);
  const [hyperoptProgress, setHyperoptProgress] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [runStartedAtMs, setRunStartedAtMs] = useState(null);
  const [wfoWindows, setWfoWindows] = useState([]);
  const [dataHealingStatus, setDataHealingStatus] = useState(null);
  const [pairStatusMap, setPairStatusMap] = useState({});

  const elapsedRef = useRef(null);
  const startTimeRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const connectWsRef = useRef(null);
  const statusRequestRef = useRef(false);
  const latestStatusRef = useRef(initialPipelineState?.status ?? null);
  const completedNotifiedRef = useRef(initialPipelineState?.status === "completed");
  const seenLogEventsRef = useRef(new Set());
  const manuallyClosedSocketsRef = useRef(new WeakSet());
  const maxReconnectAttempts = 10;

  useEffect(() => {
    latestStatusRef.current = pipelineState?.status ?? null;
  }, [pipelineState?.status]);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearElapsedTimer = useCallback(() => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, []);

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      manuallyClosedSocketsRef.current.add(ws);
      ws.close();
    }
  }, []);

  const appendLogLine = useCallback((line) => {
    if (!line) return;
    setLogLines((prev) => [...prev, line].slice(-1200));
  }, []);

  const appendEventLog = useCallback((event) => {
    const line = eventToLogLine(event);
    if (!line) return;
    const key = eventLogKey(event);
    if (seenLogEventsRef.current.has(key)) return;
    seenLogEventsRef.current.add(key);
    appendLogLine(line);
  }, [appendLogLine]);

  const stopLiveTimersForStatus = useCallback((status) => {
    if (status === "awaiting_user_approval" || isTerminalStatus(status)) {
      clearElapsedTimer();
    }
    if (status === "awaiting_user_approval" || isTerminalStatus(status)) {
      clearReconnectTimeout();
    }
    if (isTerminalStatus(status)) {
      closeWebSocket();
    }
  }, [clearElapsedTimer, clearReconnectTimeout, closeWebSocket]);

  const applySnapshot = useCallback((snapshot) => {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) return;

    setPipelineState((prev) => mergeSnapshot(prev, normalized));
    latestStatusRef.current = normalized.status ?? latestStatusRef.current;

    if (normalized.report) {
      setReport(normalized.report);
    }
    if (normalized.wfo_windows) {
      setWfoWindows(normalized.wfo_windows);
    }
    if (normalized.created_at) {
      setRunStartedAtMs((prev) => {
        if (prev) return prev;
        const createdAtMs = new Date(normalized.created_at).getTime();
        return Number.isNaN(createdAtMs) ? null : createdAtMs;
      });
    }
    normalized.recent_events.forEach(appendEventLog);

    stopLiveTimersForStatus(normalized.status);
    if (normalized.status === "completed" && !completedNotifiedRef.current) {
      completedNotifiedRef.current = true;
      playChime();
    }
  }, [appendEventLog, stopLiveTimersForStatus]);

  const applyStageEvent = useCallback((msg) => {
    const stageIndex = Number(msg.stage);
    if (!Number.isFinite(stageIndex)) return;

    setPipelineState((prev) => {
      if (!prev) return prev;
      const stages = [...(prev.stages || [])];
      const idx = stages.findIndex((stage) => stage.index === stageIndex);
      if (idx >= 0) {
        const previous = stages[idx] || {};
        stages[idx] = {
          ...previous,
          status: msg.status === "log" ? previous.status : msg.status || previous.status,
          message: msg.message || previous.message || "",
          data: msg.data ? { ...(previous.data || {}), ...msg.data } : previous.data || {},
          started_at: msg.started_at ?? previous.started_at,
          duration_s: msg.duration_s ?? previous.duration_s,
        };
      }

      return {
        ...prev,
        current_stage: stageIndex > 0 ? Math.max(prev.current_stage || 0, stageIndex) : prev.current_stage,
        progress: msg.progress >= 0 ? msg.progress : prev.progress,
        progress_percent: msg.progress >= 0 ? msg.progress : prev.progress_percent,
        stages,
      };
    });

    appendEventLog(msg);
  }, [appendEventLog]);

  const handleWsMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "keepalive") return;

      if (msg.type === "snapshot" || msg.type === "final") {
        applySnapshot(msg.data || msg);
        if (msg.type === "final") {
          stopLiveTimersForStatus(msg.status);
        }
        return;
      }

      if (msg.type === "fitness_point") {
        setFitnessCurve((prev) => [...prev, msg.point]);
        return;
      }
      if (msg.type === "hyperopt_progress") {
        setHyperoptProgress(msg.progress);
        return;
      }
      if (msg.type === "wfo_window") {
        setWfoWindows((prev) => [...prev, msg.window]);
        return;
      }
      if (msg.type === "data_healing_status") {
        setDataHealingStatus(msg.status);
        return;
      }
      if (msg.type === "pair_status") {
        setPairStatusMap((prev) => ({ ...prev, [msg.pair]: msg.status }));
        return;
      }

      if (msg.status === "log") {
        appendEventLog(msg);
        return;
      }

      // Handle event types that map to specific stages
      if (msg.msg_type || msg.type) {
        const eventType = msg.msg_type || msg.type;
        const stageIndex = mapEventToStageIndex(eventType);
        if (stageIndex >= 0) {
          // Route this event to the appropriate stage
          applyStageEvent({
            ...msg,
            stage: stageIndex,
            status: msg.status || "running",
          });
          appendEventLog(msg);
          return;
        }
      }

      if (msg.stage != null && msg.status) {
        applyStageEvent(msg);
        return;
      }

      if (msg.type === "pipeline_complete") {
        applySnapshot({ status: "completed", completed_at: new Date().toISOString() });
      } else if (msg.type === "pipeline_failed") {
        applySnapshot({ status: "failed", completed_at: new Date().toISOString() });
      } else if (msg.type === "pipeline_interrupted") {
        applySnapshot({ status: "interrupted", completed_at: new Date().toISOString() });
      }
    } catch (err) {
      console.error("Failed to parse WebSocket message:", err);
    }
  }, [appendEventLog, applySnapshot, applyStageEvent, stopLiveTimersForStatus]);

  const connectWs = useCallback((targetRunId = runId) => {
    if (!targetRunId) return;

    clearReconnectTimeout();
    setIsConnecting(true);

    if (wsRef.current) {
      const previousWs = wsRef.current;
      manuallyClosedSocketsRef.current.add(previousWs);
      previousWs.close();
      wsRef.current = null;
    }

    const ws = api.autoquant.connectWebSocket(targetRunId);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = handleWsMessage;

    ws.onerror = (err) => {
      console.debug("WebSocket error:", err);
      setIsConnecting(false);
    };

    ws.onclose = async (event = {}) => {
      setIsConnecting(false);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (manuallyClosedSocketsRef.current.has(ws)) {
        return;
      }

      const currentStatus = latestStatusRef.current;

      // Do not reconnect if run is in terminal state
      if (isTerminalStatus(currentStatus)) {
        console.debug(`AutoQuant WebSocket closed; run is ${currentStatus}, not reconnecting`);
        return;
      }

      // Before reconnecting, sync status to check if run still exists
      const statusData = await syncStatus(targetRunId);
      if (!statusData) {
        console.debug(`AutoQuant WebSocket closed; run not found, not reconnecting`);
        return;
      }

      // Check if run is terminal after sync
      if (isTerminalStatus(statusData.status)) {
        console.debug(`AutoQuant WebSocket closed; run is ${statusData.status}, not reconnecting`);
        return;
      }

      const shouldReconnect = reconnectAttemptsRef.current < maxReconnectAttempts;

      if (shouldReconnect) {
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        console.debug(`AutoQuant WebSocket closed (${event.code || "unknown"}); reconnecting in ${delay}ms`);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectWsRef.current?.(targetRunId);
        }, delay);
      } else {
        console.debug(`AutoQuant WebSocket closed; max reconnect attempts reached`);
      }
    };
  }, [runId, clearReconnectTimeout, handleWsMessage, syncStatus]);

  const startElapsedTimer = useCallback(() => {
    clearElapsedTimer();
    startTimeRef.current = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, [clearElapsedTimer]);

  const syncStatus = useCallback(async (targetRunId = runId) => {
    if (!targetRunId || statusRequestRef.current) return null;
    statusRequestRef.current = true;
    try {
      const data = await api.autoquant.getStatus(targetRunId);
      applySnapshot(data);
      return data;
    } catch (err) {
      console.debug("Failed to sync AutoQuant status:", err);
      return null;
    } finally {
      statusRequestRef.current = false;
    }
  }, [runId, applySnapshot]);

  const resetPipelineState = useCallback(() => {
    clearElapsedTimer();
    clearReconnectTimeout();
    closeWebSocket();
    setLogLines([]);
    setFitnessCurve([]);
    setHyperoptProgress(null);
    setElapsedSeconds(0);
    setRunStartedAtMs(null);
    setWfoWindows([]);
    setDataHealingStatus(null);
    setPairStatusMap({});
    seenLogEventsRef.current.clear();
    reconnectAttemptsRef.current = 0;
    completedNotifiedRef.current = false;
  }, [clearElapsedTimer, clearReconnectTimeout, closeWebSocket]);

  const loadReport = useCallback(async (currentRunId) => {
    if (!currentRunId) return null;
    try {
      const data = await api.autoquant.getReport(currentRunId);
      setReport(data);
      return data;
    } catch (err) {
      console.error("Failed to load report:", err);
      return null;
    }
  }, []);

  const startPipeline = useCallback(async (payload) => {
    try {
      resetPipelineState();
      const data = await api.autoquant.startRun(payload);
      setRunId(data.run_id);
      setPipelineState({ run_id: data.run_id, status: "running", created_at: new Date().toISOString() });
      setRunStartedAtMs(Date.now());
      latestStatusRef.current = "running";
      startElapsedTimer();
      return data.run_id;
    } catch (err) {
      console.error("Failed to start pipeline:", err);
      throw err;
    }
  }, [resetPipelineState, startElapsedTimer]);

  const resumePipeline = useCallback(async (approvedPairs) => {
    if (!runId) return null;
    const pairs = (approvedPairs || []).filter(Boolean);
    try {
      const data = await api.autoquant.resumeRun(runId, pairs);
      setPipelineState((prev) => ({
        ...(prev || {}),
        status: "running",
        current_stage: data.current_stage || prev?.current_stage || 2,
        user_approved_pairs: pairs,
      }));
      latestStatusRef.current = "running";
      reconnectAttemptsRef.current = 0;
      startElapsedTimer();
      connectWs(runId);
      await syncStatus(runId);
      return data;
    } catch (err) {
      console.error("Failed to resume pipeline:", err);
      throw err;
    }
  }, [runId, startElapsedTimer, connectWs, syncStatus]);

  const cancelPipeline = useCallback(async () => {
    if (!runId) return;
    try {
      await api.autoquant.cancelRun(runId);
      applySnapshot({ status: "cancelled", completed_at: new Date().toISOString() });
    } catch (err) {
      console.error("Failed to cancel pipeline:", err);
      throw err;
    }
  }, [runId, applySnapshot]);

  useEffect(() => {
    const load = async () => {
      if (pipelineState?.status === "completed" && runId && !report) {
        await loadReport(runId);
      }
    };
    load();
  }, [pipelineState?.status, runId, report, loadReport]);

  useEffect(() => {
    if (!runId || pipelineState?.status !== "running") return undefined;
    const connectTimer = setTimeout(() => connectWs(runId), 0);
    return () => {
      clearTimeout(connectTimer);
      clearReconnectTimeout();
      closeWebSocket();
    };
  }, [runId, pipelineState?.status, connectWs, clearReconnectTimeout, closeWebSocket]);

  useEffect(() => {
    if (!runId || !ACTIVE_STATUSES.has(pipelineState?.status)) return undefined;
    const initialSyncTimer = setTimeout(() => syncStatus(runId), 0);
    const delay = pipelineState?.status === "awaiting_user_approval" ? 5000 : 2000;
    const timer = setInterval(() => syncStatus(runId), delay);
    return () => {
      clearTimeout(initialSyncTimer);
      clearInterval(timer);
    };
  }, [runId, pipelineState?.status, syncStatus]);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    return () => {
      clearElapsedTimer();
      clearReconnectTimeout();
      closeWebSocket();
    };
  }, [clearElapsedTimer, clearReconnectTimeout, closeWebSocket]);

  return {
    runId,
    setRunId,
    pipelineState,
    setPipelineState,
    logLines,
    setLogLines,
    isConnecting,
    report,
    setReport,
    fitnessCurve,
    setFitnessCurve,
    hyperoptProgress,
    setHyperoptProgress,
    elapsedSeconds,
    runStartedAtMs,
    setRunStartedAtMs,
    wfoWindows,
    setWfoWindows,
    dataHealingStatus,
    setDataHealingStatus,
    pairStatusMap,
    setPairStatusMap,
    startPipeline,
    resumePipeline,
    cancelPipeline,
    loadReport,
    syncStatus,
    resetPipelineState,
  };
}
