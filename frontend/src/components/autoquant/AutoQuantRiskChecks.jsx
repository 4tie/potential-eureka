import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

export default function AutoQuantRiskChecks({ checks }) {
  if (!checks) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(checks).map(([key, check]) => (
        <div
          key={key}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
            check.passed
              ? "border-success/30 bg-success/5 text-success"
              : "border-error/30 bg-error/10 text-error"
          }`}
        >
          {check.passed ? (
            <CheckCircleIcon className="h-4 w-4 shrink-0" aria-label="Passed" />
          ) : (
            <XCircleIcon className="h-4 w-4 shrink-0" aria-label="Failed" />
          )}
          <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>
          <span className="ml-auto text-base-content/60">{check.value}</span>
        </div>
      ))}
    </div>
  );
}
