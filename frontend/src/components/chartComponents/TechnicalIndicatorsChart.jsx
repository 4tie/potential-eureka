import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

/* ── Brand colours ───────────────────────────────────────────────────────── */
const C_GREEN = "#059669";
const C_RED = "#ef4444";
const C_GRID = "#27272a";
const C_MUTED = "#52525b";
const C_BLUE = "#3b82f6";
const C_ORANGE = "#f59e0b";

/* ── Custom tooltip for technical indicators ───────────────────────────────── */
function IndicatorTooltip({ active, payload, indicatorType }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  if (indicatorType === "rsi") {
    return (
      <div
        style={{
          background: "#18181b",
          border: "1px solid #3f3f46",
          borderRadius: 8,
          padding: "10px 14px",
          minWidth: 150,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
        }}
      >
        <div style={{ color: "#a1a1aa", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #27272a" }}>
          {data.timestamp}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "#71717a" }}>RSI</span>
          <span style={{ 
            color: data.rsi >= 70 ? C_RED : data.rsi <= 30 ? C_GREEN : "#fafafa",
            fontWeight: 700 
          }}>
            {data.rsi?.toFixed(2)}
          </span>
        </div>
      </div>
    );
  }

  if (indicatorType === "macd") {
    return (
      <div
        style={{
          background: "#18181b",
          border: "1px solid #3f3f46",
          borderRadius: 8,
          padding: "10px 14px",
          minWidth: 180,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
        }}
      >
        <div style={{ color: "#a1a1aa", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #27272a" }}>
          {data.timestamp}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
          <span style={{ color: "#71717a" }}>MACD</span>
          <span style={{ color: C_BLUE, fontWeight: 600 }}>{data.macd?.toFixed(4)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
          <span style={{ color: "#71717a" }}>Signal</span>
          <span style={{ color: C_ORANGE, fontWeight: 600 }}>{data.signal?.toFixed(4)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 6, paddingTop: 4, borderTop: "1px solid #27272a" }}>
          <span style={{ color: "#71717a" }}>Histogram</span>
          <span style={{ 
            color: data.histogram >= 0 ? C_GREEN : C_RED,
            fontWeight: 700 
          }}>
            {data.histogram?.toFixed(4)}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

/* ── RSI Chart Component ───────────────────────────────────────────────────── */
export function RSIChart({ indicators, height = 150 }) {
  const chartData = useMemo(() => {
    if (!indicators?.rsi) return [];
    return indicators.rsi.map((value, i) => ({
      index: i,
      rsi: value ?? 50,
    }));
  }, [indicators]);

  if (chartData.length === 0) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        color: C_MUTED,
        fontSize: 12,
      }}>
        No RSI data available
      </div>
    );
  }

  return (
    <div style={{ width: "100%", minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 16 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={C_GRID}
            strokeOpacity={0.4}
            vertical={false}
          />

          <XAxis
            dataKey="index"
            tick={{ fill: C_MUTED, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            domain={[0, 100]}
            tickFormatter={(v) => v.toFixed(0)}
            tick={{ fill: C_MUTED, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />

          <Tooltip content={<IndicatorTooltip indicatorType="rsi" />} cursor={{ stroke: C_MUTED, strokeWidth: 1, strokeOpacity: 0.3 }} />

          {/* Overbought/Oversold lines */}
          <ReferenceLine y={70} stroke={C_RED} strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5} />
          <ReferenceLine y={30} stroke={C_GREEN} strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5} />
          <ReferenceLine y={50} stroke={C_MUTED} strokeDasharray="2 2" strokeWidth={1} strokeOpacity={0.3} />

          <Line
            type="monotone"
            dataKey="rsi"
            stroke={C_BLUE}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: C_BLUE }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── MACD Chart Component ──────────────────────────────────────────────────── */
export function MACDChart({ indicators, height = 150 }) {
  const chartData = useMemo(() => {
    if (!indicators?.macd) return [];
    const { macd, signal, histogram } = indicators.macd;
    const maxLength = Math.max(macd.length, signal.length, histogram.length);
    
    return Array.from({ length: maxLength }, (_, i) => ({
      index: i,
      macd: macd[i] ?? 0,
      signal: signal[i] ?? 0,
      histogram: histogram[i] ?? 0,
    }));
  }, [indicators]);

  if (chartData.length === 0) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        color: C_MUTED,
        fontSize: 12,
      }}>
        No MACD data available
      </div>
    );
  }

  // Calculate Y-axis domain
  const allValues = chartData.flatMap(d => [d.macd, d.signal, d.histogram]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const pad = (maxVal - minVal) * 0.1 || 0.01;
  const yDomain = [minVal - pad, maxVal + pad];

  return (
    <div style={{ width: "100%", minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%" debounce={60}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 16 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={C_GRID}
            strokeOpacity={0.4}
            vertical={false}
          />

          <XAxis
            dataKey="index"
            tick={{ fill: C_MUTED, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />

          <YAxis
            domain={yDomain}
            tickFormatter={(v) => v.toFixed(4)}
            tick={{ fill: C_MUTED, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />

          <Tooltip content={<IndicatorTooltip indicatorType="macd" />} cursor={{ stroke: C_MUTED, strokeWidth: 1, strokeOpacity: 0.3 }} />

          <ReferenceLine y={0} stroke={C_MUTED} strokeDasharray="2 2" strokeWidth={1} strokeOpacity={0.5} />

          {/* Histogram */}
          <Bar
            dataKey="histogram"
            fill={(d) => d.histogram >= 0 ? C_GREEN : C_RED}
            opacity={0.6}
          />

          {/* MACD lines */}
          <Line
            type="monotone"
            dataKey="macd"
            stroke={C_BLUE}
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="signal"
            stroke={C_ORANGE}
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Combined Technical Indicators Chart ───────────────────────────────────── */
export default function TechnicalIndicatorsChart({ indicators, height = 300 }) {
  if (!indicators) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        color: C_MUTED,
        fontSize: 13,
      }}>
        No indicator data available
      </div>
    );
  }

  const hasRSI = indicators.rsi && indicators.rsi.length > 0;
  const hasMACD = indicators.macd && indicators.macd.macd && indicators.macd.macd.length > 0;

  if (!hasRSI && !hasMACD) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        color: C_MUTED,
        fontSize: 13,
      }}>
        No indicator data available
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height }}>
      {hasRSI && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#e4e4e7", marginBottom: 4, marginLeft: 4 }}>
            RSI (14)
          </div>
          <RSIChart indicators={indicators} height="100%" />
        </div>
      )}
      {hasMACD && (
        <div style={{ flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#e4e4e7", marginBottom: 4, marginLeft: 4 }}>
            MACD (12, 26, 9)
          </div>
          <MACDChart indicators={indicators} height="100%" />
        </div>
      )}
    </div>
  );
}
