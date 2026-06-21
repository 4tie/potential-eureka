import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { BoltIcon } from "@heroicons/react/24/outline";

function LiveFitnessTooltip({ active, payload, totalEpochs }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-base-300 border border-base-content/10 rounded px-2.5 py-2 text-xs shadow-lg space-y-0.5">
      <div className="text-base-content/50 font-medium">Epoch {d.epoch}{totalEpochs ? `/${totalEpochs}` : ""}</div>
      <div className="text-emerald-400 font-bold">Profit: {d.profit_usdt >= 0 ? "+" : ""}{d.profit_usdt?.toFixed(4)} USDT</div>
      <div className="text-blue-400">Objective: {d.objective?.toFixed(4)}</div>
      <div className="text-base-content/50">{d.trades} trades</div>
    </div>
  );
}

export default function AutoQuantLiveFitnessCurve({ data, hyperoptProgress }) {
  const hasData = data && data.length > 0;
  const bestPoint = hasData ? data.reduce((best, p) => p.objective < best.objective ? p : best, data[0]) : null;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-36 rounded-xl bg-base-300/30 border border-base-300/50 gap-2">
        <BoltIcon className="h-6 w-6 text-base-content/25" />
        <span className="text-xs text-base-content/35 italic">
          {hyperoptProgress ? "Running hyperopt..." : "Waiting for Stage 2 - Hyperopt..."}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {bestPoint && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-base-content/50">Best profit: <span className="text-emerald-400 font-bold">{bestPoint.profit_usdt >= 0 ? "+" : ""}{bestPoint.profit_usdt?.toFixed(4)} USDT</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-[10px] text-base-content/50">Epoch <span className="text-blue-400 font-bold">{bestPoint.epoch}</span></span>
            </div>
          </div>
        )}
        {hyperoptProgress && (
          <span className="text-[10px] text-base-content/40 font-mono">
            {data.length}/{hyperoptProgress.total || "?"} epochs
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={150} debounce={30}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#4ade80" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="epoch"
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "Epoch", position: "insideBottom", offset: -2, fontSize: 9, fill: "rgba(255,255,255,0.25)" }}
          />
          <YAxis
            yAxisId="profit"
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
            axisLine={false}
            tickLine={false}
            width={42}
            tickFormatter={(v) => v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)}
          />
          <Tooltip content={<LiveFitnessTooltip totalEpochs={hyperoptProgress?.total} />} />
          <ReferenceLine yAxisId="profit" y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 2" strokeWidth={1} />
          <Line
            yAxisId="profit"
            type="monotone"
            dataKey="profit_usdt"
            stroke="#4ade80"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: "#4ade80" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
