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
    include_rsi: false,
    include_macd: false,
    include_bollinger: false,
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

  useEffect(() => {
    if (!runId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChartData(indicators);
  }, [runId, indicators, loadChartData]);

  const toggleIndicator = (key) => {
    setIndicators(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!runId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-base-content/40 gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <div className="text-lg font-medium">No run selected</div>
        <div className="text-sm opacity-70">Select a run to view chart data</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-error gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9.75 9.75 0 11-9.75 9.75 0 009.75 9.75zm0 0v3.75m0-9h9" />
        </svg>
        <div className="text-lg font-medium">Error loading chart</div>
        <div className="text-sm opacity-70">{error}</div>
        <button 
          onClick={() => loadChartData(indicators)}
          className="btn btn-sm btn-outline btn-error mt-2"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-base-content/40 gap-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <div className="text-lg font-medium">No chart data available</div>
        <div className="text-sm opacity-70">Chart data will appear here when available</div>
      </div>
    );
  }

  const hasCandlestickData = chartData.candlestick && 
    chartData.candlestick.timestamps && 
    chartData.candlestick.timestamps.length > 0;

  if (!hasCandlestickData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-base-content/40 gap-4 p-8 bg-base-200/30 rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0L3 20.25" />
        </svg>
        <div className="text-lg font-medium">No trading data available</div>
        <div className="text-sm opacity-70 max-w-md text-center">
          {runType === "autoquant" 
            ? "This AutoQuant run did not generate trade data for charting" 
            : "This backtest run did not generate trade data"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Indicator Controls */}
      <div className="bg-base-100 border border-base-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-base-content/70 uppercase tracking-wider">Indicators</span>
            
            {['sma', 'ema', 'rsi', 'macd', 'bollinger'].map((ind) => (
              <button
                key={ind}
                onClick={() => toggleIndicator(`include_${ind}`)}
                className={`btn btn-xs ${
                  indicators[`include_${ind}`] 
                    ? 'btn-primary' 
                    : 'btn-ghost'
                }`}
              >
                {ind.toUpperCase()}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => loadChartData(indicators)}
            disabled={loading}
            className="btn btn-circle btn-ghost btn-sm"
            title="Refresh chart"
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Candlestick Chart */}
      <div className="bg-base-100 border border-base-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-base-content">Price Action</h3>
          <div className="badge badge-ghost badge-sm text-xs">
            {chartData.candlestick.timestamps.length} candles
          </div>
        </div>
        <CandlestickChart 
          candlestickData={chartData.candlestick} 
          indicators={chartData.indicators}
          height={350}
        />
      </div>

      {/* Technical Indicators */}
      {(indicators.include_rsi || indicators.include_macd) && (
        <div className="bg-base-100 border border-base-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-base-content">Technical Indicators</h3>
            <div className="flex gap-2">
              {indicators.include_rsi && <span className="badge badge-primary badge-xs">RSI</span>}
              {indicators.include_macd && <span className="badge badge-secondary badge-xs">MACD</span>}
            </div>
          </div>
          <TechnicalIndicatorsChart 
            indicators={chartData.indicators}
            height={250}
          />
        </div>
      )}

      {/* Compact Legend */}
      <div className="bg-base-100 border border-base-200 rounded-xl p-4 shadow-sm">
        <h4 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider mb-3">Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-base-content" />
            <span className="text-base-content/60">Close</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-blue-500" />
            <span className="text-base-content/60">SMA 50</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-orange-500" />
            <span className="text-base-content/60">SMA 20</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t border-dashed border-green-500" />
            <span className="text-base-content/60">EMA 12</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0 border-t border-dashed border-red-500" />
            <span className="text-base-content/60">EMA 26</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-purple-500" />
            <span className="text-base-content/60">Bollinger</span>
          </div>
        </div>
      </div>
    </div>
  );
}
