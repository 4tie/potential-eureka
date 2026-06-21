import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

/* ── Brand colours ───────────────────────────────────────────────────────── */
const C_GREEN = "#059669";
const C_RED = "#ef4444";
const C_GRID = "#27272a";
const C_MUTED = "#52525b";
const C_BLUE = "#3b82f6";
const C_ORANGE = "#f59e0b";
const C_PURPLE = "#a855f7";

/* ── Custom tooltip for candlestick ────────────────────────────────────────── */
function CandlestickTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div
      style={{
        background: "#18181b",
        border: "1px solid #3f3f46",
        borderRadius: 8,
        padding: "12px 16px",
        minWidth: 200,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#a1a1aa", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #27272a" }}>
        {data.timestamp}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <span style={{ color: "#71717a" }}>Open</span>
        <span style={{ color: "#fafafa", fontWeight: 600 }}>{data.open?.toFixed(4)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <span style={{ color: "#71717a" }}>High</span>
        <span style={{ color: "#fafafa", fontWeight: 600 }}>{data.high?.toFixed(4)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <span style={{ color: "#71717a" }}>Low</span>
        <span style={{ color: "#fafafa", fontWeight: 600 }}>{data.low?.toFixed(4)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <span style={{ color: "#71717a" }}>Close</span>
        <span style={{ color: data.close >= data.open ? C_GREEN : C_RED, fontWeight: 700 }}>
          {data.close?.toFixed(4)}
        </span>
      </div>
      {data.volume != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 6, paddingTop: 6, borderTop: "1px solid #27272a" }}>
          <span style={{ color: "#71717a" }}>Volume</span>
          <span style={{ color: "#fafafa", fontWeight: 600 }}>{data.volume?.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

/* ── Main candlestick chart component ───────────────────────────────────────── */
export default function CandlestickChart({ candlestickData, indicators = {}, height = 400 }) {
  const chartData = useMemo(() => {
    if (!candlestickData || !candlestickData.timestamps) return [];
    
    const { timestamps, open, high, low, close, volume } = candlestickData;
    const maxLength = Math.max(
      timestamps.length,
      open.length,
      high.length,
      low.length,
      close.length,
      volume.length
    );
    
    return Array.from({ length: maxLength }, (_, i) => ({
      timestamp: timestamps[i] || "",
      open: open[i] ?? 0,
      high: high[i] ?? 0,
      low: low[i] ?? 0,
      close: close[i] ?? 0,
      volume: volume[i] ?? 0,
      // Add indicator data
      ...(indicators.sma?.sma_20 && { sma20: indicators.sma.sma_20[i] ?? null }),
      ...(indicators.sma?.sma_50 && { sma50: indicators.sma.sma_50[i] ?? null }),
      ...(indicators.ema?.ema_12 && { ema12: indicators.ema.ema_12[i] ?? null }),
      ...(indicators.ema?.ema_26 && { ema26: indicators.ema.ema_26[i] ?? null }),
      ...(indicators.bollinger?.upper && { bbUpper: indicators.bollinger.upper[i] ?? null }),
      ...(indicators.bollinger?.middle && { bbMiddle: indicators.bollinger.middle[i] ?? null }),
      ...(indicators.bollinger?.lower && { bbLower: indicators.bollinger.lower[i] ?? null }),
    }));
  }, [candlestickData, indicators]);

  if (chartData.length === 0) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        color: C_MUTED,
        fontSize: 13,
      }}>
        No candlestick data available
      </div>
    );
  }

  // Calculate Y-axis domain
  const allValues = chartData.flatMap(d => [d.low, d.high]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const pad = (maxVal - minVal) * 0.05 || 0.01;
  const yDomain = [minVal - pad, maxVal + pad];

  // X-axis interval for labels
  const xInterval = Math.max(1, Math.floor(chartData.length / 8));

  return (
    <div style={{ width: "100%", minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 24 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={C_GRID}
            strokeOpacity={0.6}
            vertical={false}
          />

          <XAxis
            dataKey="timestamp"
            interval={xInterval - 1}
            tick={{ fill: C_MUTED, fontSize: 10 }}
            axisLine={{ stroke: C_GRID }}
            tickLine={false}
            height={32}
          />

          <YAxis
            domain={yDomain}
            tickFormatter={(v) => v.toFixed(4)}
            tick={{ fill: C_MUTED, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />

          <Tooltip content={<CandlestickTooltip />} cursor={{ stroke: C_MUTED, strokeWidth: 1, strokeOpacity: 0.3 }} />

          {/* Bollinger Bands */}
          {indicators.bollinger?.upper && (
            <>
              <Line
                type="monotone"
                dataKey="bbUpper"
                stroke={C_PURPLE}
                strokeWidth={1}
                strokeOpacity={0.5}
                dot={false}
                activeDot={false}
                name="BB Upper"
              />
              <Line
                type="monotone"
                dataKey="bbMiddle"
                stroke={C_PURPLE}
                strokeWidth={1}
                strokeOpacity={0.3}
                strokeDasharray="4 3"
                dot={false}
                activeDot={false}
                name="BB Middle"
              />
              <Line
                type="monotone"
                dataKey="bbLower"
                stroke={C_PURPLE}
                strokeWidth={1}
                strokeOpacity={0.5}
                dot={false}
                activeDot={false}
                name="BB Lower"
              />
            </>
          )}

          {/* Moving Averages */}
          {indicators.sma?.sma_50 && (
            <Line
              type="monotone"
              dataKey="sma50"
              stroke={C_BLUE}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              name="SMA 50"
            />
          )}
          {indicators.sma?.sma_20 && (
            <Line
              type="monotone"
              dataKey="sma20"
              stroke={C_ORANGE}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              name="SMA 20"
            />
          )}
          {indicators.ema?.ema_12 && (
            <Line
              type="monotone"
              dataKey="ema12"
              stroke={C_GREEN}
              strokeWidth={1}
              strokeDasharray="2 2"
              dot={false}
              activeDot={false}
              name="EMA 12"
            />
          )}
          {indicators.ema?.ema_26 && (
            <Line
              type="monotone"
              dataKey="ema26"
              stroke={C_RED}
              strokeWidth={1}
              strokeDasharray="2 2"
              dot={false}
              activeDot={false}
              name="EMA 26"
            />
          )}

          {/* Price line (close) */}
          <Line
            type="monotone"
            dataKey="close"
            stroke="#ffffff"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: "#ffffff" }}
            name="Close"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
