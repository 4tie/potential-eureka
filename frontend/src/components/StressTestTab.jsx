import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api.js";

const TIMEFRAMES = ["1m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w"];

const DATE_PRESETS = [
  { label: "6 Months",  days: 180 },
  { label: "1 Year",    days: 365 },
  { label: "2 Years",   days: 730 },
  { label: "3 Years",   days: 1095 },
];

const CRASH_PERIODS = [
  { label: "COVID Crash",          period: "Feb–Mar 2020" },
  { label: "China Mining Ban",     period: "May–Jul 2021" },
  { label: "Crypto Winter Onset",  period: "Jan–Apr 2022" },
  { label: "Luna / UST Collapse",  period: "May–Jun 2022" },
  { label: "Summer Liquidity Crisis", period: "Jun–Aug 2022" },
  { label: "FTX Collapse",         period: "Nov–Dec 2022" },
];

const POLL_MS = 2500;

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function toTimerange(s, e) {
  return `${s.replace(/-/g,""  )}-${e.replace(/-/g,"")}`;
}
function fromTimerange(tr) {
  if (!tr || !tr.includes("-")) return { start: "", end: "" };
  const [s, e] = tr.split("-");
  return {
    start: s.length === 8 ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : "",
    end:   e.length === 8 ? `${e.slice(0,4)}-${e.slice(4,6)}-${e.slice(6,8)}` : "",
  };
}
function applyPreset(days, setStart, setEnd, setTR) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const s = fmtDate(start), e = fmtDate(end);
  setStart(s); setEnd(e); setTR(toTimerange(s, e));
}
function fmt2(n) {
  if (n == null) return "—";
  const fixed = Number(n).toFixed(2);
  return n > 0 ? `+${fixed}%` : `${fixed}%`;
}
function scoreColor(score) {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-error";
}
function scoreLabel(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Moderate";
  if (score >= 20) return "Weak";
  return "Poor";
}

