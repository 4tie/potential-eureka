import { useState } from "react";
import {
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  InformationCircleIcon,
  ArrowPathIcon,
  LightBulbIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";
import { getPipelineStep, mapStageStatus, PIPELINE_STEPS } from "../../features/autoquant/pipelineSteps";
import { translateError } from "../../features/autoquant/errorTranslator";

const RESERVED_METRIC_KEYS = new Set([
  "actions",
  "all_pairs",
  "checks",
  "controlled_failure",
  "error",
  "error_object",
  "errors",
  "failure",
  "failure_type",
  "input_summary",
  "inputSummary",
  "inputs",
  "logs",
  "metrics",
  "output_summary",
  "outputSummary",
  "outputs",
  "per_pair",
  "per_pair_metrics",
  "recent_logs",
  "retry_attempts",
  "retry_history",
  "stage_logs",
  "suggestions",
  "validation_notes",
  "warnings",
  "wfo_windows",
]);

const STATUS_CLASSES = {
  pending: {
    badge: "bg-base-300/30 border-base-300/40 text-base-content/40",
    icon: ClockIcon,
    label: "Pending",
  },
  running: {
    badge: "bg-primary/10 border-primary/30 text-primary animate-pulse",
    icon: null,
    label: "Running",
  },
  passed: {
    badge: "bg-success/10 border-success/30 text-success",
    icon: CheckCircleIcon,
    label: "Passed",
  },
  failed: {
    badge: "bg-error/10 border-error/30 text-error",
    icon: XCircleIcon,
    label: "Needs review",
  },
  warning: {
    badge: "bg-warning/10 border-warning/30 text-warning",
    icon: ExclamationTriangleIcon,
    label: "Warning",
  },
  skipped: {
    badge: "bg-base-300/30 border-base-300/40 text-base-content/40",
    icon: MinusCircleIcon,
    label: "Skipped",
  },
};

function StatusBadge({ status, controlled }) {
  const config = STATUS_CLASSES[status] || STATUS_CLASSES.pending;
  const Icon = config.icon;
  const label = controlled && status === "failed" ? "Controlled stop" : config.label;

  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${config.badge}`}>
      {status === "running" ? <span className="loading loading-spinner loading-xs" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </div>
  );
}

function normalizeMappedStatus(status) {
  const normalized = String(status || "pending").toLowerCase();
  const aliases = {
    complete: "passed",
    completed: "passed",
    success: "passed",
    succeeded: "passed",
    ok: "passed",
    active: "running",
    in_progress: "running",
    blocked: "failed",
    controlled_failure: "failed",
    validation_failed: "failed",
    error: "failed",
  };
  return aliases[normalized] || normalized;
}

function formatLabel(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function toArray(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== "");
  if (typeof value === "string" && value.includes("\n")) {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value];
}

function firstPresent(...values) {
  return values.find((value) => value != null && value !== "" && !(Array.isArray(value) && value.length === 0));
}

function stringifyValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (Math.abs(value) >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    return value.user_message || value.message || value.summary || value.label || value.code || JSON.stringify(value);
  }
  return String(value);
}

function itemText(item) {
  if (item == null) return "";
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return stringifyValue(item);
  return (
    item.user_message ||
    item.userMessage ||
    item.message ||
    item.summary ||
    item.detail ||
    item.reason ||
    item.label ||
    item.action ||
    item.code ||
    JSON.stringify(item)
  );
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = itemText(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMetrics(stage, stageData) {
  const explicitMetrics = firstPresent(stage?.metrics, stageData?.metrics) || {};
  const entries = [];

  if (Array.isArray(explicitMetrics)) {
    explicitMetrics.forEach((metric, index) => {
      if (metric == null) return;
      if (typeof metric === "object") {
        entries.push({
          label: metric.label || metric.name || metric.key || `Metric ${index + 1}`,
          value: metric.value ?? metric.amount ?? metric.result ?? metric.summary,
          tone: metric.tone,
        });
      } else {
        entries.push({ label: `Metric ${index + 1}`, value: metric });
      }
    });
  } else if (typeof explicitMetrics === "object") {
    Object.entries(explicitMetrics).forEach(([key, value]) => {
      entries.push({ label: formatLabel(key), value });
    });
  }

  Object.entries(stageData || {}).forEach(([key, value]) => {
    if (RESERVED_METRIC_KEYS.has(key)) return;
    if (value == null || value === "") return;
    if (typeof value === "object") return;
    if (entries.some((entry) => formatLabel(entry.label).toLowerCase() === formatLabel(key).toLowerCase())) return;
    entries.push({ label: formatLabel(key), value });
  });

  return entries.slice(0, 12);
}

function normalizeRetryHistory(stage, stageData) {
  const retryHistory = toArray(firstPresent(stage?.retry_history, stageData?.retry_history, stage?.retry_attempts, stageData?.retry_attempts));
  if (retryHistory.length > 0) return retryHistory;

  const retryCount = Number(firstPresent(stage?.retry_count, stageData?.retry_count, stage?.attempts, stageData?.attempts));
  if (Number.isFinite(retryCount) && retryCount > 0) {
    return Array.from({ length: retryCount }, (_, index) => ({ attempt: index + 1, status: "attempted" }));
  }
  return [];
}

function normalizeLogs(stage, stageData) {
  return uniqueItems([
    ...toArray(stage?.logs),
    ...toArray(stage?.stage_logs),
    ...toArray(stage?.recent_logs),
    ...toArray(stageData?.logs),
    ...toArray(stageData?.stage_logs),
    ...toArray(stageData?.recent_logs),
  ]).slice(-20);
}

function normalizeSuggestions(stage, stageData, errors) {
  return uniqueItems([
    ...toArray(stage?.suggestions),
    ...toArray(stage?.actions),
    ...toArray(stageData?.suggestions),
    ...toArray(stageData?.actions),
    ...errors.flatMap((error) => toArray(error?.suggestions || error?.actions || error?.next_actions || error?.suggestion)),
  ]).slice(0, 6);
}

function isControlledFailure(stage, stageData, errors) {
  return Boolean(
    stage?.controlled_failure ||
      stageData?.controlled_failure ||
      stage?.is_controlled_failure ||
      stageData?.is_controlled_failure ||
      stage?.failure_type === "controlled" ||
      stageData?.failure_type === "controlled" ||
      errors.some((error) => error?.controlled || error?.type === "validation_failure" || error?.kind === "validation_failed")
  );
}

function getNextAction({ mappedStatus, controlledFailure, suggestions, hasWarnings, hasFailures }) {
  const firstSuggestion = itemText(suggestions[0]);
  if (firstSuggestion) return firstSuggestion;
  if (mappedStatus === "running") return "Let AutoQuant finish this stage. Watch the logs if progress stalls.";
  if (mappedStatus === "pending") return "No action needed yet. This stage starts after the previous stage completes.";
  if (mappedStatus === "passed" && hasWarnings) return "Continue, but review the warning details before trusting this run.";
  if (mappedStatus === "passed") return "No action needed. AutoQuant can continue to the next stage.";
  if (hasFailures && controlledFailure) return "Review the validation reason, adjust thresholds or inputs, then retry deliberately.";
  if (hasFailures) return "Check the error details and stage logs before retrying.";
  if (mappedStatus === "warning") return "Review the warning and decide whether the run is still acceptable.";
  return "No action required.";
}

function DetailSection({ title, icon: Icon, children, tone = "base" }) {
  const toneClass =
    tone === "warning"
      ? "border-warning/20 bg-warning/5"
      : tone === "error"
        ? "border-error/20 bg-error/5"
        : tone === "success"
          ? "border-success/20 bg-success/5"
          : "border-base-300/50 bg-base-200/35";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="mb-2 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/55">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function SummaryBlock({ value }) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.slice(0, 12).map((item, index) => (
          <span key={index} className="badge badge-xs badge-ghost max-w-full truncate">
            {stringifyValue(item)}
          </span>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return (
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {Object.entries(value).slice(0, 10).map(([key, item]) => (
          <div key={key} className="rounded-lg bg-base-100/60 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-base-content/35">{formatLabel(key)}</div>
            <div className="mt-0.5 break-words text-xs text-base-content/75">{stringifyValue(item)}</div>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-xs leading-relaxed text-base-content/70">{String(value)}</p>;
}

function MetricCard({ label, value, tone }) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "error"
          ? "text-error"
          : "text-base-content";

  return (
    <div className="rounded-lg border border-base-300/50 bg-base-100/65 px-3 py-2">
      <div className="truncate text-[10px] uppercase tracking-wider text-base-content/40">{label}</div>
      <div className={`mt-1 truncate font-mono text-sm font-semibold tabular-nums ${toneClass}`}>{stringifyValue(value)}</div>
    </div>
  );
}

function MessageList({ items, tone = "base", stageName }) {
  const Icon = tone === "error" ? XCircleIcon : tone === "warning" ? ExclamationTriangleIcon : InformationCircleIcon;
  const textClass = tone === "error" ? "text-error/90" : tone === "warning" ? "text-warning/90" : "text-base-content/70";

  return (
    <ul className="space-y-2">
      {items.map((item, index) => {
        const rawText = itemText(item);
        const translated = tone === "error" || tone === "warning" ? translateError(rawText, stageName) : null;
        const displayText = translated?.userMessage || rawText;
        return (
          <li key={`${rawText}-${index}`} className={`text-xs ${textClass}`}>
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="leading-relaxed">{displayText}</span>
            </div>
            {translated?.userMessage && translated.userMessage !== rawText && (
              <div className="mt-1 break-words pl-5 font-mono text-[10px] opacity-60">{rawText}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RetryHistory({ retries }) {
  return (
    <div className="space-y-2">
      {retries.map((retry, index) => {
        const attempt = retry?.attempt ?? retry?.attempt_number ?? index + 1;
        const status = retry?.status || retry?.result || "attempted";
        const reason = retry?.reason || retry?.message || retry?.error || retry?.summary;
        return (
          <div key={index} className="flex items-start gap-2 rounded-lg bg-base-100/60 px-2.5 py-2">
            <ArrowPathIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-base-content/75">Attempt {attempt}</span>
                <span className="badge badge-xs badge-ghost">{String(status)}</span>
              </div>
              {reason && <p className="mt-1 break-words text-[11px] text-base-content/50">{itemText(reason)}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageLogs({ logs }) {
  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-base-300/70 p-2 font-mono text-[11px] text-base-content/65">
      {logs.map((log, index) => (
        <div key={`${itemText(log)}-${index}`} className="break-words leading-relaxed">
          {itemText(log)}
        </div>
      ))}
    </div>
  );
}

function ChecklistItem({ label, state }) {
  const config =
    state === "passed"
      ? { icon: CheckCircleIcon, className: "text-success" }
      : state === "warning"
        ? { icon: ExclamationTriangleIcon, className: "text-warning" }
        : state === "failed"
          ? { icon: XCircleIcon, className: "text-error" }
          : { icon: ClockIcon, className: "text-base-content/30" };
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${config.className}`} />
      <span className="text-xs text-base-content/70">{label}</span>
    </div>
  );
}

