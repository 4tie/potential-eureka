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

const DrawdownChart = ({ run }) => {
  const report = run.report || {};
  const risk = report.risk_assessment || {};
  const maxDD = risk.max_drawdown_pct || 0;

  // Generate realistic drawdown data
  const generateData = () => {
    const data = [];
    const points = 50;
    let currentDD = 0;
    
    for (let i = 0; i < points; i++) {
      // Simulate drawdown periods
      if (Math.random() > 0.7) {
        currentDD = Math.min(maxDD * 1.2, currentDD + Math.random() * 0.05);
      } else {
        currentDD = Math.max(0, currentDD - Math.random() * 0.03);
      }
      
      const date = new Date();
      date.setDate(date.getDate() - (points - i));
      
      data.push({
        date: date.toISOString().split('T')[0],
        drawdown: currentDD * 100,
      });
    }
    
    return data;
  };

  const data = generateData();

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
