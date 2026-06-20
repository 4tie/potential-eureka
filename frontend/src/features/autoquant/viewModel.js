import { STAGE_NAMES } from "./constants";

export function formatElapsed(secs = 0) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function getRunStatusFlags(status) {
  const isRunning = status === "running" || status === "pending";
  const isAwaitingApproval = status === "awaiting_user_approval";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isCancelled = status === "cancelled";
  const isInterrupted = status === "interrupted";

  return {
    isRunning,
    isCompleted,
    isFailed,
    isCancelled,
    isInterrupted,
    isAwaitingApproval,
    isDone: isCompleted || isFailed || isCancelled || isInterrupted,
  };
}

export function getProgressPercent(pipelineState) {
  if (pipelineState?.status === "completed") return 100;
  if (pipelineState?.progress_percent != null) return pipelineState.progress_percent;
  if (pipelineState?.progress != null) return pipelineState.progress;
  return pipelineState?.current_stage > 0
    ? Math.round((pipelineState.current_stage / STAGE_NAMES.length) * 100)
    : 0;
}

export function getEstimatedTimeRemaining({ elapsedSeconds = 0, currentStage = 0, isRunning = false }) {
  if (!isRunning || elapsedSeconds === 0 || currentStage === 0) return null;
  const avgTimePerStage = elapsedSeconds / currentStage;
  const remainingStages = STAGE_NAMES.length - currentStage;
  return Math.round(avgTimePerStage * remainingStages);
}

export function getTimerangeSummary(timerange) {
  try {
    const [startRaw, endRaw] = String(timerange || "").split("-");
    if (startRaw?.length !== 8 || endRaw?.length !== 8) return null;

    const start = new Date(`${startRaw.slice(0, 4)}-${startRaw.slice(4, 6)}-${startRaw.slice(6, 8)}`);
    const end = new Date(`${endRaw.slice(0, 4)}-${endRaw.slice(4, 6)}-${endRaw.slice(6, 8)}`);
    const days = Math.round((end - start) / 86400000);
    if (!Number.isFinite(days)) return null;

    return {
      days,
      months: (days / 30).toFixed(0),
      tone: days < 90 ? "error" : days < 180 ? "warning" : "success",
    };
  } catch (err) {
    console.debug("Failed to parse timerange:", err);
    return null;
  }
}

export function getWfoWindowSummary(form) {
  const parts = String(form?.in_sample_range || "").split("-");
  if (parts.length !== 2) return null;

  const start = new Date(parts[0].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
  const end = new Date(parts[1].replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
  const totalMonths = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30));
  const windowSize = Number(form.wfo_is_months) + Number(form.wfo_oos_months);
  const approxWindows =
    totalMonths >= windowSize ? Math.floor((totalMonths - form.wfo_is_months) / form.wfo_oos_months) : 0;

  return {
    totalMonths,
    approxWindows,
    isHealthy: approxWindows >= 2,
  };
}

export function getRunStatusLabel(pipelineState, flags) {
  if (flags.isAwaitingApproval) {
    return `Review required - Stage ${pipelineState.current_stage}/${STAGE_NAMES.length} - ${
      STAGE_NAMES[pipelineState.current_stage - 1] || "Approval"
    }`;
  }
  if (flags.isRunning) {
    return `Stage ${pipelineState.current_stage}/${STAGE_NAMES.length} - ${
      STAGE_NAMES[pipelineState.current_stage - 1] || "Starting..."
    }`;
  }
  if (flags.isCompleted) return "Pipeline Completed";
  if (flags.isFailed) return "Pipeline Failed";
  if (flags.isInterrupted) return "Pipeline Interrupted";
  if (flags.isCancelled) return "Pipeline Cancelled";
  return "Starting...";
}
