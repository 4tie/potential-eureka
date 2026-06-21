import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export default function AutoQuantInterruptedReport({ state }) {
  const lastStage = state.stages?.filter((s) => s.status !== "pending").slice(-1)[0];
  const interruptedAt = state.completed_at || state.created_at;
  return (
    <div className="alert border border-warning/40 bg-warning/10 text-warning">
      <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
      <div className="flex flex-col gap-1">
        <h4 className="font-bold text-sm flex items-center gap-2">
          Pipeline was interrupted (backend restarted)
        </h4>
        {lastStage && (
          <p className="text-xs opacity-80">
            Last active stage: {lastStage.index} - {lastStage.name}
            {lastStage.message ? `: ${lastStage.message}` : ""}
          </p>
        )}
        {interruptedAt && (
          <p className="text-xs opacity-60">
            Detected at: {new Date(interruptedAt).toLocaleString(undefined, {
              month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </p>
        )}
        <p className="text-xs opacity-60 mt-0.5">
          The run could not complete because the server restarted mid-execution. You may start a new run.
        </p>
      </div>
    </div>
  );
}
