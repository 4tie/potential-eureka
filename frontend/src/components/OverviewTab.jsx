import { useState, useEffect, useRef } from "react";
import { useLiveEvents } from "../hooks/useLiveEvents.js";
import RadarDisplay from "./agent-monitoring/RadarDisplay";
import CurrentDirective from "./agent-monitoring/CurrentDirective";
import ContextWindow from "./agent-monitoring/ContextWindow";
import SystemStatus from "./agent-monitoring/SystemStatus";
import OpsConsoleFooter from "./agent-monitoring/OpsConsoleFooter";

const AGENT_COLORS = {
  Orchestrator: "#A78BFA",
  Scout: "#7DD3FC",
  Scribe: "#F472B6",
  Reach: "#E879F9",
  Dev: "#A78BFA",
};

function Eyebrow() {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-2 h-2 rounded-full bg-mint pulse-mint" />
      <div className="h-px flex-1 bg-white/10" />
      <span className="font-mono text-xs text-mint tracking-wider">4TIE</span>
      <div className="h-px flex-1 bg-white/10" />
      <span className="font-mono text-[10px] text-muted">v1.1</span>
    </div>
  );
}

function LiveOpsConsole({ agents, events, stats }) {
  return (
    <div className="glass-card p-6">
      <div className="grid grid-cols-[180px_1fr_1fr] gap-8">
        <RadarDisplay agents={agents} />
        <div>
          <CurrentDirective events={events} />
          <ContextWindow agents={agents} />
        </div>
        <SystemStatus agents={agents} />
      </div>
      <OpsConsoleFooter stats={stats} />
    </div>
  );
}

function StatsStrip() {
  const [stats, setStats] = useState({
    integrity: 99.95,
    agentCalls: 1247,
    messages: 8432,
    tokensIn: '2.1M',
    cacheHits: 94.2,
  });

  useEffect(() => {
    // Fetch stats from backend
    fetch('/api/system/metrics')
      .then(res => res.json())
      .then(data => setStats(prev => data.metrics || prev))
      .catch(err => console.error('Failed to fetch metrics:', err));
  }, []);

  const statsArray = [
    { label: 'Integrity', value: `${stats.integrity.toFixed(2)}%`, color: 'mint', subtext: '5 of 5 responsive' },
    { label: 'Agent Calls', value: stats.agentCalls.toLocaleString(), color: 'cyan', subtext: '+12% from yesterday' },
    { label: 'Messages', value: stats.messages.toLocaleString(), color: 'violet-glow', subtext: '2.4k per hour' },
    { label: 'Tokens In', value: stats.tokensIn, color: 'gold', subtext: 'Avg 1.2k per msg' },
    { label: 'Cache Hits', value: `${stats.cacheHits}%`, color: 'pink', subtext: '8.2k saved calls' },
  ];

  return (
    <div className="grid grid-cols-5 gap-4 mb-6">
      {statsArray.map((stat) => (
        <div
          key={stat.label}
          className="glass-card p-4"
          style={{ borderTopColor: `var(--${stat.color})`, borderTopWidth: '2px' }}
        >
          <div className="font-mono text-[10px] text-muted mb-2">{stat.label}</div>
          <div
            className="font-medium"
            style={{ fontSize: 'clamp(24px, 2.4vw, 34px)', fontWeight: 500 }}
          >
            {stat.value}
          </div>
          <div className="font-mono text-[10px] text-muted mt-1">{stat.subtext}</div>
        </div>
      ))}
    </div>
  );
}

