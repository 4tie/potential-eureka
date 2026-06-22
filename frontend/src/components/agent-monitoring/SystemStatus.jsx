const AGENT_COLORS = {
  Orchestrator: "#A78BFA",
  Scout: "#7DD3FC",
  Scribe: "#F472B6",
  Reach: "#E879F9",
  Dev: "#A78BFA",
};

export default function SystemStatus({ agents, pipelineStage = null }) {
  return (
    <div className="flex flex-col justify-center">
      <div className="font-mono text-[10px] text-muted mb-2">
        {pipelineStage !== null ? `AGENT STATUS - STAGE ${pipelineStage + 1}` : 'SYSTEM STATUS'}
      </div>
      <div className="space-y-2">
        {agents.map(agent => (
          <div key={agent.name} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: AGENT_COLORS[agent.name] || '#A78BFA' }}
            />
            <span className="font-mono text-xs">{agent.name}</span>
            <span className="font-mono text-[10px] text-muted ml-auto">{agent.status || 'Unknown'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
