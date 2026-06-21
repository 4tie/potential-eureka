import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from "@heroicons/react/24/outline";

export default function AutoQuantWfoWindowsTable({ windows = [] }) {
  if (windows.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-base-content/40 py-4 justify-center">
        <span className="loading loading-dots loading-xs" />
        Waiting for first window...
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-base-content/40 text-[9px] uppercase tracking-wider">
            <th className="font-semibold">Win</th>
            <th className="font-semibold">IS Period</th>
            <th className="font-semibold">OOS Period</th>
            <th className="font-semibold text-right">Profit</th>
            <th className="font-semibold text-right">Max DD</th>
            <th className="font-semibold text-right">Trades</th>
            <th className="font-semibold text-right">Weight</th>
            <th className="font-semibold text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((w) => {
            const isLast = w.window === windows[windows.length - 1]?.window;
            const profit = w.profit != null ? w.profit : null;
            return (
              <tr
                key={w.window}
                className={`text-xs ${isLast ? "bg-primary/5 font-medium" : ""}`}
              >
                <td>
                  <span className="font-mono text-base-content/60">W{w.window}</span>
                  {isLast && (
                    <span className="ml-1 badge badge-primary badge-xs">latest</span>
                  )}
                </td>
                <td className="font-mono text-[10px] text-base-content/50">{w.is_range?.replace("-", " to ")}</td>
                <td className="font-mono text-[10px] text-base-content/50">{w.oos_range?.replace("-", " to ")}</td>
                <td className={`text-right font-mono font-semibold ${
                  profit == null ? "text-base-content/30" :
                  profit >= 0 ? "text-success" : "text-error"
                }`}>
                  {profit == null ? "-" : `${profit >= 0 ? "+" : ""}${profit.toFixed(2)}%`}
                </td>
                <td className={`text-right font-mono ${
                  w.max_dd == null ? "text-base-content/30" :
                  w.max_dd > 20 ? "text-error" : w.max_dd > 10 ? "text-warning" : "text-base-content/60"
                }`}>
                  {w.max_dd == null ? "-" : `${w.max_dd.toFixed(1)}%`}
                </td>
                <td className="text-right font-mono text-base-content/60">
                  {w.trades ?? "-"}
                </td>
                <td className="text-right font-mono text-base-content/40 text-[10px]">
                  {w.recency_weight?.toFixed(2) ?? "-"}x
                </td>
                <td className="text-center">
                  {w.status === "passed" && (
                    <span className="badge badge-success badge-xs gap-1">
                      <CheckCircleIcon className="h-3 w-3" />
                      pass
                    </span>
                  )}
                  {w.status === "warning" && (
                    <span className="badge badge-warning badge-xs gap-1">
                      <ExclamationTriangleIcon className="h-3 w-3" />
                      warn
                    </span>
                  )}
                  {w.status === "failed" && (
                    <span className="badge badge-error badge-xs gap-1">
                      <XCircleIcon className="h-3 w-3" />
                      fail
                    </span>
                  )}
                  {!w.status && <span className="badge badge-ghost badge-xs">pending</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