function Throughput() {
  const canvasRef = useRef(null);
  const [totalResponses, setTotalResponses] = useState(12478);
  const [mostActiveDay, setMostActiveDay] = useState('Monday');
  const [weeklyData, setWeeklyData] = useState([]);

  useEffect(() => {
    // Fetch throughput data from backend
    fetch('/api/system/throughput')
      .then(res => res.json())
      .then(data => {
        setTotalResponses(data.totalResponses || 12478);
        setMostActiveDay(data.mostActiveDay || 'Monday');
        setWeeklyData(data.weeklyData || Array.from({ length: 7 }, () => Math.random() * 0.8 + 0.1));
      })
      .catch(err => console.error('Failed to fetch throughput:', err));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Use real data or fallback to random data
      const data = weeklyData.length > 0 ? weeklyData : Array.from({ length: 7 }, () => Math.random() * 0.8 + 0.1);
      const maxVal = Math.max(...data, 0.1);

      // Create gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
      gradient.addColorStop(1, 'rgba(125, 211, 252, 0.1)');

      // Draw filled area
      ctx.beginPath();
      ctx.moveTo(0, height);
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (val / maxVal) * height * 0.8;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw line
      ctx.beginPath();
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (val / maxVal) * height * 0.8;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw dot at rightmost point
      const lastX = width;
      const lastY = height - (data[data.length - 1] / maxVal) * height * 0.8;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#7DD3FC';
      ctx.fill();
      ctx.shadowColor = '#7DD3FC';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    draw();

    const interval = setInterval(() => {
      draw();
    }, 900);

    return () => clearInterval(interval);
  }, [weeklyData]);

  return (
    <div className="glass-card p-6">
      <div className="flex items-baseline gap-4 mb-4">
        <div
          className="font-bold text-cyan"
          style={{ fontSize: 'clamp(34px, 4vw, 56px)', fontWeight: 700 }}
        >
          {totalResponses.toLocaleString()}
        </div>
        <span className="text-muted text-[18px]">responses total</span>
      </div>
      <canvas ref={canvasRef} width={400} height={100} className="w-full mb-2" />
      <div className="font-mono text-[10px] text-mint">Most active: {mostActiveDay}</div>
    </div>
  );
}

function Activity({ events }) {
  const [displayEvents, setDisplayEvents] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    if (events.length === 0) return;

    const interval = setInterval(() => {
      setDisplayEvents(prev => {
        const newEvent = events[0];
        if (!newEvent) return prev;
        const updated = [newEvent, ...prev].slice(0, 8);
        return updated;
      });
    }, 2200);

    return () => clearInterval(interval);
  }, [events]);

  const formatTime = (timestamp) => {
    const diff = currentTime - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="glass-card p-6">
      <div className="font-mono text-[10px] text-muted mb-4">ACTIVITY FEED</div>
      <div className="space-y-3">
        {displayEvents.map((event, index) => (
          <div
            key={index}
            className="flex items-center gap-3 text-sm transition-all duration-300"
            style={{
              opacity: 1 - index * 0.1,
              transform: `translateY(${index * 2}px)`,
            }}
          >
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded"
              style={{
                backgroundColor: `${AGENT_COLORS[event.agent]}20`,
                color: AGENT_COLORS[event.agent],
              }}
            >
              {event.agent}
            </span>
            <span className="text-text/80 flex-1 truncate">{event.task}</span>
            <span className={`font-mono text-[10px] ${event.status === 'success' ? 'text-mint' : 'text-red'}`}>
              {event.status}
            </span>
            <span className="font-mono text-[10px] text-muted ml-auto">
              {formatTime(event.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OverviewTab() {
  const { events } = useLiveEvents();
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({
    queue: 0,
    sessions: 0,
    errors: 0,
    today: 0,
    uptime: '0h 0m'
  });

  useEffect(() => {
    // Fetch agent status from backend
    fetch('/api/agent/status')
      .then(res => res.json())
      .then(data => setAgents(data.agents || []))
      .catch(err => console.error('Failed to fetch agents:', err));

    // Fetch system stats from backend
    fetch('/api/system/stats')
      .then(res => res.json())
      .then(data => setStats(data.stats || {
        queue: 0,
        sessions: 0,
        errors: 0,
        today: 0,
        uptime: '0h 0m'
      }))
      .catch(err => console.error('Failed to fetch stats:', err));
  }, []);

  const displayEvents = events;

  return (
    <div className="space-y-6">
      <Eyebrow />
      <LiveOpsConsole agents={agents} events={displayEvents} stats={stats} />
      <StatsStrip />
      <div className="grid grid-cols-[1.2fr_1fr] gap-6">
        <Throughput />
        <Activity events={displayEvents} />
      </div>
    </div>
  );
}
