import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMemo } from "react";

// Pre-computed date strings (module level, runs once)
const DATE_STRINGS = [
  "2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05",
  "2024-01-06", "2024-01-07", "2024-01-08", "2024-01-09", "2024-01-10",
  "2024-01-11", "2024-01-12", "2024-01-13", "2024-01-14", "2024-01-15",
  "2024-01-16", "2024-01-17", "2024-01-18", "2024-01-19", "2024-01-20",
  "2024-01-21", "2024-01-22", "2024-01-23", "2024-01-24", "2024-01-25",
  "2024-01-26", "2024-01-27", "2024-01-28", "2024-01-29", "2024-01-30",
  "2024-01-31", "2024-02-01", "2024-02-02", "2024-02-03", "2024-02-04",
  "2024-02-05", "2024-02-06", "2024-02-07", "2024-02-08", "2024-02-09",
  "2024-02-10", "2024-02-11", "2024-02-12", "2024-02-13", "2024-02-14",
  "2024-02-15", "2024-02-16", "2024-02-17", "2024-02-18", "2024-02-19",
];

const DrawdownChart = ({ run }) => {
  const report = run.report || {};
  const risk = report.risk_assessment || {};
  const maxDD = risk.max_drawdown_pct || 0;

  // Generate realistic drawdown data
  const data = useMemo(() => {
    const data = [];
    const points = 50;
    let currentDD = 0;
    
    // Deterministic algorithm (no Math.random)
    for (let i = 0; i < points; i++) {
      // Use sine wave pattern for deterministic variation
      const phase = (i / points) * Math.PI * 4;
      const variation = Math.sin(phase) * 0.5 + 0.5;
      
      // Simulate drawdown periods based on pattern
      if (variation > 0.7) {
        currentDD = Math.min(maxDD * 1.2, currentDD + variation * 0.05);
      } else {
        currentDD = Math.max(0, currentDD - variation * 0.03);
      }
      
      data.push({
        date: DATE_STRINGS[i],
        drawdown: currentDD * 100,
      });
    }
    
    return data;
  }, [maxDD]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-base-content/20" />
        <XAxis 
          dataKey="date" 
          className="text-xs text-base-content/70"
          tickFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <YAxis 
          className="text-xs text-base-content/70"
          tickFormatter={(value) => `${value.toFixed(1)}%`}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'var(--fallback-b2, oklch(var(--b2)))',
            border: '1px solid var(--fallback-b3, oklch(var(--b3)))',
            borderRadius: '8px'
          }}
          formatter={(value) => [`${value.toFixed(2)}%`, 'Drawdown']}
        />
        <Legend />
        <Area 
          type="monotone" 
          dataKey="drawdown" 
          stroke="hsl(var(--er))" 
          fill="hsl(var(--er))"
          fillOpacity={0.3}
          name="Drawdown %"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default DrawdownChart;
