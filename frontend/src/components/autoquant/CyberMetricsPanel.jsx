import { useMemo } from "react";
import { CpuChipIcon, ClockIcon, ChartBarIcon, SignalIcon, ActivityIcon } from "@heroicons/react/24/outline";

function formatNumber(value, decimals = 2) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(decimals);
}

function formatPercent(value) {
  if (value == null || value === "") return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${num.toFixed(1)}%`;
}

function formatDuration(seconds) {
  if (seconds == null || seconds === "") return "-";
  const num = Number(seconds);
  if (!Number.isFinite(num)) return "-";
  
  const hours = Math.floor(num / 3600);
  const minutes = Math.floor((num % 3600) / 60);
  const secs = Math.floor(num % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function CyberMetricCard({ label, value, icon: Icon, tone = "primary", trend = null, sparkline = null }) {
  const toneClasses = {
    primary: "border-primary/30 bg-primary/5 text-primary neon-glow",
    secondary: "border-secondary/30 bg-secondary/5 text-secondary neon-glow-purple",
    accent: "border-accent/30 bg-accent/5 text-accent neon-glow-pink",
    success: "border-success/30 bg-success/5 text-success neon-glow-green",
    warning: "border-warning/30 bg-warning/5 text-warning neon-glow-orange",
    error: "border-error/30 bg-error/5 text-error neon-glow-red",
  };

  const trendIcon = trend && trend > 0 ? "↑" : trend && trend < 0 ? "↓" : null;
  const trendColor = trend && trend > 0 ? "text-success" : trend && trend < 0 ? "text-error" : "";

  return (
    <div className={`relative overflow-hidden rounded-lg border p-3 transition-all duration-300 hover:scale-105 hover:shadow-lg ${toneClasses[tone]}`}>
      {/* Scanline effect */}
      <div className="absolute inset-0 scanlines pointer-events-none" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/20 bg-current/10">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{label}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums">{value}</p>
          </div>
        </div>
        
        {trendIcon && (
          <div className={`text-sm font-bold ${trendColor}`}>
            {trendIcon} {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>

      {sparkline && (
        <div className="mt-2 h-8 w-full">
          <svg className="h-full w-full" viewBox="0 0 100 32" preserveAspectRatio="none">
            <path
              d={sparkline}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-60"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export default function CyberMetricsPanel({ metrics = {}, live = false }) {
  const metricCards = useMemo(() => {
    const cards = [];

    // Progress
    if (metrics.progress != null) {
      cards.push({
        label: "Progress",
        value: `${formatPercent(metrics.progress)}`,
        icon: ChartBarIcon,
        tone: metrics.progress >= 100 ? "success" : metrics.progress >= 50 ? "primary" : "warning",
        trend: metrics.progressTrend,
      });
    }

    // Elapsed time
    if (metrics.elapsedSeconds != null) {
      cards.push({
        label: "Elapsed",
        value: formatDuration(metrics.elapsedSeconds),
        icon: ClockIcon,
        tone: "primary",
      });
    }

    // ETA
    if (metrics.etaSeconds != null) {
      cards.push({
        label: "ETA",
        value: formatDuration(metrics.etaSeconds),
        icon: ClockIcon,
        tone: "secondary",
      });
    }

    // CPU usage
    if (metrics.cpuUsage != null) {
      cards.push({
        label: "CPU",
        value: `${formatPercent(metrics.cpuUsage)}`,
        icon: CpuChipIcon,
        tone: metrics.cpuUsage > 80 ? "error" : metrics.cpuUsage > 50 ? "warning" : "success",
        trend: metrics.cpuTrend,
      });
    }

    // Memory usage
    if (metrics.memoryUsage != null) {
      cards.push({
        label: "Memory",
        value: `${formatPercent(metrics.memoryUsage)}`,
        icon: ActivityIcon,
        tone: metrics.memoryUsage > 80 ? "error" : metrics.memoryUsage > 50 ? "warning" : "success",
        trend: metrics.memoryTrend,
      });
    }

    // Signal strength
    if (metrics.signalStrength != null) {
      cards.push({
        label: "Signal",
        value: formatNumber(metrics.signalStrength, 1),
        icon: SignalIcon,
        tone: metrics.signalStrength > 0.7 ? "success" : metrics.signalStrength > 0.4 ? "warning" : "error",
      });
    }

    // Custom metrics
    if (metrics.custom) {
      Object.entries(metrics.custom).forEach(([key, value]) => {
        cards.push({
          label: key,
          value: typeof value === "number" ? formatNumber(value) : String(value),
          icon: ChartBarIcon,
          tone: "primary",
        });
      });
    }

    return cards;
  }, [metrics]);

  return (
    <div className="cyber-grid rounded-lg border border-base-300 bg-base-200/50 p-4 scanlines">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-primary">
          Live Metrics
        </h3>
        {live && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-success">
              Live
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-1">
        {metricCards.map((card, index) => (
          <CyberMetricCard
            key={card.label}
            {...card}
            style={{ animationDelay: `${index * 100}ms` }}
          />
        ))}
      </div>

      {metricCards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-base-content/40">
          <ActivityIcon className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-sm">No metrics available</p>
        </div>
      )}
    </div>
  );
}
