import { useState, useCallback } from "react";
import { screenPairs as screenPairsRequest } from "../api";

export default function useAutoQuantScreening() {
  const [showScreener, setShowScreener] = useState(false);
  const [screenPairs, setScreenPairs] = useState("BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,ADA/USDT");
  const [screening, setScreening] = useState(false);
  const [screenResults, setScreenResults] = useState([]);
  const [screenError, setScreenError] = useState(null);
  const [selectedPair, setSelectedPair] = useState(null);

  const handleScreenPairs = useCallback(async (form) => {
    if (!form.strategy || !screenPairs.trim()) return;
    setScreening(true);
    setScreenResults([]);
    setScreenError(null);
    const pairList = screenPairs
      .split(/[,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const payload = {
      strategy: form.strategy,
      timeframe: form.timeframe,
      date_range: form.in_sample_range,
      pairs: pairList,
      exchange: form.exchange,
      config_file: null,
    };
    try {
      const data = await screenPairsRequest(payload);
      setScreenResults(data.results || []);
      if (data.errors?.length > 0) {
        setScreenError(
          `${data.errors.length} pair(s) had errors: ${data.errors.slice(0, 3).join("; ")}`
        );
      }
    } catch (err) {
      setScreenError(err.message);
    } finally {
      setScreening(false);
    }
  }, [screenPairs]);

  return {
    showScreener,
    setShowScreener,
    screenPairs,
    setScreenPairs,
    screening,
    setScreening,
    screenResults,
    setScreenResults,
    screenError,
    setScreenError,
    selectedPair,
    setSelectedPair,
    handleScreenPairs,
  };
}
