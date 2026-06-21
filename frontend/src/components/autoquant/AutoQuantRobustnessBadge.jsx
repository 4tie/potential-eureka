import { ChartBarIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export default function AutoQuantRobustnessBadge({ sensitivity }) {
  if (!sensitivity) return null;
  const { passed, score, label, p_best, p_minus, p_plus, param } = sensitivity;

  const isStable = passed !== false;
  const scoreColor =
    score === "High" ? "text-success" :
    score === "Medium" ? "text-warning" :
    "text-error";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs flex-wrap ${
      isStable
        ? "border-success/30 bg-success/5"
        : "border-warning/40 bg-warning/8"
    }`}>
      {isStable ? (
        <ChartBarIcon className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-warning" />
      )}
      <span className={`font-semibold ${isStable ? "text-success" : "text-warning"}`}>
        {isStable ? "Stable Plateau Detected" : "Warning: Sharp Peak"}
      </span>
      <span className={`badge badge-xs ${
        isStable ? "badge-success" : "badge-warning"
      }`}>
        {label}
      </span>
      <span className="text-base-content/50">/</span>
      <span className="text-base-content/60 uppercase tracking-wider text-[10px]">Robustness</span>
      <span className={`font-bold text-sm ${scoreColor}`}>{score}</span>
      {param && (
        <>
          <span className="text-base-content/30">/</span>
          <span className="text-[10px] text-base-content/40 font-mono">{param}</span>
        </>
      )}
      {p_best != null && p_minus != null && p_plus != null && (
        <div className="w-full flex gap-3 mt-0.5 text-[10px] font-mono text-base-content/50">
          <span>Best: <span className={p_best >= 0 ? "text-success" : "text-error"}>{p_best >= 0 ? "+" : ""}{(p_best * 100).toFixed(2)}%</span></span>
          <span>-5%: <span className={p_minus >= 0 ? "text-success" : "text-error"}>{p_minus >= 0 ? "+" : ""}{(p_minus * 100).toFixed(2)}%</span></span>
          <span>+5%: <span className={p_plus >= 0 ? "text-success" : "text-error"}>{p_plus >= 0 ? "+" : ""}{(p_plus * 100).toFixed(2)}%</span></span>
        </div>
      )}
    </div>
  );
}
