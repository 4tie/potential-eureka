import { useState, useEffect, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useToast } from "./Toast.jsx";

const C_GREEN  = "#059669";
const C_RED    = "#ef4444";
const C_GRID   = "#27272a";
const C_MUTED  = "#71717a";
const C_BG     = "#09090b";

// ── formatting helpers ────────────────────────────────────────────────────────
function fmt(v, decimals = 2, suffix = "%") {
  if (v == null) return "—";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}${suffix}`;
}
function fmtNum(v, decimals = 2) {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function shortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

// ── inline markdown renderer (bold, bullets, section headers) ─────────────────
function renderExplanation(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const out = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      out.push(<div key={key++} className="h-3" />);
      continue;
    }

    // ### or ## heading
    if (/^#{1,3}\s/.test(trimmed)) {
      const content = trimmed.replace(/^#{1,3}\s+/, "");
      out.push(
        <h4 key={key++} className="text-sm font-semibold text-base-content mt-4 mb-1 first:mt-0">
          {inlineParse(content)}
        </h4>
      );
      continue;
    }

    // bullet: - or *
    if (/^[-*]\s/.test(trimmed)) {
      out.push(
        <div key={key++} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-primary mt-[3px] shrink-0">▸</span>
          <span>{inlineParse(trimmed.slice(2))}</span>
        </div>
      );
      continue;
    }

    // numbered list: 1. 2. etc.
    if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\.\s/)[1];
      const content = trimmed.replace(/^\d+\.\s+/, "");
      out.push(
        <div key={key++} className="flex gap-2 text-sm leading-relaxed">
          <span className="text-primary/60 font-mono shrink-0 w-5 text-right">{num}.</span>
          <span>{inlineParse(content)}</span>
        </div>
      );
      continue;
    }

    // plain paragraph
    out.push(
      <p key={key++} className="text-sm leading-relaxed text-base-content/85">
        {inlineParse(trimmed)}
      </p>
    );
  }
  return out;
}

function inlineParse(text) {
  // **bold** and *italic*
  const parts = [];
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0, m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={key++} className="font-semibold text-base-content">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={key++} className="italic">{m[3]}</em>);
    else if (m[4]) parts.push(<code key={key++} className="font-mono text-xs bg-base-300 px-1 rounded">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

// ── sub-components ────────────────────────────────────────────────────────────
function ProfitCell({ value }) {
  if (value == null) return <span className="text-base-content/30">—</span>;
  const n = Number(value);
  return (
    <span className={n >= 0 ? "text-success font-mono" : "text-error font-mono"}>
      {n >= 0 ? "+" : ""}{n.toFixed(2)}%
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    completed: "bg-success/15 text-success border-success/30",
    failed:    "bg-error/15 text-error border-error/30",
    running:   "bg-primary/15 text-primary border-primary/30",
    cancelled: "bg-warning/15 text-warning border-warning/30",
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${map[status] || "bg-base-300/40 text-base-content/30 border-base-300/50"}`}>
      {status}
    </span>
  );
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C_BG, border: "1px solid #3f3f46", borderRadius: 6,
      padding: "8px 12px", fontSize: 11, fontFamily: "ui-monospace,monospace",
      boxShadow: "0 4px 16px rgba(0,0,0,.7)",
    }}>
      <div style={{ color: C_MUTED, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {p.value != null ? `${Number(p.value) >= 0 ? "+" : ""}${Number(p.value).toFixed(2)}${p.dataKey === "total_trades" ? "" : "%"}` : "—"}
        </div>
      ))}
    </div>
  );
}