export default function AutoQuantPipelineCard({ stage, isExpanded: defaultExpanded = false }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const stepMetadata = getPipelineStep(stage?.name);
  const rawMappedStatus = mapStageStatus(stage?.status, stage?.name);
  const mappedStatus = normalizeMappedStatus(rawMappedStatus);
  const stageData = stage?.data || {};
  const stageMessage = firstPresent(stage?.message, stageData?.message, stageData?.status_message) || "";
  const stageDuration = firstPresent(stage?.duration_s, stageData?.duration_s, stage?.duration_seconds, stageData?.duration_seconds);
  const progress = Number(firstPresent(stage?.progress_percent, stage?.progress, stageData?.progress_percent, stageData?.progress));
  const metrics = normalizeMetrics(stage, stageData);
  const warnings = uniqueItems([
    ...toArray(stage?.warnings),
    ...toArray(stageData?.warnings),
    ...toArray(stage?.warning),
    ...toArray(stageData?.warning),
    ...toArray(stageData?.validation_notes),
  ]);
  const errors = uniqueItems([
    ...toArray(stage?.errors),
    ...toArray(stageData?.errors),
    ...toArray(stage?.error),
    ...toArray(stageData?.error),
    ...toArray(stage?.error_object),
    ...toArray(stageData?.error_object),
    ...toArray(stage?.failure),
    ...toArray(stageData?.failure),
  ]);
  const retryHistory = normalizeRetryHistory(stage, stageData);
  const logs = normalizeLogs(stage, stageData);
  const suggestions = normalizeSuggestions(stage, stageData, errors);
  const controlledFailure = isControlledFailure(stage, stageData, errors);
  const hasWarnings = mappedStatus === "warning" || warnings.length > 0;
  const hasFailures = mappedStatus === "failed" || errors.length > 0;
  const inputSummary = firstPresent(stage?.input_summary, stage?.inputSummary, stageData?.input_summary, stageData?.inputSummary, stageData?.inputs);
  const outputSummary = firstPresent(stage?.output_summary, stage?.outputSummary, stageData?.output_summary, stageData?.outputSummary, stageData?.outputs);
  const checks = firstPresent(stage?.checks, stageData?.checks, stepMetadata?.checks) || [];
  const checksArray = toArray(checks).length > 0 ? toArray(checks) : stepMetadata?.checks || [];
  const nextAction = getNextAction({ mappedStatus, controlledFailure, suggestions, hasWarnings, hasFailures });
  const stepNumber = stepMetadata ? PIPELINE_STEPS.findIndex((item) => item.id === stepMetadata.id) + 1 : stage?.index || "—";
  const topMetrics = metrics.slice(0, 3);

  const cardClass =
    mappedStatus === "running"
      ? "border-primary/40 border-l-2 border-l-primary bg-base-100 shadow-sm shadow-primary/10"
      : mappedStatus === "passed"
        ? "border-success/25 bg-base-100"
        : mappedStatus === "failed"
          ? "border-error/35 bg-base-100"
          : mappedStatus === "warning"
            ? "border-warning/35 bg-base-100"
            : "border-base-300/40 bg-base-100";

  const checkState = hasFailures ? "failed" : hasWarnings ? "warning" : mappedStatus === "passed" ? "passed" : mappedStatus === "running" ? "running" : "pending";

  return (
    <div className={`card border transition-all duration-300 ${cardClass}`}>
      <div className="card-body p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              mappedStatus === "running"
                ? "bg-primary/10 text-primary"
                : mappedStatus === "passed"
                  ? "bg-success/10 text-success"
                  : mappedStatus === "failed"
                    ? "bg-error/10 text-error"
                    : mappedStatus === "warning"
                      ? "bg-warning/10 text-warning"
                      : "bg-base-300/30 text-base-content/45"
            }`}
          >
            <span className="font-mono text-sm font-bold">{stepNumber}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-base-content">
                  {stepMetadata?.name || stage?.name || "Unknown Stage"}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-base-content/60">
                  {stepMetadata?.description || "AutoQuant is processing this pipeline stage."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={mappedStatus} controlled={controlledFailure} />
                {stageDuration != null && (
                  <span className="hidden text-[10px] font-mono text-base-content/35 sm:inline">{stringifyValue(stageDuration)}s</span>
                )}
              </div>
            </div>

            {(stageMessage || topMetrics.length > 0 || hasWarnings || hasFailures) && (
              <div className="mt-3 space-y-2">
                {stageMessage && <p className="text-[11px] leading-relaxed text-base-content/50">{stageMessage}</p>}
                {Number.isFinite(progress) && mappedStatus === "running" && (
                  <progress className="progress progress-primary h-1 w-full" value={Math.max(0, Math.min(100, progress))} max="100" />
                )}
                {topMetrics.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {topMetrics.map((metric, index) => (
                      <MetricCard key={`${metric.label}-${index}`} label={metric.label} value={metric.value} tone={metric.tone} />
                    ))}
                  </div>
                )}
                {controlledFailure && (
                  <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning/90">
                    AutoQuant stopped this stage intentionally because validation rules were not met. This is a controlled result, not a system crash.
                  </div>
                )}
                {!controlledFailure && hasFailures && errors.length > 0 && (
                  <div className="rounded-lg border border-error/25 bg-error/10 px-3 py-2 text-xs text-error/90">
                    {itemText(errors[0])}
                  </div>
                )}
                {!hasFailures && hasWarnings && warnings.length > 0 && (
                  <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning/90">
                    {itemText(warnings[0])}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="btn btn-ghost btn-xs btn-circle hover:bg-base-200"
            aria-label={isExpanded ? "Collapse stage details" : "Expand stage details"}
          >
            <ChevronRightIcon className={`h-4 w-4 text-base-content/60 transition-transform duration-200 ${isExpanded ? "rotate-90" : "rotate-0"}`} />
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3 border-t border-base-200/70 pt-4">
            {stepMetadata?.whyItMatters && (
              <DetailSection title="Why this matters" icon={InformationCircleIcon}>
                <p className="text-xs leading-relaxed text-base-content/70">{stepMetadata.whyItMatters}</p>
              </DetailSection>
            )}

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {inputSummary && (
                <DetailSection title="Input summary" icon={InformationCircleIcon}>
                  <SummaryBlock value={inputSummary} />
                </DetailSection>
              )}
              {outputSummary && (
                <DetailSection title="Output summary" icon={CheckCircleIcon} tone={mappedStatus === "passed" ? "success" : "base"}>
                  <SummaryBlock value={outputSummary} />
                </DetailSection>
              )}
            </div>

            {checksArray.length > 0 && (
              <DetailSection title="What it checked" icon={CheckCircleIcon}>
                <div className="space-y-1">
                  {checksArray.map((check, index) => (
                    <ChecklistItem key={`${itemText(check)}-${index}`} label={itemText(check)} state={checkState} />
                  ))}
                </div>
              </DetailSection>
            )}

            {metrics.length > 0 && (
              <DetailSection title="Key metrics" icon={InformationCircleIcon}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {metrics.map((metric, index) => (
                    <MetricCard key={`${metric.label}-${index}`} label={metric.label} value={metric.value} tone={metric.tone} />
                  ))}
                </div>
              </DetailSection>
            )}

            {warnings.length > 0 && (
              <DetailSection title="Warnings" icon={ExclamationTriangleIcon} tone="warning">
                <MessageList items={warnings} tone="warning" stageName={stage?.name} />
              </DetailSection>
            )}

            {errors.length > 0 && (
              <DetailSection title={controlledFailure ? "Controlled validation stop" : "Errors"} icon={XCircleIcon} tone="error">
                <MessageList items={errors} tone="error" stageName={stage?.name} />
              </DetailSection>
            )}

            {retryHistory.length > 0 && (
              <DetailSection title="Retry history" icon={ArrowPathIcon}>
                <RetryHistory retries={retryHistory} />
              </DetailSection>
            )}

            <DetailSection title="Suggested next action" icon={LightBulbIcon} tone={hasFailures || hasWarnings ? "warning" : "base"}>
              <p className="text-xs leading-relaxed text-base-content/75">{nextAction}</p>
              {suggestions.length > 1 && (
                <ul className="mt-2 space-y-1.5">
                  {suggestions.slice(1).map((suggestion, index) => (
                    <li key={`${itemText(suggestion)}-${index}`} className="flex items-start gap-2 text-xs text-base-content/65">
                      <LightBulbIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning/70" />
                      <span>{itemText(suggestion)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            {stageData?.per_pair && Array.isArray(stageData.per_pair) && stageData.per_pair.length > 0 && (
              <DetailSection title="Pairs" icon={InformationCircleIcon}>
                <div className="flex flex-wrap gap-1">
                  {stageData.per_pair.slice(0, 20).map((pair, index) => {
                    const pairName = typeof pair === "string" ? pair : pair.key || pair.pair || `Pair ${index + 1}`;
                    return (
                      <span key={`${pairName}-${index}`} className="badge badge-xs badge-primary badge-outline">
                        {pairName}
                      </span>
                    );
                  })}
                </div>
              </DetailSection>
            )}

            {stageData?.wfo_windows && Array.isArray(stageData.wfo_windows) && stageData.wfo_windows.length > 0 && (
              <DetailSection title="Walk-forward windows" icon={InformationCircleIcon}>
                <p className="text-xs text-base-content/70">
                  {stageData.wfo_windows.length} window{stageData.wfo_windows.length === 1 ? "" : "s"} tested.
                </p>
              </DetailSection>
            )}

            {logs.length > 0 && (
              <DetailSection title="Stage logs" icon={CommandLineIcon}>
                <StageLogs logs={logs} />
              </DetailSection>
            )}

            {!inputSummary && !outputSummary && metrics.length === 0 && warnings.length === 0 && errors.length === 0 && logs.length === 0 && mappedStatus === "pending" && (
              <div className="py-6 text-center">
                <span className="block select-none font-mono text-3xl leading-none text-base-content/[0.12]">{stepNumber}</span>
                <p className="mt-2 text-xs text-base-content/35">Waiting to start</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
