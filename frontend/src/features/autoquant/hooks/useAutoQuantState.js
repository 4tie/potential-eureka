/**
 * useAutoQuantState - Hook for AutoQuant pipeline state
 */

import { useState, useCallback, useEffect, useRef } from "react";
import api from "../../../services/api";

export function useAutoQuantState() {
  const [runs, setRuns] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);

  // Load all runs
  const loadRuns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.autoquant.listRuns();
      setRuns(data.runs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load single run details
  const loadRun = useCallback(async (runId) => {
    try {
      setError(null);
      const data = await api.autoquant.getStatus(runId);
      setCurrentRun(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Start new pipeline
  const startPipeline = useCallback(async (strategy) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.autoquant.startRun({ strategy });
      await loadRuns(); // Refresh list
      await loadRun(data.run_id); // Load new run
      return data.run_id;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadRuns, loadRun]);

  // Cancel pipeline
  const cancelRun = useCallback(async (runId) => {
    try {
      setError(null);
      await api.autoquant.cancelRun(runId);
      await loadRun(runId); // Refresh
    } catch (err) {
      setError(err.message);
    }
  }, [loadRun]);

  // Connect to WebSocket for live updates
  const connectWebSocket = useCallback((runId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = api.autoquant.connectWebSocket(runId);

    ws.onopen = () => {
      console.log("[AutoQuant] WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.data) {
          setCurrentRun((prev) => ({
            ...prev,
            ...msg.data,
            progress: msg.data.progress ?? msg.progress ?? prev?.progress ?? 0,
            current_stage: msg.stage || prev?.current_stage || "",
            status: msg.status || prev?.status || "",
          }));
        }
      } catch (err) {
        console.error("[AutoQuant] WebSocket message error:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("[AutoQuant] WebSocket error:", err);
      setError("WebSocket connection failed");
    };

    ws.onclose = () => {
      console.log("[AutoQuant] WebSocket disconnected");
    };

    wsRef.current = ws;
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    runs,
    currentRun,
    setCurrentRun,
    loading,
    error,
    loadRuns,
    loadRun,
    startPipeline,
    cancelRun,
    connectWebSocket,
  };
}