function ModeCard({ icon, title, subtitle, selected, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col gap-1 px-4 py-4 rounded-xl border-2 text-left transition-all
        ${selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-base-300 hover:border-base-content/30 text-base-content/70"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="font-semibold text-sm">{title}</span>
      <span className="text-xs text-base-content/50">{subtitle}</span>
    </button>
  );
}

function SegmentBadge({ status }) {
  if (status === "profitable") {
    return (
      <span className="badge badge-success badge-sm gap-1">
        <span>✓</span> Profitable
      </span>
    );
  }
  if (status === "loss") {
    return (
      <span className="badge badge-error badge-sm gap-1">
        <span>⚠</span> Loss
      </span>
    );
  }
  if (status === "failed") {
    return <span className="badge badge-neutral badge-sm">Failed</span>;
  }
  if (status === "running") {
    return (
      <span className="badge badge-warning badge-sm gap-1">
        <span className="loading loading-spinner loading-xs"></span> Running
      </span>
    );
  }
  return <span className="badge badge-ghost badge-sm">{status}</span>;
}

const OPT_PREFIX = "__opt__:";

export default function StressTestTab({
  strategies,
  strategiesLoading,
  availablePairs,
  searchPairs,
  sharedState,
  sharedLoading,
  syncSharedState,
}) {
  const [strategy,    setStrategy]    = useState("");
  const [timeframe,   setTimeframe]   = useState("1h");
  const [exportedTrials, setExportedTrials] = useState([]);
  const [startDate,   setStartDate]   = useState("");
  const [endDate,     setEndDate]     = useState("");
  const [timerange,   setTimerange]   = useState("");
  const [pairs,       setPairs]       = useState([]);
  const [pairSearch,  setPairSearch]  = useState("");
  const [pairDropOpen,setPairDropOpen]= useState(false);
  const pairDropRef = useRef(null);

  const [mode,        setMode]        = useState("time_split");
  const [nSplits,     setNSplits]     = useState(4);
  const [nWindows,    setNWindows]    = useState(5);
  const [windowDays,  setWindowDays]  = useState(14);

  const [running,     setRunning]     = useState(false);
  const [runError,    setRunError]    = useState(null);
  const [progress,    setProgress]    = useState(null);
  const [result,      setResult]      = useState(null);

  const pollRef  = useRef(null);
  const hasChanged = useRef(false);

  // ── fetch exported optimizer trials on mount ───────────────────────────
  useEffect(() => {
    fetch("/api/optimizer/exported-trials")
      .then(r => r.ok ? r.json() : { trials: [] })
      .then(data => setExportedTrials(data.trials || []))
      .catch(() => {});
  }, []);

  const [filteredPairs, setFilteredPairs] = useState([]);
  const prevFilteredPairsRef = useRef([]);
  useEffect(() => {
    const q = pairSearch.toUpperCase();
    const newFilteredPairs = q
        ? (availablePairs || []).filter(p => p.includes(q)).slice(0, 20)
        : (availablePairs || []).slice(0, 10);
    if (JSON.stringify(newFilteredPairs) !== JSON.stringify(prevFilteredPairsRef.current)) {
      prevFilteredPairsRef.current = newFilteredPairs;
      setFilteredPairs(newFilteredPairs);
    }
  }, [pairSearch, availablePairs]);

  useEffect(() => {
    const handler = (e) => {
      if (pairDropRef.current && !pairDropRef.current.contains(e.target)) {
        setPairDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!sharedState || sharedLoading) return;
    setTimeout(() => {
      if (sharedState.strategy_name && !strategy) setStrategy(sharedState.strategy_name);
      if (sharedState.timeframe      && !timeframe) setTimeframe(sharedState.timeframe);
      if (sharedState.pairs?.length  && !pairs.length) setPairs(sharedState.pairs);
      const s = sharedState.start_date || "";
      const e = sharedState.end_date   || "";
      if (s && e && !startDate && !endDate) {
        setStartDate(s); setEndDate(e); setTimerange(toTimerange(s, e));
      } else if (sharedState.timerange && !timerange) {
        const { start, end } = fromTimerange(sharedState.timerange);
        setTimerange(sharedState.timerange);
        if (start) setStartDate(start);
        if (end)   setEndDate(end);
      }
    }, 0);
  }, [sharedState, sharedLoading, strategy, timeframe, pairs, startDate, endDate, timerange]);

  const triggerSync = useCallback(() => {
    if (!hasChanged.current) return;
    hasChanged.current = false;
    const p = {};
    if (strategy)  p.strategy_name = strategy;
    if (timeframe) p.timeframe     = timeframe;
    if (timerange) p.timerange     = timerange;
    if (startDate) p.start_date    = startDate;
    if (endDate)   p.end_date      = endDate;
    if (pairs.length) p.pairs      = pairs;
    syncSharedState(p);
  }, [strategy, timeframe, timerange, startDate, endDate, pairs, syncSharedState]);

  const markChanged = useCallback(() => {
    hasChanged.current = true;
    triggerSync();
  }, [triggerSync]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => () => stopPoll(), [stopPoll]);

  const startPoll = useCallback((sid, totalSegs) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.session.getStatus(sid);
        if (!data) { stopPoll(); setRunning(false); setRunError("Session expired."); return; }
        const res = data.result || {};

        if (data.status === "running") {
          const done = res.completed_segments || 0;
          const total = res.total_segments || totalSegs || 1;
          setProgress({ done, total, current: res.current_segment });
          if (res.segments?.length) {
            setResult({ ...res, _partial: true });
          }
        } else if (data.status === "completed") {
          stopPoll();
          setRunning(false);
          setProgress(null);
          setResult({ ...res, _partial: false });
        } else if (data.status === "failed") {
          stopPoll();
          setRunning(false);
          setProgress(null);
          setRunError(data.error || "Stress test failed.");
        }
      } catch {
        stopPoll();
        setRunning(false);
        setRunError("Lost connection to the backend. Please check the server and try again.");
      }
    }, POLL_MS);
  }, [stopPoll]);

  const addPair = (p) => {
    if (!pairs.includes(p)) { setPairs(prev => [...prev, p]); markChanged(); }
    setPairSearch(""); setPairDropOpen(false);
  };
  const removePair = (p) => { setPairs(prev => prev.filter(x => x !== p)); markChanged(); };

  const handleLaunch = async () => {
    setRunError(null); setResult(null); setProgress(null);
    if (!strategy)  { setRunError("Please select a strategy."); return; }
    if (!timerange && mode !== "crash_gauntlet") { setRunError("Please set a date range."); return; }
    if (!timerange && mode === "crash_gauntlet") {
      setRunError("A date range is still required for Crash Gauntlet (it filters applicable crash periods).");
      return;
    }

    const isExportedTrial = strategy.startsWith(OPT_PREFIX);
    let effectiveStrategyName = strategy;
    let exportedTrialId = undefined;

    if (isExportedTrial) {
      const trialId = strategy.slice(OPT_PREFIX.length);
      const trialRecord = exportedTrials.find(t => t.id === trialId);
      if (!trialRecord) {
        setRunError("Exported trial not found. Try refreshing the page.");
        return;
      }
      effectiveStrategyName = trialRecord.strategy_name;
      exportedTrialId = trialId;
    }

    setRunning(true);
    try {
      const body = {
        strategy_name: effectiveStrategyName,
        timerange,
        timeframe,
        pairs: pairs.length ? pairs : undefined,
        mode,
        n_splits: mode === "time_split" ? Number(nSplits) : undefined,
        n_windows: mode === "monte_carlo" ? Number(nWindows) : undefined,
        window_days: mode === "monte_carlo" ? Number(windowDays) : undefined,
        ...(exportedTrialId ? { exported_trial_id: exportedTrialId } : {}),
      };
      const r = await fetch("/api/temporal-stress-lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        const detail = data.detail;
        const msg = typeof detail === "object"
          ? (detail.message || JSON.stringify(detail))
          : (detail || "Failed to start stress test.");
        setRunError(msg); setRunning(false); return;
      }
      const estimatedSegs = mode === "crash_gauntlet" ? 6 : mode === "time_split" ? Number(nSplits) : Number(nWindows);
      startPoll(data.session_id, estimatedSegs);
    } catch {
      setRunError("Network error. Is the backend running?");
      setRunning(false);
    }
  };

  const modeLabel = { time_split: "Time Split", monte_carlo: "Monte Carlo", crash_gauntlet: "Crash Gauntlet" }[mode] || mode;


  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 flex flex-col gap-6">

      {/* ── Header Card ── */}
      <div className="card bg-base-200 shadow-xl border border-base-300">
        <div className="card-body gap-6">

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="card-title text-xl font-semibold tracking-tight">
                ⚡ Stress Test Lab
              </h2>
              <p className="text-xs text-base-content/50 mt-0.5">
                Robustness testing across multiple market conditions — walk-forward splits, random sampling, and historic crash gauntlets
              </p>
            </div>
            <span className="badge badge-error badge-outline text-xs font-semibold">Robustness Lab</span>
          </div>

          {/* ── Shared Inputs ── */}
          <div className="divider text-xs text-base-content/40 my-0">SHARED INPUTS</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-medium text-sm">Strategy</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                value={strategy}
                onChange={e => { setStrategy(e.target.value); markChanged(); }}
                disabled={running || strategiesLoading}
              >
                <option value="">Select strategy…</option>
                <optgroup label="Standard Strategies">
                  {(strategies || []).map(s => (
                    <option key={s.strategy_name} value={s.strategy_name}>
                      {s.strategy_name}{s.timeframe ? ` — ${s.timeframe}` : ""}
                    </option>
                  ))}
                </optgroup>
                {exportedTrials.length > 0 && (
                  <optgroup label="Exported from Optimizer">
                    {exportedTrials.map(t => (
                      <option key={t.id} value={`${OPT_PREFIX}${t.id}`}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text font-medium text-sm">Timeframe</span>
                <span className="label-text-alt text-base-content/40 text-xs">Candle size</span>
              </label>
              <select
                className="select select-bordered select-sm w-full"
                value={timeframe}
                onChange={e => { setTimeframe(e.target.value); markChanged(); }}
                disabled={running}
              >
                {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
              </select>
            </div>

            <div className="form-control sm:col-span-2">
              <label className="label py-1">
                <span className="label-text font-medium text-sm">Date Range</span>
                {timerange && (
                  <span className="label-text-alt font-mono text-base-content/40 text-xs">{timerange}</span>
                )}
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {DATE_PRESETS.map(p => (
                  <button key={p.label} type="button" className="btn btn-xs btn-outline"
                    onClick={() => { applyPreset(p.days, setStartDate, setEndDate, setTimerange); markChanged(); }}
                    disabled={running}
                  >{p.label}</button>
                ))}
              </div>
              <div className="flex gap-3">
                <input type="date" className="input input-bordered input-sm flex-1"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    if (e.target.value && endDate) setTimerange(toTimerange(e.target.value, endDate));
                    markChanged();
                  }}
                  disabled={running}
                />
                <input type="date" className="input input-bordered input-sm flex-1"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    if (startDate && e.target.value) setTimerange(toTimerange(startDate, e.target.value));
                    markChanged();
                  }}
                  disabled={running}
                />
              </div>
            </div>

            <div className="form-control sm:col-span-2" ref={pairDropRef}>
              <label className="label py-1">
                <span className="label-text font-medium text-sm">Trading Pairs</span>
                <span className="label-text-alt text-base-content/40 text-xs">
                  {pairs.length > 0 ? `${pairs.length} selected` : "All from config"}
                </span>
              </label>
              <input type="text" className="input input-bordered input-sm w-full"
                placeholder="Search pairs… (leave empty to use config)"
                value={pairSearch}
                onFocus={() => setPairDropOpen(true)}
                onChange={e => {
                  setPairSearch(e.target.value);
                  setPairDropOpen(true);
                  if (searchPairs) searchPairs(e.target.value);
                }}
                disabled={running}
              />
              {pairDropOpen && filteredPairs.length > 0 && (
                <div className="bg-base-100 border border-base-300 rounded-box mt-1 shadow-lg max-h-44 overflow-y-auto z-50 relative">
                  {filteredPairs.map(p => (
                    <button key={p} type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary/10 font-mono"
                      onClick={() => addPair(p)}
                    >{p}</button>
                  ))}
                </div>
              )}
              {pairs.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {pairs.map(p => (
                    <span key={p} className="badge badge-sm badge-neutral gap-1 font-mono">
                      {p}
                      <button onClick={() => removePair(p)} disabled={running} className="ml-1 opacity-60 hover:opacity-100">✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Stress Mode Selector ── */}
          <div className="divider text-xs text-base-content/40 my-0">STRESS CONFIGURATION</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ModeCard
              id="time_split"
              icon="📅"
              title="Time Split"
              subtitle="Walk-forward: divide the range into equal consecutive windows"
              selected={mode === "time_split"}
              onClick={() => setMode("time_split")}
              disabled={running}
            />
            <ModeCard
              id="monte_carlo"
              icon="🎲"
              title="Monte Carlo"
              subtitle="Random sampling: pick N random windows of fixed length"
              selected={mode === "monte_carlo"}
              onClick={() => setMode("monte_carlo")}
              disabled={running}
            />
            <ModeCard
              id="crash_gauntlet"
              icon="💀"
              title="Crash Gauntlet"
              subtitle="Battle-tested: run against 6 historic crypto crash events"
              selected={mode === "crash_gauntlet"}
              onClick={() => setMode("crash_gauntlet")}
              disabled={running}
            />
          </div>

          {/* Mode-specific parameters */}
          {mode === "time_split" && (
            <div className="bg-base-100 rounded-xl p-4 border border-base-300 flex flex-col gap-2">
              <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-1">Time Split Settings</div>
              <div className="form-control max-w-xs">
                <label className="label py-1">
                  <span className="label-text text-sm font-medium">Number of Segments</span>
                  <span className="label-text-alt text-xs text-base-content/40">2 – 52</span>
                </label>
                <input type="number" min={2} max={52} className="input input-bordered input-sm"
                  value={nSplits}
                  onChange={e => setNSplits(e.target.value)}
                  disabled={running}
                />
                <label className="label py-0.5">
                  <span className="label-text-alt text-xs text-base-content/40">
                    e.g. 4 = quarterly splits, 12 = monthly splits
                  </span>
                </label>
              </div>
            </div>
          )}

          {mode === "monte_carlo" && (
            <div className="bg-base-100 rounded-xl p-4 border border-base-300 flex flex-col gap-2">
              <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-1">Monte Carlo Settings</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-sm font-medium">Number of Random Windows</span>
                    <span className="label-text-alt text-xs text-base-content/40">2 – 20</span>
                  </label>
                  <input type="number" min={2} max={20} className="input input-bordered input-sm"
                    value={nWindows}
                    onChange={e => setNWindows(e.target.value)}
                    disabled={running}
                  />
                </div>
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-sm font-medium">Window Length (Days)</span>
                    <span className="label-text-alt text-xs text-base-content/40">3 – 365</span>
                  </label>
                  <input type="number" min={3} max={365} className="input input-bordered input-sm"
                    value={windowDays}
                    onChange={e => setWindowDays(e.target.value)}
                    disabled={running}
                  />
                </div>
              </div>
            </div>
          )}

          {mode === "crash_gauntlet" && (
            <div className="bg-base-100 rounded-xl p-4 border border-base-300">
              <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">Predefined Crash Periods</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CRASH_PERIODS.map(cp => (
                  <div key={cp.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/5 border border-error/20">
                    <span className="text-error text-sm">💀</span>
                    <div>
                      <div className="text-xs font-semibold">{cp.label}</div>
                      <div className="text-xs text-base-content/40">{cp.period}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {runError && (
            <div className="alert alert-error text-sm py-2">
              <span>⚠ {runError}</span>
            </div>
          )}

          {/* Launch button */}
          <button
            className="btn btn-error btn-lg w-full font-bold tracking-wide"
            onClick={handleLaunch}
            disabled={running}
          >
            {running ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Running Stress Gauntlet…
              </>
            ) : (
              "⚡ Launch Stress Test Lab"
            )}
          </button>
        </div>
      </div>

      {/* ── Progress Card ── */}
      {running && progress && (
        <div className="card bg-base-200 border border-base-300 shadow">
          <div className="card-body py-4 gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                Running {modeLabel} — Segment {progress.done + 1} of {progress.total}
              </div>
              <span className="badge badge-warning badge-sm">
                {Math.round(((progress.done) / progress.total) * 100)}%
              </span>
            </div>
            {progress.current && (
              <div className="text-xs text-base-content/50 font-mono flex items-center gap-1">
                <span className="loading loading-dots loading-xs"></span>
                {progress.current}
              </div>
            )}
            <progress
              className="progress progress-warning w-full"
              value={progress.done}
              max={progress.total}
            />
          </div>
        </div>
      )}

      {/* ── Live Partial Segment Table ── */}
      {running && result?._partial && result.segments?.length > 0 && (
        <SegmentTable segments={result.segments} partial />
      )}

      {/* ── Final Results Dashboard ── */}
      {result && !result._partial && (
        <ResultsDashboard result={result} />
      )}
    </div>
  );
}

function ResultsDashboard({ result }) {
  const score = result.consistency_score ?? 0;

  return (
    <div className="flex flex-col gap-4">

      {/* Optimizer config banner */}
      {result.exported_trial_label && (
        <div className="alert bg-primary/10 border border-primary/30 py-2.5 px-4 flex items-center gap-3">
          <span className="text-primary text-base">🧬</span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 min-w-0">
            <span className="text-xs font-semibold text-primary uppercase tracking-wide whitespace-nowrap">Optimizer Config Used</span>
            <span className="text-sm font-mono text-base-content truncate">{result.exported_trial_label}</span>
          </div>
        </div>
      )}

      {/* Consistency Score Hero */}
      <div className="card bg-base-200 border border-base-300 shadow-xl">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <div className={`text-6xl font-black tabular-nums ${scoreColor(score)}`}>
                {score.toFixed(0)}%
              </div>
              <div className="text-xs font-semibold text-base-content/50 uppercase tracking-widest">Consistency Score</div>
              <div className={`badge badge-sm ${scoreColor(score)}`}>{scoreLabel(score)}</div>
            </div>
            <div className="divider sm:divider-horizontal"></div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-success">{fmt2(result.best_net_profit_pct)}</div>
                <div className="text-[10px] text-base-content/40 uppercase tracking-wide">Best Segment</div>
                {result.best_segment_label && (
                  <div className="text-[10px] text-base-content/50 mt-0.5 truncate">{result.best_segment_label}</div>
                )}
              </div>
              <div>
                <div className="text-lg font-bold text-error">{fmt2(result.worst_net_profit_pct)}</div>
                <div className="text-[10px] text-base-content/40 uppercase tracking-wide">Worst Segment</div>
                {result.worst_segment_label && (
                  <div className="text-[10px] text-base-content/50 mt-0.5 truncate">{result.worst_segment_label}</div>
                )}
              </div>
              <div>
                <div className="text-lg font-bold">{fmt2(result.avg_net_profit_pct)}</div>
                <div className="text-[10px] text-base-content/40 uppercase tracking-wide">Avg Profit</div>
              </div>
              <div>
                <div className="text-lg font-bold text-warning">
                  {result.max_drawdown_variance != null ? `${result.max_drawdown_variance.toFixed(2)}` : "—"}
                </div>
                <div className="text-[10px] text-base-content/40 uppercase tracking-wide">DD Variance</div>
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div className="mt-2">
            <progress
              className={`progress w-full ${score >= 75 ? "progress-success" : score >= 50 ? "progress-warning" : "progress-error"}`}
              value={score}
              max={100}
            />
            <div className="flex justify-between text-[10px] text-base-content/30 mt-0.5">
              <span>0% — Failing</span>
              <span>50% — Moderate</span>
              <span>100% — Robust</span>
            </div>
          </div>
        </div>
      </div>

      {/* Segment breakdown table */}
      <div className="card bg-base-200 border border-base-300 shadow">
        <div className="card-body py-4">
          <h3 className="font-semibold text-sm mb-3">Segment Breakdown</h3>
          <SegmentTable segments={result.segments} partial={false} />
        </div>
      </div>
    </div>
  );
}

function SegmentTable({ segments, partial }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-base-300">
      <table className="table table-sm w-full text-xs">
        <thead>
          <tr className="bg-base-300/50 text-base-content/60 uppercase tracking-wider text-[10px]">
            <th>Segment</th>
            <th>Date Range</th>
            <th className="text-right">Trades</th>
            <th className="text-right">Win Rate</th>
            <th className="text-right">Net Profit</th>
            <th className="text-right">Max DD</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => (
            <tr key={i} className={`hover border-b border-base-300/30 ${
              seg.status === "profitable" ? "bg-success/5" :
              seg.status === "loss"       ? "bg-error/5"   : ""
            }`}>
              <td className="font-semibold">{seg.label}</td>
              <td className="font-mono text-base-content/50">
                <div>{seg.start?.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}</div>
                <div>{seg.end?.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}</div>
              </td>
              <td className="text-right">{seg.total_trades ?? "—"}</td>
              <td className="text-right">
                {seg.win_rate_pct != null ? `${seg.win_rate_pct.toFixed(1)}%` : "—"}
              </td>
              <td className={`text-right font-semibold ${
                seg.net_profit_pct == null ? "" :
                seg.net_profit_pct >= 0 ? "text-success" : "text-error"
              }`}>
                {fmt2(seg.net_profit_pct)}
              </td>
              <td className="text-right text-base-content/50">
                {seg.max_drawdown_pct != null ? `${Number(seg.max_drawdown_pct).toFixed(2)}` : "—"}
              </td>
              <td>
                {seg.status === "running" && partial ? (
                  <span className="loading loading-spinner loading-xs text-warning"></span>
                ) : (
                  <SegmentBadge status={seg.status} />
                )}
                {seg.error && (
                  <div className="text-[10px] text-error/70 mt-0.5 max-w-[160px] truncate" title={seg.error}>
                    {seg.error}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