function ParamsBlock({ params }) {
  if (!params) return <span className="text-base-content/30 text-xs">No parameter snapshot available for this run.</span>;
  const sections = [
    { label: "Buy Params",        data: params.buy_params },
    { label: "Sell Params",       data: params.sell_params },
    { label: "Protection Params", data: params.protection_params },
    { label: "Custom Params",     data: params.custom_params },
  ];
  const hasSection = sections.some(s => s.data && Object.keys(s.data).length > 0);
  return (
    <div className="space-y-3 text-xs font-mono">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-base-content/80">
        <span className="text-base-content/40">Stoploss</span>
        <span>{params.stoploss != null ? `${(params.stoploss * 100).toFixed(2)}%` : "—"}</span>
        <span className="text-base-content/40">Trailing Stop</span>
        <span>{params.trailing_stop ? "Yes" : "No"}</span>
        {params.trailing_stop_positive != null && <>
          <span className="text-base-content/40">Trailing Positive</span>
          <span>{(params.trailing_stop_positive * 100).toFixed(2)}%</span>
        </>}
        {params.trailing_stop_positive_offset != null && <>
          <span className="text-base-content/40">Trailing Offset</span>
          <span>{(params.trailing_stop_positive_offset * 100).toFixed(2)}%</span>
        </>}
      </div>

      {params.roi_table && Object.keys(params.roi_table).length > 0 && (
        <div>
          <div className="text-base-content/40 mb-1">Minimal ROI</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 pl-2">
            {Object.entries(params.roi_table).map(([k, v]) => (
              <div key={k} className="contents">
                <span className="text-base-content/50">{k}m</span>
                <span>{(Number(v) * 100).toFixed(3)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSection && sections.map(({ label, data }) => {
        if (!data || Object.keys(data).length === 0) return null;
        return (
          <div key={label}>
            <div className="text-base-content/40 mb-1">{label}</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 pl-2">
              {Object.entries(data).map(([k, v]) => (
                <div key={k} className="contents">
                  <span className="text-base-content/50">{k}</span>
                  <span>{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Explain Modal ─────────────────────────────────────────────────────────────
function ExplainModal({ strategyName, onClose }) {
  const [configModel, setConfigModel]   = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [loading, setLoading]           = useState(false);
  const [explanation, setExplanation]   = useState(null);
  const [usedModel, setUsedModel]       = useState(null);
  const [error, setError]               = useState(null);
  const [requested, setRequested]       = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => {
        setConfigModel(d.settings?.ollama_model || "");
        setConfigLoading(false);
      })
      .catch(() => { setConfigModel(""); setConfigLoading(false); });
  }, []);

  const runExplain = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExplanation(null);
    setUsedModel(null);
    setRequested(true);
    try {
      const res = await fetch("/api/ai/explain-strategy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ strategy_name: strategyName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed");
      setExplanation(data.explanation);
      setUsedModel(data.model);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [strategyName]);

  const notConfigured = !configLoading && !configModel;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl max-h-[88vh] overflow-y-auto p-0 flex flex-col">

        {/* header */}
        <div className="sticky top-0 bg-base-200 border-b border-base-300 px-5 py-3.5 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🧠</span>
            <div>
              <h3 className="font-semibold text-sm tracking-tight">Explain Strategy Logic</h3>
              <p className="text-[11px] text-base-content/40 mt-0.5 font-mono">{strategyName}</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm btn-square" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* body */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto">

          {/* config loading */}
          {configLoading && (
            <div className="flex items-center justify-center py-16">
              <span className="loading loading-spinner loading-md opacity-30" />
            </div>
          )}

          {/* not configured */}
          {notConfigured && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="text-5xl opacity-20 select-none">⚙️</div>
              <div>
                <p className="text-sm font-semibold">No AI model configured</p>
                <p className="text-xs text-base-content/40 mt-1 max-w-xs mx-auto">
                  Go to <strong>Settings → AI Assistant</strong>, enter your Ollama URL,
                  refresh models, select one, and save.
                </p>
              </div>
              <button className="btn btn-sm btn-ghost border border-base-300" onClick={onClose}>
                Open Settings →
              </button>
            </div>
          )}

          {/* ready to run */}
          {!configLoading && !notConfigured && !requested && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-5">
              <div className="text-6xl opacity-20 select-none">🧠</div>
              <div>
                <p className="text-sm font-medium">Explain this strategy using your local AI</p>
                <p className="text-xs text-base-content/40 mt-1 max-w-xs mx-auto">
                  Reads the strategy source and asks your configured Ollama model to explain it in plain language.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-base-content/50">
                <span>Model:</span>
                <span className="font-mono bg-base-300 px-2 py-0.5 rounded text-base-content/70">{configModel}</span>
              </div>
              <button
                className="btn btn-primary gap-2"
                onClick={runExplain}
              >
                <span className="text-base">🧠</span>
                Explain Logic
              </button>
            </div>
          )}

          {/* loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 gap-4">
              <span className="loading loading-spinner loading-lg text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Thinking…</p>
                <p className="text-xs text-base-content/40 mt-1">
                  Local models can take 15–60 seconds. Hang tight.
                </p>
              </div>
            </div>
          )}

          {/* error */}
          {error && !loading && (
            <div className="space-y-3">
              <div className="alert alert-error text-sm gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
              {(error.toLowerCase().includes("ollama") || error.toLowerCase().includes("connect") || error.toLowerCase().includes("settings")) && (
                <div className="bg-base-200 border border-base-300 rounded-lg p-3 text-xs text-base-content/60 space-y-1">
                  <p className="font-semibold text-base-content/80">Quick fix:</p>
                  <p>1. Go to <strong>Settings → AI Assistant</strong> and verify the Ollama URL</p>
                  <p>2. Ensure Ollama is running: <code className="bg-base-300 px-1 rounded font-mono">ollama serve</code></p>
                  <p>3. If no model is set, click <strong>Refresh Models</strong> in Settings and select one</p>
                </div>
              )}
              <div className="flex justify-center">
                <button
                  className="btn btn-sm btn-ghost gap-1.5"
                  onClick={runExplain}
                >
                  ↻ Try Again
                </button>
              </div>
            </div>
          )}

          {/* explanation */}
          {explanation && !loading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-base-content/40">
                  <span className="font-mono bg-base-300 px-1.5 py-0.5 rounded">{usedModel || configModel}</span>
                  <span>·</span>
                  <span>Local Ollama</span>
                </div>
                <button
                  className="btn btn-ghost btn-xs gap-1"
                  onClick={() => { setExplanation(null); setRequested(false); setError(null); }}
                  title="Run again"
                >
                  ↻ Re-run
                </button>
              </div>

              <div className="bg-base-200 border border-base-300 rounded-xl p-4 space-y-1.5">
                {renderExplanation(explanation)}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="sticky bottom-0 bg-base-200 border-t border-base-300 px-5 py-3 flex justify-between items-center shrink-0">
          <span className="text-[10px] text-base-content/25 italic">Powered by local Ollama — no data leaves your machine</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </dialog>
  );
}

// ── Inspect Modal ─────────────────────────────────────────────────────────────
function InspectModal({ run, onClose, onApply, applying }) {
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/performance/runs/${run.run_id}`)
      .then(r => {
        if (!cancelled) setTimeout(() => setLoading(true), 0);
        return r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || "Failed to load run detail"));
      })
      .then(d => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [run.run_id]);

  const s = detail?.parsed_summary;
  const pairs = detail?.pair_results || [];

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 bg-base-200 border-b border-base-300 px-5 py-3.5 flex items-center justify-between z-10">
          <div>
            <h3 className="font-semibold text-sm tracking-tight">Run Inspection</h3>
            <p className="text-[11px] text-base-content/40 mt-0.5">{run.run_id} · {fmtDate(run.created_at)}</p>
          </div>
          <button className="btn btn-ghost btn-sm btn-square" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="loading loading-spinner loading-md opacity-40" />
            </div>
          )}
          {error && <div className="alert alert-error text-xs">{error}</div>}

          {!loading && !error && detail && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Net Profit",    value: s?.net_profit_pct != null ? fmt(s.net_profit_pct) : "—",    color: s?.net_profit_pct >= 0 ? "text-success" : "text-error" },
                  { label: "Max Drawdown",  value: s?.max_drawdown_pct != null ? fmt(s.max_drawdown_pct) : "—", color: "text-warning" },
                  { label: "Total Trades",  value: s?.total_trades ?? "—",                                      color: "text-base-content" },
                  { label: "Win Rate",      value: s?.win_rate_pct != null ? `${Number(s.win_rate_pct).toFixed(1)}%` : "—", color: "text-base-content" },
                  { label: "Sharpe Ratio",  value: s?.sharpe_ratio != null ? fmtNum(s.sharpe_ratio) : "—",    color: "text-base-content" },
                  { label: "Sortino",       value: s?.sortino_ratio != null ? fmtNum(s.sortino_ratio) : "—",  color: "text-base-content" },
                  { label: "Profit Factor", value: s?.profit_factor != null ? fmtNum(s.profit_factor) : "—",  color: "text-base-content" },
                  { label: "Calmar",        value: s?.calmar_ratio != null ? fmtNum(s.calmar_ratio) : "—",    color: "text-base-content" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-base-200 rounded-lg px-3 py-2.5">
                    <div className="text-[10px] text-base-content/40 uppercase tracking-wide mb-1">{label}</div>
                    <div className={`text-sm font-semibold font-mono ${color}`}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                <div className="flex gap-2 text-base-content/50"><span>Strategy version</span><span className="text-base-content/70 font-mono">{detail.metadata?.strategy_version_id ?? "—"}</span></div>
                <div className="flex gap-2 text-base-content/50"><span>Timeframe</span><span className="text-base-content/70">{detail.metadata?.timeframe ?? "—"}</span></div>
                <div className="flex gap-2 text-base-content/50"><span>Timerange</span><span className="text-base-content/70 font-mono">{detail.metadata?.timerange ?? "—"}</span></div>
                <div className="flex gap-2 text-base-content/50"><span>Pairs</span><span className="text-base-content/70">{detail.metadata?.pairs?.length ?? 0}</span></div>
              </div>

              {pairs.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Per-Pair Results</h4>
                  <div className="overflow-x-auto rounded-lg border border-base-300">
                    <table className="table table-xs w-full">
                      <thead>
                        <tr className="bg-base-200 text-[10px] uppercase tracking-wide text-base-content/40">
                          <th>Pair</th>
                          <th className="text-right">Net Profit</th>
                          <th className="text-right">Trades</th>
                          <th className="text-right">Win Rate</th>
                          <th className="text-right">Wins</th>
                          <th className="text-right">Losses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pairs.map((p) => (
                          <tr key={p.pair} className="hover:bg-base-200/50">
                            <td className="font-mono text-xs">{p.pair}</td>
                            <td className="text-right"><ProfitCell value={p.net_profit_pct} /></td>
                            <td className="text-right text-base-content/70">{p.total_trades ?? "—"}</td>
                            <td className="text-right text-base-content/70">{p.win_rate_pct != null ? `${Number(p.win_rate_pct).toFixed(1)}%` : "—"}</td>
                            <td className="text-right text-success/80">{p.win_count ?? "—"}</td>
                            <td className="text-right text-error/80">{p.loss_count ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">Parameter Block</h4>
                <div className="bg-base-200 rounded-lg p-3 border border-base-300">
                  <ParamsBlock params={detail.params_snapshot} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-base-200 border-t border-base-300 px-5 py-3 flex justify-end gap-2">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          <button
            className="btn btn-primary btn-sm gap-1.5"
            onClick={() => onApply(run)}
            disabled={applying || loading || !!error || !detail?.params_snapshot}
          >
            {applying
              ? <><span className="loading loading-spinner loading-xs" />Applying…</>
              : <>⚙️ Apply Parameters</>
            }
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/50" onClick={onClose} />
    </dialog>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function PerformanceTab({ strategies = [], strategiesLoading = false, onAgentContextChange = null }) {
  const { push: pushToast } = useToast();

  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [runs, setRuns]                         = useState([]);
  const [runsLoading, setRunsLoading]           = useState(false);
  const [runsError, setRunsError]               = useState(null);
  const [inspecting, setInspecting]             = useState(null);
  const [applying, setApplying]                 = useState(false);
  const [showExplain, setShowExplain]           = useState(false);
  const lastStrategyRef = useRef("");

  useEffect(() => {
    if (!onAgentContextChange) return;
    onAgentContextChange({
      active_panel: inspecting ? "run-inspection" : "archive",
      strategy_name: selectedStrategy || null,
      auto_quant_run_id: null,
      optimizer_session_id: null,
      optimizer_trial_number: null,
      backtest_run_id: inspecting?.run_id ?? null,
      api_session_id: null,
    });
  }, [inspecting, onAgentContextChange, selectedStrategy]);

  const loadRuns = useCallback((strategyName) => {
    if (!strategyName) return;
    setRunsLoading(true);
    setRunsError(null);
    setRuns([]);
    fetch(`/api/performance/runs?strategy=${encodeURIComponent(strategyName)}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || "Failed to load runs")))
      .then(data => { setRuns(data.runs || []); setRunsLoading(false); })
      .catch(e => { setRunsError(String(e)); setRunsLoading(false); });
  }, []);

  useEffect(() => {
    if (selectedStrategy && selectedStrategy !== lastStrategyRef.current) {
      lastStrategyRef.current = selectedStrategy;
      loadRuns(selectedStrategy);
    }
  }, [selectedStrategy, loadRuns]);

  const handleApply = useCallback(async (run) => {
    setApplying(true);
    try {
      const res = await fetch(`/api/performance/runs/${run.run_id}/apply`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Apply failed");
      pushToast(data.message, "success", 8000);
      setInspecting(null);
    } catch (e) {
      pushToast(`Failed to apply parameters: ${e.message}`, "error");
    } finally {
      setApplying(false);
    }
  }, [pushToast]);

  const completedRuns = runs.filter(r => r.run_status === "completed");

  const chartData = [...completedRuns]
    .reverse()
    .map((r) => ({
      label:            shortDate(r.created_at),
      net_profit_pct:   r.net_profit_pct != null ? Number(r.net_profit_pct.toFixed(2)) : null,
      max_drawdown_pct: r.max_drawdown_pct != null ? Math.abs(Number(r.max_drawdown_pct.toFixed(2))) : null,
      total_trades:     r.total_trades ?? null,
    }));

  const hasChart = chartData.length >= 2;

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5">

      {/* page header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Performance Archive</h2>
          <p className="text-xs text-base-content/40 mt-0.5">Browse historical backtests, compare analytics, and restore past parameters.</p>
        </div>
      </div>

      {/* control bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-base-content/50 shrink-0">Strategy</label>
        <select
          className="select select-sm select-bordered w-64"
          value={selectedStrategy}
          onChange={e => setSelectedStrategy(e.target.value)}
          disabled={strategiesLoading}
        >
          <option value="">
            {strategiesLoading ? "Loading strategies…" : "— Select a strategy —"}
          </option>
          {strategies.map(s => (
            <option key={s.strategy_name} value={s.strategy_name}>
              {s.strategy_name}
            </option>
          ))}
        </select>

        {selectedStrategy && !runsLoading && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => loadRuns(selectedStrategy)}
            title="Refresh"
          >
            ↻
          </button>
        )}

        {selectedStrategy && (
          <button
            className="btn btn-sm gap-2 bg-violet-950/50 border-violet-700/40 text-violet-300 hover:bg-violet-900/60 hover:border-violet-600/60"
            onClick={() => setShowExplain(true)}
            title="Ask local AI to explain this strategy's logic"
          >
            <span className="text-base leading-none">🧠</span>
            Explain Logic
          </button>
        )}
      </div>

      {/* empty state */}
      {!selectedStrategy && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4 opacity-15">📈</div>
          <p className="text-sm text-base-content/40">Select a strategy above to view its backtest history.</p>
        </div>
      )}

      {selectedStrategy && runsLoading && (
        <div className="flex items-center justify-center py-20">
          <span className="loading loading-spinner loading-md opacity-40" />
        </div>
      )}

      {selectedStrategy && runsError && (
        <div className="alert alert-error text-xs">{runsError}</div>
      )}

      {selectedStrategy && !runsLoading && !runsError && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3 opacity-15">🗂️</div>
          <p className="text-sm text-base-content/40">No backtest runs found for <span className="font-semibold">{selectedStrategy}</span>.</p>
          <p className="text-xs text-base-content/25 mt-1">Run a backtest to start building history.</p>
        </div>
      )}

      {selectedStrategy && !runsLoading && runs.length > 0 && (
        <>
          {/* summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Runs",     value: runs.length },
              { label: "Completed",      value: completedRuns.length },
              {
                label: "Best Net Profit",
                value: completedRuns.filter(r => r.net_profit_pct != null).length
                  ? fmt(Math.max(...completedRuns.filter(r => r.net_profit_pct != null).map(r => r.net_profit_pct)))
                  : "—",
                color: "text-success",
              },
              {
                label: "Avg Net Profit",
                value: completedRuns.filter(r => r.net_profit_pct != null).length
                  ? fmt(
                      completedRuns.filter(r => r.net_profit_pct != null)
                        .reduce((s, r) => s + r.net_profit_pct, 0) /
                      completedRuns.filter(r => r.net_profit_pct != null).length
                    )
                  : "—",
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-base-200 border border-base-300 rounded-lg px-3 py-3">
                <div className="text-[10px] text-base-content/40 uppercase tracking-wide mb-1">{label}</div>
                <div className={`text-base font-semibold font-mono ${color || "text-base-content"}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* analytics chart */}
          {hasChart && (
            <div className="bg-base-200 border border-base-300 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-4">
                Performance Trend — {completedRuns.length} Completed Runs
              </h3>
              <ResponsiveContainer width="100%" height={220} debounce={50}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={C_GRID} strokeDasharray="3 3" strokeOpacity={0.5} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: C_MUTED, fontFamily: "ui-monospace,monospace" }}
                    axisLine={{ stroke: C_GRID }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="pct"
                    tick={{ fontSize: 10, fill: C_MUTED, fontFamily: "ui-monospace,monospace" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}%`}
                  />
                  <YAxis
                    yAxisId="trades"
                    orientation="right"
                    tick={{ fontSize: 10, fill: C_MUTED }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C_MUTED, paddingTop: 8 }} iconSize={8} />
                  <Bar yAxisId="trades" dataKey="total_trades" name="Trades" fill="#3f3f46" opacity={0.4} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="net_profit_pct" name="Net Profit %" stroke={C_GREEN} strokeWidth={2} dot={{ r: 3, fill: C_GREEN, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                  <Line yAxisId="pct" type="monotone" dataKey="max_drawdown_pct" name="Max Drawdown %" stroke={C_RED} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: C_RED, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* history table */}
          <div className="bg-base-200 border border-base-300 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-base-300">
              <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
                Historical Runs ({runs.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="bg-base-300/30 text-[10px] uppercase tracking-wide text-base-content/40">
                    <th>Run Date</th>
                    <th>Version</th>
                    <th>Timeframe</th>
                    <th>Pairs</th>
                    <th className="text-right">Net Profit</th>
                    <th className="text-right">Max DD</th>
                    <th className="text-right">Trades</th>
                    <th>Status</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.run_id}
                      className="hover:bg-base-300/20 cursor-pointer"
                      onClick={() => setInspecting(run)}
                    >
                      <td className="text-xs text-base-content/70 whitespace-nowrap">{fmtDate(run.created_at)}</td>
                      <td className="font-mono text-[11px] text-base-content/50">{run.strategy_version_id || "—"}</td>
                      <td className="text-xs text-base-content/70">{run.timeframe || "—"}</td>
                      <td className="text-xs text-base-content/70">{run.pairs?.length ?? "—"}</td>
                      <td className="text-right"><ProfitCell value={run.net_profit_pct} /></td>
                      <td className="text-right text-xs">
                        {run.max_drawdown_pct != null
                          ? <span className="text-warning font-mono">{Math.abs(run.max_drawdown_pct).toFixed(2)}%</span>
                          : <span className="text-base-content/30">—</span>
                        }
                      </td>
                      <td className="text-right text-xs text-base-content/70">{run.total_trades ?? "—"}</td>
                      <td><StatusBadge status={run.run_status} /></td>
                      <td className="text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="btn btn-ghost btn-xs"
                            title="Inspect run"
                            onClick={() => setInspecting(run)}
                          >
                            🔍
                          </button>
                          {run.run_status === "completed" && (
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Apply parameters to active strategy"
                              onClick={() => handleApply(run)}
                              disabled={applying}
                            >
                              {applying ? <span className="loading loading-spinner loading-xs" /> : "⚙️"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* modals */}
      {inspecting && (
        <InspectModal
          run={inspecting}
          onClose={() => setInspecting(null)}
          onApply={handleApply}
          applying={applying}
        />
      )}

      {showExplain && selectedStrategy && (
        <ExplainModal
          strategyName={selectedStrategy}
          onClose={() => setShowExplain(false)}
        />
      )}
    </div>
  );
}
