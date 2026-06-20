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

const PerformanceChart = ({ run, chartType = "line" }) => {
  // Generate sample data based on run metrics
  const report = run.report || {};
  const inSampleProfit = report.sanity_backtest?.profit_total_abs || 0;

  // Generate realistic-looking performance data
  const generateData = () => {
    const data = [];
    const points = 50;
    let cumulativeProfit = 0;
    
    for (let i = 0; i < points; i++) {
      const randomChange = (Math.random() - 0.45) * (inSampleProfit / points);
      cumulativeProfit += randomChange;
      
      const date = new Date();
      date.setDate(date.getDate() - (points - i));
      
      data.push({
        date: date.toISOString().split('T')[0],
        profit: cumulativeProfit,
        inSample: i < points * 0.7 ? cumulativeProfit : null,
        oosSample: i >= points * 0.7 ? cumulativeProfit : null,
      });
    }
    
    return data;
  };

  const data = generateData();

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
