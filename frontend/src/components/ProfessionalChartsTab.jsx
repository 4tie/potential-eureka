import { useState, useEffect, useCallback } from "react";
import CandlestickChart from "./chartComponents/CandlestickChart";
import TechnicalIndicatorsChart from "./chartComponents/TechnicalIndicatorsChart";

export default function ProfessionalChartsTab({ runId, runType = "backtest" }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [indicators, setIndicators] = useState({
    include_sma: true,
    include_ema: true,
    include_rsi: true,
    include_macd: true,
    include_bollinger: true,
  });

  const loadChartData = useCallback(async (currentIndicators) => {
    setLoading(true);
    setError(null);
    
    try {
      const endpoint = runType === "autoquant" 
        ? `/api/charts/autoquant/${runId}/candlestick`
        : `/api/charts/backtest/${runId}/candlestick`;
      
      const params = new URLSearchParams({
        include_sma: currentIndicators.include_sma,
        include_ema: currentIndicators.include_ema,
        include_rsi: currentIndicators.include_rsi,
        include_macd: currentIndicators.include_macd,
        include_bollinger: currentIndicators.include_bollinger,
      });
      
      const response = await fetch(`${endpoint}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load chart data: ${response.statusText}`);
      }
      
      const data = await response.json();
      setChartData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [runId, runType]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!runId) return;
    loadChartData(indicators);
  }, [runId, indicators, loadChartData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleIndicator = (key) => {
    setIndicators(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-64 text-base-content/40">
        No run selected
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-error">
        {error}
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-64 text-base-content/40">
        No chart data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Indicator Controls */}
      <div className="bg-base-200 border border-base-300 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-base-content/70">Indicators:</span>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.include_sma}
              onChange={() => toggleIndicator('include_sma')}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm text-base-content/70">SMA</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.include_ema}
              onChange={() => toggleIndicator('include_ema')}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm text-base-content/70">EMA</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.include_rsi}
              onChange={() => toggleIndicator('include_rsi')}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm text-base-content/70">RSI</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.include_macd}
              onChange={() => toggleIndicator('include_macd')}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm text-base-content/70">MACD</span>
          </label>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={indicators.include_bollinger}
              onChange={() => toggleIndicator('include_bollinger')}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm text-base-content/70">Bollinger Bands</span>
          </label>
        </div>
      </div>

      {/* Candlestick Chart */}
      <div className="bg-base-200 border border-base-300 rounded-lg p-5">
        <h3 className="text-lg font-semibold text-base-content mb-4">Price Action (Candlestick)</h3>
        <CandlestickChart 
          candlestickData={chartData.candlestick} 
          indicators={chartData.indicators}
          height={400}
        />
      </div>

      {/* Technical Indicators */}
      {(indicators.include_rsi || indicators.include_macd) && (
        <div className="bg-base-200 border border-base-300 rounded-lg p-5">
          <h3 className="text-lg font-semibold text-base-content mb-4">Technical Indicators</h3>
          <TechnicalIndicatorsChart 
            indicators={chartData.indicators}
            height={300}
          />
        </div>
      )}

      {/* Legend */}
      <div className="bg-base-200 border border-base-300 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-base-content/70 mb-3">Chart Legend</h4>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-white" />
            <span className="text-base-content/60">Close Price</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-500" />
            <span className="text-base-content/60">SMA 50</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-orange-500" />
            <span className="text-base-content/60">SMA 20</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0 border-t border-dashed border-green-500" />
            <span className="text-base-content/60">EMA 12</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0 border-t border-dashed border-red-500" />
            <span className="text-base-content/60">EMA 26</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-purple-500" />
            <span className="text-base-content/60">Bollinger Bands</span>
          </div>
        </div>
      </div>
    </div>
  );
}
