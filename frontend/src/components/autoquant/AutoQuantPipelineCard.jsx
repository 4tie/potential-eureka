import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { getPipelineStep, mapStageStatus, PIPELINE_STEPS } from "../../features/autoquant/pipelineSteps";

function StatusBadge({ status }) {
  const statusConfig = {
    pending: {
      icon: ClockIcon,
      color: "base-content/40",
      bgColor: "base-300/30",
      borderColor: "base-300/40",
      label: "Pending",
    },
    running: {
      icon: ClockIcon,
      color: "primary",
      bgColor: "primary/10",
      borderColor: "primary/30",
      label: "Running",
      animate: true,
    },
    passed: {
      icon: CheckCircleIcon,
      color: "success",
      bgColor: "success/10",
      borderColor: "success/30",
      label: "Passed",
    },
    failed: {
      icon: XCircleIcon,
      color: "error",
      bgColor: "error/10",
      borderColor: "error/30",
      label: "Failed",
    },
    warning: {
      icon: ExclamationTriangleIcon,
      color: "warning",
      bgColor: "warning/10",
      borderColor: "warning/30",
      label: "Warning",
    },
    skipped: {
      icon: MinusCircleIcon,
      color: "base-content/40",
      bgColor: "base-300/30",
      borderColor: "base-300/40",
      label: "Skipped",
    },
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
        config.animate ? "animate-pulse" : ""
      }`}
      style={{
        backgroundColor: `var(--${config.bgColor.replace("/", "-")})`,
        borderColor: `var(--${config.borderColor.replace("/", "-")})`,
        color: `var(--${config.color})`,
      }}
    >
      <Icon className={`h-3.5 w-3.5 ${config.animate ? "animate-spin" : ""}`} />
      {config.label}
    </div>
  );
}

function MetricItem({ label, value, unit = "" }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-base-200 last:border-0">
      <span className="text-xs text-base-content/60">{label}</span>
      <span className="text-xs font-mono font-medium text-base-content">
        {value != null ? `${value}${unit}` : "Not available"}
      </span>
    </div>
  );
}

function ChecklistItem({ label, passed, warning }) {
  if (passed) {
    return (
      <div className="flex items-center gap-2 py-1">
        <CheckCircleIcon className="h-3.5 w-3.5 text-success shrink-0" />
        <span className="text-xs text-base-content/70">{label}</span>
      </div>
    );
  }
  if (warning) {
    return (
      <div className="flex items-center gap-2 py-1">
        <ExclamationTriangleIcon className="h-3.5 w-3.5 text-warning shrink-0" />
        <span className="text-xs text-base-content/70">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1">
      <XCircleIcon className="h-3.5 w-3.5 text-error shrink-0" />
      <span className="text-xs text-base-content/50">{label}</span>
    </div>
  );
}

export default function AutoQuantPipelineCard({ stage, isExpanded: defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  // Get step metadata
  const stepMetadata = getPipelineStep(stage?.name);
  const mappedStatus = mapStageStatus(stage?.status, stage?.name);
  
  // Extract data from stage
  const stageData = stage?.data || {};
  const stageMessage = stage?.message || "";
  const stageDuration = stage?.duration_s;
  
  // Determine if there are warnings or failures
  const hasWarnings = mappedStatus === "warning" || (stageData?.warnings?.length > 0);
  const hasFailures = mappedStatus === "failed" || (stageData?.errors?.length > 0);
  const hasData = Object.keys(stageData).length > 0;

  return (
    <div
      className={`card bg-base-100 border transition-all duration-300 ${
        mappedStatus === "running"
          ? "border-primary/30 shadow-sm shadow-primary/5"
          : mappedStatus === "passed"
          ? "border-success/20"
          : mappedStatus === "failed"
          ? "border-error/30"
          : mappedStatus === "warning"
          ? "border-warning/30"
          : "border-base-300"
      }`}
    >
      <div className="card-body p-4">
        {/* Card Header - Always Visible */}
        <div className="flex items-start gap-3">
          {/* Step Number/Icon */}
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              mappedStatus === "running"
                ? "bg-primary/10"
                : mappedStatus === "passed"
                ? "bg-success/10"
                : mappedStatus === "failed"
                ? "bg-error/10"
                : mappedStatus === "warning"
                ? "bg-warning/10"
                : "bg-base-300/30"
            }`}
          >
            {stepMetadata ? (
              <span className="font-mono text-sm font-bold text-base-content/70">
                {PIPELINE_STEPS.findIndex((s) => s.id === stepMetadata.id) + 1}
              </span>
            ) : (
              <InformationCircleIcon className="h-5 w-5 text-base-content/40" />
            )}
          </div>

          {/* Step Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-base-content truncate">
                {stepMetadata?.name || stage?.name || "Unknown Step"}
              </h3>
              <StatusBadge status={mappedStatus} />
              {stageDuration != null && mappedStatus === "passed" && (
                <span className="text-[10px] font-mono text-base-content/40">
                  {stageDuration}s
                </span>
              )}
            </div>

            {/* Plain English Explanation */}
            <p className="text-xs text-base-content/60 mt-1 leading-relaxed">
              {stepMetadata?.description || "Processing pipeline step..."}
            </p>

            {/* Short status message */}
            {stageMessage && mappedStatus !== "running" && (
              <p className="text-[11px] text-base-content/50 mt-1 truncate">
                {stageMessage}
              </p>
            )}
          </div>

          {/* Expand Toggle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="btn btn-ghost btn-xs btn-circle hover:bg-base-200 transition-colors"
            aria-label={isExpanded ? "Collapse details" : "Expand details"}
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-base-content/60" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-base-content/60" />
            )}
          </button>
        </div>

        {/* Expandable Technical Details */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-base-200 space-y-4">
            {/* Why This Step Matters */}
            {stepMetadata?.whyItMatters && (
              <div className="flex gap-2">
                <InformationCircleIcon className="h-4 w-4 text-primary/50 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 mb-1">
                    Why this matters
                  </h4>
                  <p className="text-xs text-base-content/70 leading-relaxed">
                    {stepMetadata.whyItMatters}
                  </p>
                </div>
              </div>
            )}

            {/* Inputs Used */}
            {stepMetadata?.inputs?.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
                  Inputs
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {stepMetadata.inputs.map((input, idx) => (
                    <span key={idx} className="badge badge-xs badge-ghost">
                      {input}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Checks Running */}
            {stepMetadata?.checks?.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
                  Checks
                </h4>
                <div className="space-y-1">
                  {stepMetadata.checks.map((check, idx) => (
                    <ChecklistItem
                      key={idx}
                      label={check}
                      passed={mappedStatus === "passed" && !hasWarnings}
                      warning={hasWarnings && mappedStatus !== "failed"}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Stage Data Metrics */}
            {hasData && (
              <div>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
                  Metrics
                </h4>
                <div className="bg-base-200/50 rounded-lg p-2 space-y-0.5">
                  {Object.entries(stageData).map(([key, value]) => {
                    // Skip nested objects and arrays for display
                    if (typeof value === "object" && value !== null) return null;
                    // Format the key for display
                    const label = key
                      .replace(/_/g, " ")
                      .replace(/([A-Z])/g, " $1")
                      .trim();
                    // Format the value
                    let displayValue = value;
                    if (typeof value === "number") {
                      displayValue = value.toFixed(2);
                    }
                    return (
                      <MetricItem key={key} label={label} value={displayValue} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warnings */}
            {hasWarnings && stageData?.warnings?.length > 0 && (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-warning mb-2">
                  Warnings
                </h4>
                <ul className="space-y-1">
                  {stageData.warnings.map((warning, idx) => (
                    <li key={idx} className="text-xs text-warning/90 flex items-start gap-2">
                      <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Failures */}
            {hasFailures && stageData?.errors?.length > 0 && (
              <div className="rounded-lg bg-error/10 border border-error/20 p-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-error mb-2">
                  Errors
                </h4>
                <ul className="space-y-1">
                  {stageData.errors.map((error, idx) => (
                    <li key={idx} className="text-xs text-error/90 flex items-start gap-2">
                      <XCircleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stage Message (if not shown above) */}
            {stageMessage && mappedStatus === "running" && (
              <div className="flex items-center gap-2 text-xs text-base-content/50">
                <ClockIcon className="h-3.5 w-3.5 animate-spin" />
                <span>{stageMessage}</span>
              </div>
            )}

            {/* Not Available Yet */}
            {!hasData && !hasWarnings && !hasFailures && mappedStatus === "pending" && (
              <div className="text-center py-4">
                <ClockIcon className="h-6 w-6 text-base-content/30 mx-auto mb-2" />
                <p className="text-xs text-base-content/40">Not available yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
