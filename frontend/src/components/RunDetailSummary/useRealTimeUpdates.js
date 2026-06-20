import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook for real-time updates of run data
 * Supports WebSocket connections with polling fallback
 */
const useRealTimeUpdates = (run, enabled = true, interval = 5000) => {
  const [liveData, setLiveData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const wsRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const previousDataRef = useRef(null);

  // Fetch run data via HTTP (polling fallback)
  const fetchRunData = useCallback(async () => {
    if (!run?.run_id) return;

    try {
      const response = await fetch(`/api/auto-quant/run/${run.run_id}`);
      if (!response.ok) throw new Error("Failed to fetch run data");
      
      const data = await response.json();
      
      // Only update if data has changed
      if (JSON.stringify(data) !== JSON.stringify(previousDataRef.current)) {
        setLiveData(data);
        setLastUpdate(new Date());
        previousDataRef.current = data;
      }
      
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching run data:", err);
    }
  }, [run]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!enabled || !run?.run_id) return;

    const wsUrl = `ws://localhost:5011/ws/run/${run.run_id}`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        console.log("WebSocket connected");
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Only update if data has changed
          if (JSON.stringify(data) !== JSON.stringify(previousDataRef.current)) {
            setTimeout(() => {
              setLiveData(data);
              setLastUpdate(new Date());
              previousDataRef.current = data;
            }, 0);
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };
      
      wsRef.current.onerror = (err) => {
        console.error("WebSocket error:", err);
        setError("WebSocket connection error");
        setIsConnected(false);
      };
      
      wsRef.current.onclose = () => {
        setIsConnected(false);
        console.log("WebSocket disconnected, falling back to polling");
        
        // Start polling as fallback
        setTimeout(() => {
          pollIntervalRef.current = setInterval(fetchRunData, interval);
          setIsPolling(true);
        }, 0);
      };
    } catch (err) {
      console.error("Error creating WebSocket:", err);
      setTimeout(() => setError("Failed to establish WebSocket connection"), 0);
      
      // Start polling immediately if WebSocket fails
      setTimeout(() => {
        pollIntervalRef.current = setInterval(fetchRunData, interval);
      }, 0);
    }

    // Cleanup
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [enabled, run, interval, fetchRunData, setIsPolling]);

  // Manual refresh function
  const refresh = () => {
    fetchRunData();
  };

  // Toggle updates
  const toggleUpdates = () => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      } else {
        // Reconnect
        const wsUrl = `ws://localhost:5011/ws/run/${run.run_id}`;
        wsRef.current = new WebSocket(wsUrl);
      }
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    } else {
      pollIntervalRef.current = setInterval(fetchRunData, interval);
    }
  };

  return {
    liveData: liveData || run,
    isConnected,
    lastUpdate,
    error,
    refresh,
    toggleUpdates,
    isLive: enabled && (isConnected || isPolling),
  };
};

export default useRealTimeUpdates;
