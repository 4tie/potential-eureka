export default function OpsConsoleFooter({ stats }) {
  return (
    <div className="grid grid-cols-5 gap-2 mt-4">
      <div className="glass-card p-3 text-center">
        <div className="font-mono text-[10px] text-muted">QUEUE</div>
        <div className="font-mono text-lg">{stats.queue || 0}</div>
      </div>
      <div className="glass-card p-3 text-center">
        <div className="font-mono text-[10px] text-muted">SESSIONS</div>
        <div className="font-mono text-lg">{stats.sessions || 0}</div>
      </div>
      <div className="glass-card p-3 text-center">
        <div className="font-mono text-[10px] text-muted">ERRORS</div>
        <div className={`font-mono text-lg ${(stats.errors || 0) > 0 ? 'text-red' : ''}`}>{stats.errors || 0}</div>
      </div>
      <div className="glass-card p-3 text-center">
        <div className="font-mono text-[10px] text-muted">TODAY</div>
        <div className="font-mono text-lg">{stats.today || 0}</div>
      </div>
      <div className="glass-card p-3 text-center">
        <div className="font-mono text-[10px] text-muted">UPTIME</div>
        <div className="font-mono text-lg">{stats.uptime || '0h 0m'}</div>
      </div>
    </div>
  );
}
