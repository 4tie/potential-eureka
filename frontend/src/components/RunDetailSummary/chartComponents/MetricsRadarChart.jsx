import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Legend,
} from "recharts";

const MetricsRadarChart = ({ run }) => {
  const report = run.report || {};
  const risk = report.risk_assessment || {};

  // Normalize metrics to 0-100 scale for radar chart
  const normalizeMetric = (value, max, isHigherBetter = true) => {
    if (isHigherBetter) {
      return Math.min(100, (value / max) * 100);
    } else {
      return Math.min(100, ((max - value) / max) * 100);
    }
  };

  const data = [
    {
      metric: 'Win Rate',
      value: normalizeMetric(risk.win_rate_pct || 0, 100, true),
      actual: (risk.win_rate_pct || 0).toFixed(1)
    },
    {
      metric: 'Sharpe Ratio',
      value: normalizeMetric(risk.sharpe_ratio || 0, 3, true),
      actual: (risk.sharpe_ratio || 0).toFixed(2)
    },
    {
      metric: 'Profit Factor',
      value: normalizeMetric(risk.profit_factor || 0, 3, true),
      actual: (risk.profit_factor || 0).toFixed(2)
    },
    {
      metric: 'Max Drawdown',
      value: normalizeMetric(risk.max_drawdown_pct || 0, 50, false),
      actual: (risk.max_drawdown_pct || 0).toFixed(1)
    },
    {
      metric: 'Total Trades',
      value: normalizeMetric(risk.total_trades || 0, 500, true),
      actual: (risk.total_trades || 0).toFixed(0)
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid stroke="hsl(var(--bc))" />
        <PolarAngleAxis 
          dataKey="metric" 
          className="text-xs text-base-content"
          tick={{ fill: 'hsl(var(--bc))', fontSize: 11 }}
        />
        <PolarRadiusAxis 
          angle={90} 
          domain={[0, 100]} 
          tick={{ fill: 'hsl(var(--bc))', fontSize: 10 }}
          tickFormatter={(value) => `${value}%`}
        />
        <Radar
          name="Metrics"
          dataKey="value"
          stroke="hsl(var(--p))"
          fill="hsl(var(--p))"
          fillOpacity={0.3}
          strokeWidth={2}
        />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  );
};

export default MetricsRadarChart;
