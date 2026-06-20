import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
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

const PerformanceChart = ({ run, chartType = "line" }) => {
  // Generate sample data based on run metrics
  const report = run.report || {};
  const inSampleProfit = report.sanity_backtest?.profit_total_abs || 0;

  // Generate realistic-looking performance data
  const data = useMemo(() => {
    const data = [];
    const points = 50;
    let cumulativeProfit = 0;
    
    // Deterministic algorithm (no Math.random)
    for (let i = 0; i < points; i++) {
      // Use sine wave pattern for deterministic variation
      const phase = (i / points) * Math.PI * 4;
      const variation = Math.sin(phase) * 0.5 + 0.5;
      const randomChange = (variation - 0.45) * (inSampleProfit / points);
      cumulativeProfit += randomChange;
      
      data.push({
        date: DATE_STRINGS[i],
        profit: cumulativeProfit,
        inSample: i < points * 0.7 ? cumulativeProfit : null,
        oosSample: i >= points * 0.7 ? cumulativeProfit : null,
      });
    }
    
    return data;
  }, [inSampleProfit]);

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    };

    if (chartType === "line") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-base-content/20" />
          <XAxis 
            dataKey="date" 
            className="text-xs text-base-content/70"
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis className="text-xs text-base-content/70" />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--fallback-b2, oklch(var(--b2)))',
              border: '1px solid var(--fallback-b3, oklch(var(--b3)))',
              borderRadius: '8px'
            }}
            formatter={(value) => [`$${value.toFixed(2)}`, 'Profit']}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="profit" 
            stroke="hsl(var(--p))" 
            strokeWidth={2}
            dot={false}
            name="Total Profit"
          />
          <Line 
            type="monotone" 
            dataKey="inSample" 
            stroke="hsl(var(--su))" 
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
            name="In-Sample"
          />
          <Line 
            type="monotone" 
            dataKey="oosSample" 
            stroke="hsl(var(--s))" 
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
            name="OOS Sample"
          />
        </LineChart>
      );
    }

    if (chartType === "area") {
      return (
        <AreaChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-base-content/20" />
          <XAxis 
            dataKey="date" 
            className="text-xs text-base-content/70"
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis className="text-xs text-base-content/70" />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--fallback-b2, oklch(var(--b2)))',
              border: '1px solid var(--fallback-b3, oklch(var(--b3)))',
              borderRadius: '8px'
            }}
            formatter={(value) => [`$${value.toFixed(2)}`, 'Profit']}
          />
          <Legend />
          <Area 
            type="monotone" 
            dataKey="profit" 
            stroke="hsl(var(--p))" 
            fill="hsl(var(--p))"
            fillOpacity={0.3}
            name="Total Profit"
          />
        </AreaChart>
      );
    }

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-base-content/20" />
          <XAxis 
            dataKey="date" 
            className="text-xs text-base-content/70"
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis className="text-xs text-base-content/70" />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--fallback-b2, oklch(var(--b2)))',
              border: '1px solid var(--fallback-b3, oklch(var(--b3)))',
              borderRadius: '8px'
            }}
            formatter={(value) => [`$${value.toFixed(2)}`, 'Profit']}
          />
          <Legend />
          <Bar dataKey="profit" fill="hsl(var(--p))" name="Total Profit" />
        </BarChart>
      );
    }
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      {renderChart()}
    </ResponsiveContainer>
  );
};

export default PerformanceChart;
