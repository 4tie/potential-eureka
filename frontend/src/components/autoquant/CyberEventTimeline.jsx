import { useMemo } from "react";
import { ClockIcon, CpuChipIcon, BeakerIcon, ChartBarIcon, ShieldCheckIcon, FunnelIcon } from "@heroicons/react/24/outline";
import animations from "../../animations";

const SEVERITY_COLORS = {
  info: "text-info border-info/30 bg-info/10",
  success: "text-success border-success/30 bg-success/10",
  warning: "text-warning border-warning/30 bg-warning/10",
  error: "text-error border-error/30 bg-error/10",
  critical: "text-error border-error/50 bg-error/20 neon-glow-red",
};

const CATEGORY_ICONS = {
  system: CpuChipIcon,
  strategy: ChartBarIcon,
  data: FunnelIcon,
  validation: ShieldCheckIcon,
  optimization: BeakerIcon,
};

const CATEGORY_COLORS = {
  system: "text-primary",
  strategy: "text-secondary",
  data: "text-accent",
  validation: "text-success",
  optimization: "text-warning",
};

function formatTimestamp(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function CyberEventCard({ event, index, isExpanded, onToggle }) {
  const Icon = CATEGORY_ICONS[event.category] || ClockIcon;
  const severityClass = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info;
  const categoryColor = CATEGORY_COLORS[event.category] || "text-base-content/60";

  return (
    <div
      className={`relative pl-6 pb-4 ${index === 0 ? "pt-0" : "pt-4"}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Timeline connector */}
      <div className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-primary/50 via-primary/30 to-transparent" />
      
      {/* Timeline dot */}
      <div className={`absolute left-[-3px] top-1 h-1.5 w-1.5 rounded-full ${
        event.severity === "critical" ? "bg-error neon-glow-red" :
        event.severity === "error" ? "bg-error" :
        event.severity === "success" ? "bg-success" :
        event.severity === "warning" ? "bg-warning" :
        "bg-primary"
      }`} />

      {/* Event card */}
      <div
        onClick={() => onToggle && onToggle(event.id)}
        className={`group relative rounded-lg border p-3 transition-all duration-300 cursor-pointer hover:scale-[1.02] ${
          isExpanded ? "border-primary/50 bg-primary/5 neon-glow" : `border-base-300 bg-base-200/50 hover:border-primary/30`
        }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${severityClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${categoryColor}`}>
                {event.category || "system"}
              </span>
              <span className="text-[10px] text-base-content/40">
                {formatTimestamp(event.ts)}
              </span>
              {event.stage != null && (
                <span className="badge badge-xs badge-ghost">
                  Stage {event.stage}
                </span>
              )}
            </div>
            
            <p className="text-sm font-medium text-base-content">
              {event.message}
            </p>
          </div>

          <div className="shrink-0">
            <svg
              className={`h-4 w-4 text-base-content/40 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-3 space-y-2 border-t border-base-300 pt-3 animate-fade-in">
            {event.reason && (
              <div className="rounded-md bg-base-300/50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40 mb-1">
                  Reason
                </p>
                <p className="text-xs text-base-content/80">
                  {event.reason}
                </p>
              </div>
            )}

            {event.context && Object.keys(event.context).length > 0 && (
              <div className="rounded-md bg-base-300/50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40 mb-2">
                  Context
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(event.context).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-[10px] text-base-content/40">{key}</p>
                      <p className="text-xs font-mono text-base-content/80 truncate">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {event.related_events && event.related_events.length > 0 && (
              <div className="rounded-md bg-base-300/50 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40 mb-1">
                  Related Events
                </p>
                <div className="flex flex-wrap gap-1">
                  {event.related_events.map((relatedId) => (
                    <span key={relatedId} className="badge badge-xs badge-ghost">
                      #{relatedId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CyberEventTimeline({ events = [], maxHeight = "600px", filter = null }) {
  const [expandedIds, setExpandedIds] = useMemo(() => new Set(), []);

  const filteredEvents = useMemo(() => {
    if (!filter) return events;
    return events.filter((event) => {
      if (filter.severity && event.severity !== filter.severity) return false;
      if (filter.category && event.category !== filter.category) return false;
      if (filter.stage != null && event.stage !== filter.stage) return false;
      return true;
    });
  }, [events, filter]);

  const toggleExpanded = (eventId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  if (!filteredEvents.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-base-content/40">
        <ClockIcon className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm">No events logged yet</p>
      </div>
    );
  }

  return (
    <div className="cyber-grid rounded-lg border border-base-300 bg-base-200/50 p-4 scanlines">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-primary">
          Event Timeline
        </h3>
        <span className="badge badge-sm badge-ghost">
          {filteredEvents.length} events
        </span>
      </div>

      <div 
        className="overflow-y-auto pr-2" 
        style={{ maxHeight }}
      >
        <div className="space-y-0">
          {filteredEvents.map((event, index) => (
            <CyberEventCard
              key={event.id || index}
              event={event}
              index={index}
              isExpanded={expandedIds.has(event.id || index)}
              onToggle={toggleExpanded}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
