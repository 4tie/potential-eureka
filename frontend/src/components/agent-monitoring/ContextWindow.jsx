import { useState, useEffect } from "react";

const AGENT_COLORS = {
  Orchestrator: "#A78BFA",
  Scout: "#7DD3FC",
  Scribe: "#F472B6",
  Reach: "#E879F9",
  Dev: "#A78BFA",
};

export default function ContextWindow({ agents }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (agents.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % agents.length);
    }, 2400);

    return () => clearInterval(interval);
  }, [agents.length]);

  const currentAgent = agents[currentIndex];
  
  if (!currentAgent) {
    return (
      <div>
        <div className="font-mono text-[10px] text-muted mb-3">CONTEXT WINDOW</div>
        <div className="text-muted text-sm">Loading agents...</div>
      </div>
    );
  }

  const totalResponses = agents.reduce((sum, agent) => sum + (agent.responses || 0), 0);
  const share = totalResponses > 0 ? (currentAgent.responses || 0) / totalResponses : 0;
  const filledSegments = Math.round(share * 16);

  return (
    <div>
      <div className="font-mono text-[10px] text-muted mb-3">CONTEXT WINDOW</div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-medium" style={{ color: AGENT_COLORS[currentAgent.name] || '#A78BFA' }}>
          {currentAgent.name ? currentAgent.name.toUpperCase() : 'UNKNOWN'}
        </span>
        <span className="font-mono text-xs text-muted">{currentAgent.responses || 0} tasks</span>
      </div>
      <div className="flex gap-1 mb-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="h-[5px] flex-1 rounded-sm transition-all duration-300"
            style={{
              backgroundColor: i < filledSegments ? (AGENT_COLORS[currentAgent.name] || '#A78BFA') : 'rgba(255,255,255,0.05)',
              animation: i < filledSegments ? `pulse 1.5s ease-in-out ${i * 0.1}s infinite` : 'none',
            }}
          />
        ))}
      </div>
      <div className="font-mono text-[10px] text-muted">{currentAgent.status || 'Unknown'}</div>
    </div>
  );
}
