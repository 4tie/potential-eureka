import { useState, useMemo } from "react";
import EquityCurveChart from "./EquityCurveChart.jsx";

const PAGE_SIZE = 20;

function fmt(val, digits = 2, suffix = "") {
  if (val == null) return "—";
  return `${Number(val).toFixed(digits)}${suffix}`;
}

function fmtCurrency(val) {
  if (val == null) return "—";
  const n = Number(val);
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(val) {
  if (val == null) return "—";
  const n = Number(val);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtDuration(minutes) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1440).toFixed(1)}d`;
}

function profitColor(val) {
  if (val == null) return "";
  return Number(val) >= 0 ? "text-success" : "text-error";
}

function parseTimerange(tr) {
  if (!tr || !tr.includes("-")) return { start: tr || "—", end: "—", days: null };
  const [s, e] = tr.split("-");
  const fmt8 = (d) => d && d.length === 8
    ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    : d;
  const startDate = fmt8(s);
  const endDate = fmt8(e);
  let days = null;
  try { days = Math.round((new Date(endDate) - new Date(startDate)) / 86400000); } catch { /* ignore */ }
  return { start: startDate, end: endDate, days };
}

const FLAG_STYLES = { warning: "alert-warning", danger: "alert-error", info: "alert-info" };
const FLAG_ICONS  = { warning: "⚠️", danger: "🔴", info: "ℹ️" };

function SmartFlagBanner({ flag }) {
  return (
    <div className={`alert ${FLAG_STYLES[flag.type] || "alert-warning"} py-2.5 px-4`}>
      <span className="text-base leading-none">{FLAG_ICONS[flag.type] || "⚠️"}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-mono font-bold opacity-60 uppercase tracking-wider">{flag.code}</span>
        <span className="text-sm">{flag.message}</span>
      </div>
    </div>
  );
}

function ExitReasonBar({ stat, total }) {
  const pct = total > 0 ? (stat.count / total) * 100 : 0;
  const isStoploss = stat.reason.toLowerCase().includes("stop");
  const isRoi = stat.reason.toLowerCase().includes("roi");
  const barColor = isStoploss ? "bg-error" : isRoi ? "bg-success" : "bg-primary";

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs font-mono text-base-content/70 w-44 shrink-0 truncate" title={stat.reason}>
        {stat.reason}
      </span>
      <div className="flex-1 h-2 bg-base-300 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-base-content/60 w-16 text-right shrink-0">
        {stat.count} <span className="opacity-50">({pct.toFixed(0)}%)</span>
      </span>
      <span className={`text-xs font-mono w-20 text-right shrink-0 ${stat.total_profit >= 0 ? "text-success" : "text-error"}`}>
        {fmtCurrency(stat.total_profit)}
      </span>
    </div>
  );
}

function SortBtn({ k, label, sortKey, sortDir, toggleSort }) {
  return (
    <button
      className="flex items-center gap-1 hover:text-primary transition-colors"
      onClick={() => toggleSort(k)}
    >
      {label}
      <span className="opacity-40">{sortKey === k ? (sortDir === 1 ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}

function TradesTable({ trades }) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("close_date");
  const [sortDir, setSortDir] = useState(-1);

  const sorted = useMemo(() => {
    return [...trades].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return -sortDir;
      if (av > bv) return sortDir;
      return 0;
    });
  }, [trades, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const slice = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-box border border-base-300">
        <table className="table table-xs table-zebra w-full">
          <thead>
            <tr className="text-xs text-base-content/50 bg-base-300/40">
              <th><SortBtn k="pair" label="Pair" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
              <th><SortBtn k="open_date" label="Open" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
              <th><SortBtn k="close_date" label="Close" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
              <th><SortBtn k="trade_duration" label="Dur." sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
              <th><SortBtn k="profit_ratio" label="Profit %" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
              <th><SortBtn k="profit_abs" label="Profit $" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
              <th><SortBtn k="exit_reason" label="Exit" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
              <th className="text-right"><SortBtn k="stake_amount" label="Stake" sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort} /></th>
            </tr>
          </thead>
          <tbody>
            {slice.map((t, i) => (
              <tr key={i} className="hover">
                <td className="font-mono font-semibold text-xs">{t.pair}</td>
                <td className="text-xs text-base-content/50">{t.open_date ? t.open_date.replace("T", " ").slice(0, 16) : "—"}</td>
                <td className="text-xs text-base-content/50">{t.close_date ? t.close_date.replace("T", " ").slice(0, 16) : "—"}</td>
                <td className="text-xs">{fmtDuration(t.trade_duration)}</td>
                <td className={`text-xs font-mono font-semibold ${profitColor(t.profit_ratio != null ? t.profit_ratio * 100 : null)}`}>
                  {t.profit_ratio != null ? fmtPct(t.profit_ratio * 100) : "—"}
                </td>
                <td className={`text-xs font-mono ${profitColor(t.profit_abs)}`}>{fmtCurrency(t.profit_abs)}</td>
                <td>
                  <span className={`badge badge-xs font-mono ${
                    (t.exit_reason || "").includes("roi") ? "badge-success" :
                    (t.exit_reason || "").includes("stop") ? "badge-error" : "badge-ghost"
                  }`}>
                    {t.exit_reason || "—"}
                  </span>
                </td>
                <td className="text-right text-xs font-mono text-base-content/50">
                  {t.stake_amount != null ? `$${Number(t.stake_amount).toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-base-content/40">
            {sorted.length} trades — page {page + 1} of {totalPages}
          </span>
          <div className="join">
            <button className="join-item btn btn-xs" disabled={page === 0} onClick={() => setPage(0)}>«</button>
            <button className="join-item btn btn-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
            <button className="join-item btn btn-xs btn-disabled">{page + 1}</button>
            <button className="join-item btn btn-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
            <button className="join-item btn btn-xs" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

const HEALTH_SEVERITY_STYLES = {
  green:  { badge: "badge-success",  border: "border-success/30",  bg: "bg-success/5",   icon: "✅", text: "text-success"  },
  yellow: { badge: "badge-warning",  border: "border-warning/30",  bg: "bg-warning/5",   icon: "⚠️", text: "text-warning"  },
  red:    { badge: "badge-error",    border: "border-error/30",    bg: "bg-error/5",     icon: "🔴", text: "text-error"    },
};

const HEALTH_OVERALL_LABEL = { green: "Healthy", yellow: "Needs Attention", red: "Critical Risk" };

function HealthCheckRow({ check }) {
  const [expanded, setExpanded] = useState(false);
  const style = HEALTH_SEVERITY_STYLES[check.severity] || HEALTH_SEVERITY_STYLES.green;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="text-base leading-none mt-0.5 shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${style.text}`}>{check.title}</span>
            <span className="text-[10px] font-mono text-base-content/30 uppercase tracking-wider">{check.code}</span>
          </div>
          <p className="text-xs text-base-content/70 mt-0.5 leading-snug">{check.message}</p>
        </div>
        {check.suggestion && (
          <button
            className="btn btn-xs btn-ghost shrink-0 text-[10px] gap-1 opacity-60 hover:opacity-100"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? "▲" : "▼"} Fix
          </button>
        )}
      </div>
      {expanded && check.suggestion && (
        <div className="px-4 pb-3 pt-0">
          <div className="bg-base-300/50 border border-base-300 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <span className="text-sm shrink-0 mt-0.5">💡</span>
            <p className="text-xs text-base-content/80 leading-relaxed">{check.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthReportCard({ report }) {
  const overall = HEALTH_SEVERITY_STYLES[report.overall_severity] || HEALTH_SEVERITY_STYLES.green;
  const label   = HEALTH_OVERALL_LABEL[report.overall_severity] || "Unknown";

  return (
    <div className="card bg-base-200 border border-base-300">
      <div className="card-body gap-3 py-4 px-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">🏥 Strategy Health Report</h3>
          </div>
          <span className={`badge badge-sm font-semibold ${overall.badge}`}>
            {label}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {report.checks.map((check, i) => (
            <HealthCheckRow key={i} check={check} />
          ))}
        </div>
        <p className="text-[10px] text-base-content/25 font-mono mt-1">
          Click "▼ Fix" on any flagged check to see an actionable suggestion
        </p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, valueClass = "" }) {
  return (
    <div className="bg-base-200 border border-base-300 rounded-box p-3.5 flex flex-col gap-1">
      <div className="text-[11px] text-base-content/40 font-medium uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-mono font-bold leading-tight ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-base-content/40 leading-snug">{sub}</div>}
    </div>
  );
}

export default function BacktestResults({ results, runId }) {
  const { parsed_summary: s, pair_results, trades, advanced_metrics: adv, smart_flags, health_report } = results;

  const isProfit = (s.net_profit_pct ?? 0) >= 0;

  const trStart = s.start_date || (() => {
    const { start } = parseTimerange(s.timerange || "");
    return start;
  })();
  const trEnd   = s.end_date   || (() => {
    const { end } = parseTimerange(s.timerange || "");
    return end;
  })();
  const days    = s.total_days ?? (() => {
    if (trStart && trEnd && trStart !== "—" && trEnd !== "—") {
      try { return Math.round((new Date(trEnd) - new Date(trStart)) / 86400000); } catch { /* ignore */ }
    }
    return null;
  })();

  const profitPerDay = s.profit_per_day
    ?? (s.net_profit_pct != null && days ? s.net_profit_pct / days : null);

  const exitTotal   = s.total_trades || 0;
  const exitReasons = s.exit_reason_distribution || [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-12 flex flex-col gap-5">

      {/* ── Smart Flags ─────────────────────────────────────────────────── */}
      {smart_flags && smart_flags.length > 0 && (
        <div className="flex flex-col gap-2">
          {smart_flags.map((flag, i) => <SmartFlagBanner key={i} flag={flag} />)}
        </div>
      )}

      {/* ── Health Report ────────────────────────────────────────────────── */}
      {health_report && <HealthReportCard report={health_report} />}

      {/* ── Hero Stats (DaisyUI stats) ──────────────────────────────────── */}
      <div className="stats stats-vertical sm:stats-horizontal bg-base-200 border border-base-300 shadow-sm w-full">

        {/* Wallet Lifecycle */}
        <div className="stat">
          <div className="stat-figure text-base-content/20 text-3xl hidden sm:block">💰</div>
          <div className="stat-title text-xs">Wallet Lifecycle</div>
          <div className={`stat-value text-xl font-mono ${isProfit ? "text-success" : "text-error"}`}>
            {s.final_balance != null
              ? `$${Number(s.final_balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
          </div>
          <div className="stat-desc flex items-center gap-1.5 flex-wrap">
            <span>Started: {s.starting_balance != null ? `$${Number(s.starting_balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>
            <span className={`font-semibold ${isProfit ? "text-success" : "text-error"}`}>
              ({fmtPct(s.net_profit_pct)})
            </span>
          </div>
        </div>

        {/* Time Range */}
        <div className="stat">
          <div className="stat-figure text-base-content/20 text-3xl hidden sm:block">📅</div>
          <div className="stat-title text-xs">Trading Window</div>
          <div className="stat-value text-xl font-mono text-base-content/80">
            {days != null ? `${days}d` : "—"}
          </div>
          <div className="stat-desc">
            {trStart && trStart !== "—" ? trStart : "—"}
            {" → "}
            {trEnd && trEnd !== "—" ? trEnd : "—"}
          </div>
        </div>

        {/* Daily Efficiency */}
        <div className="stat">
          <div className="stat-figure text-base-content/20 text-3xl hidden sm:block">⚡</div>
          <div className="stat-title text-xs">Daily Efficiency</div>
          <div className={`stat-value text-xl font-mono ${(profitPerDay ?? 0) >= 0 ? "text-success" : "text-error"}`}>
            {profitPerDay != null ? `${profitPerDay >= 0 ? "+" : ""}${profitPerDay.toFixed(3)}%` : "—"}
          </div>
          <div className="stat-desc">
            Profit % per day
            {s.trades_per_day != null && (
              <span> · {Number(s.trades_per_day).toFixed(2)} trades/day</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Equity Curve ─────────────────────────────────────────────────── */}
      {trades && trades.length >= 2 && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body gap-3 py-4 px-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Equity Curve</h3>
              <span className="text-[10px] text-base-content/40 font-mono">
                cumulative P&L over time
              </span>
            </div>
            <EquityCurveChart
              trades={trades}
              startingBalance={s.starting_balance}
            />
          </div>
        </div>
      )}

      {/* ── Net P&L + Risk grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Net P&L"
          value={fmtCurrency(s.net_profit_currency)}
          sub={`${s.total_trades ?? "—"} trades`}
          valueClass={isProfit ? "text-success" : "text-error"}
        />
        <MetricCard
          label="Max Drawdown"
          value={s.max_drawdown_pct != null ? `${Math.abs(s.max_drawdown_pct).toFixed(2)}%` : "—"}
          sub={s.max_drawdown_currency != null ? `$${Math.abs(s.max_drawdown_currency).toFixed(2)}` : undefined}
          valueClass="text-warning"
        />
        <MetricCard
          label="Win Rate"
          value={s.win_rate_pct != null ? `${Number(s.win_rate_pct).toFixed(1)}%` : "—"}
          sub={adv?.profit_factor != null ? `PF ${Number(adv.profit_factor).toFixed(2)}` : undefined}
          valueClass={(s.win_rate_pct ?? 0) >= 50 ? "text-success" : "text-error"}
        />
        <MetricCard
          label="Avg Duration"
          value={fmtDuration(s.avg_trade_duration_minutes)}
          sub="per trade"
        />
      </div>

      {/* ── Advanced Metrics row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Sharpe Ratio"  value={fmt(adv?.sharpe_ratio  ?? s.sharpe_ratio)} />
        <MetricCard label="Sortino Ratio" value={fmt(adv?.sortino_ratio ?? s.sortino_ratio)} />
        <MetricCard label="Expectancy"    value={fmt(adv?.expectancy    ?? s.expectancy, 4)} />
        <MetricCard label="Calmar Ratio"  value={fmt(adv?.calmar_ratio  ?? s.calmar_ratio)} />
      </div>

      {/* ── Exit Reason Breakdown ────────────────────────────────────────── */}
      {exitReasons.length > 0 && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body gap-3 py-4 px-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Exit Reason Breakdown</h3>
              <span className="text-xs text-base-content/40 font-mono">{exitTotal} total exits</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {exitReasons.map((stat) => (
                <ExitReasonBar key={stat.reason} stat={stat} total={exitTotal} />
              ))}
            </div>
            <div className="flex justify-end text-[10px] text-base-content/30 font-mono mt-1 border-t border-base-300 pt-2">
              count (%) · profit $
            </div>
          </div>
        </div>
      )}

      {/* ── Pair Performance ─────────────────────────────────────────────── */}
      {pair_results && pair_results.length > 0 && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body gap-3 py-4 px-5">
            <h3 className="text-sm font-semibold">Pair Performance</h3>
            <div className="overflow-x-auto">
              <table className="table table-xs w-full">
                <thead>
                  <tr className="text-xs text-base-content/50 bg-base-300/40">
                    <th>Pair</th>
                    <th className="text-right">Trades</th>
                    <th className="text-right">Win%</th>
                    <th className="text-right">Profit $</th>
                    <th className="text-right">Profit %</th>
                    <th className="text-right">Avg Dur.</th>
                  </tr>
                </thead>
                <tbody>
                  {pair_results.map((pr) => (
                    <tr key={pr.pair} className="hover">
                      <td className="font-mono font-semibold text-xs">{pr.pair}</td>
                      <td className="text-right text-xs">{pr.total_trades ?? "—"}</td>
                      <td className={`text-right text-xs font-mono ${(pr.win_rate_pct ?? 0) >= 50 ? "text-success" : "text-error"}`}>
                        {pr.win_rate_pct != null ? `${Number(pr.win_rate_pct).toFixed(1)}%` : "—"}
                      </td>
                      <td className={`text-right text-xs font-mono ${profitColor(pr.net_profit_currency)}`}>
                        {fmtCurrency(pr.net_profit_currency)}
                      </td>
                      <td className={`text-right text-xs font-mono ${profitColor(pr.net_profit_pct)}`}>
                        {fmtPct(pr.net_profit_pct)}
                      </td>
                      <td className="text-right text-xs text-base-content/50">
                        {fmtDuration(pr.avg_trade_duration_minutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Individual Trades ────────────────────────────────────────────── */}
      {trades && trades.length > 0 && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body gap-3 py-4 px-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Individual Trades</h3>
              <span className="badge badge-ghost badge-sm font-mono">{trades.length}</span>
            </div>
            <TradesTable trades={trades} />
          </div>
        </div>
      )}

      {/* Run ID footnote */}
      <div className="text-center text-[10px] text-base-content/20 font-mono pt-2">
        run · {runId}
      </div>
    </div>
  );
}
