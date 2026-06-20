import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../services/api.js";
import BacktestResults from "./BacktestResults";
import SmartPairSelector from "./SmartPairSelector";

function CommandViewer({ command }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const renderTokens = (cmd) => {
    const tokens = cmd.trim().split(/\s+/);
    return tokens.map((tok, i) => {
      let cls;
      if (i === 0) cls = "text-warning font-bold";
      else if (i === 1) cls = "text-info font-semibold";
      else if (tok.startsWith("--")) cls = "text-success";
      else if (tok.startsWith("-") && tok.length <= 3) cls = "text-success";
      else cls = "text-base-content/70";
      return (
        <span key={i} className={cls}>
          {i > 0 ? " " : ""}{tok}
        </span>
      );
    });
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] text-base-content/30 font-mono uppercase tracking-widest">
          Active Command
        </span>
        <div className="flex-1 h-px bg-base-content/10" />
        {command && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copy command to clipboard"
            className="btn btn-xs btn-ghost gap-1 text-base-content/40 hover:text-base-content transition-colors h-auto min-h-0 py-0.5 px-1.5"
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="text-[10px] text-success">Copied</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span className="text-[10px]">Copy</span>
              </>
            )}
          </button>
        )}
      </div>
      <div className="mockup-code text-xs overflow-x-auto">
        {!command ? (
          <pre data-prefix="$">
            <code className="text-base-content/20 italic">No active process running</code>
          </pre>
        ) : (
          <pre data-prefix="$">
            <code className="whitespace-pre-wrap break-all leading-relaxed">
              {renderTokens(command)}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}

function LiveLogWindow({ logs, title }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-base-content/30 font-mono uppercase tracking-widest">
          {title || "Live Output"}
        </span>
        <div className="flex-1 h-px bg-base-content/10" />
        <span className="text-[10px] text-base-content/30 font-mono">{logs.length} lines</span>
      </div>
      <div className="bg-base-300 rounded-box border border-base-content/10 font-mono text-[11px] leading-relaxed max-h-64 overflow-y-auto p-3">
        {logs.length === 0 ? (
          <span className="text-base-content/30 italic">Waiting for output…</span>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="text-base-content/70 whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

const TIMEFRAMES = [
  "1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w"
];

const PRESETS = [
  { label: "1 Day",   days: 1 },
  { label: "7 Days",  days: 7 },
  { label: "30 Days", days: 30 },
  { label: "1 Year",  days: 365 },
  { label: "2 Years", days: 730 },
];

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateToTimerange(start, end) {
  const s = start.replace(/-/g, "");
  const e = end.replace(/-/g, "");
  return `${s}-${e}`;
}

const POLL_INTERVAL = 2000;

export default function BacktestForm({
  strategies,
  strategiesLoading,
  sharedState,
  sharedLoading,
  syncSharedState,
}) {
  // ── local form state ───────────────────────────────────────────────────────
  const [strategy,   setStrategy]   = useState("");
  const [timeframe,  setTimeframe]  = useState("");
  const [timerange,  setTimerange]  = useState("");
  const [startDate,  setStartDate]  = useState("");
  const [endDate,    setEndDate]    = useState("");
  const [wallet,     setWallet]     = useState("");
  const [maxTrades,  setMaxTrades]  = useState("");
  const [pairs,      setPairs]      = useState([]);

  // ── run / poll state ───────────────────────────────────────────────────────
  const [running,        setRunning]        = useState(false);
  const [runError,       setRunError]       = useState(null);
  const [sessionId,      setSessionId]      = useState(null);
  const [runStatus,      setRunStatus]      = useState(null);
  const [runId,          setRunId]          = useState(null);
  const [results,        setResults]        = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [command,        setCommand]        = useState(null);
  const pollRef = useRef(null);

  // ── download state ─────────────────────────────────────────────────────────
  const [downloading,       setDownloading]       = useState(false);
  const [downloadError,     setDownloadError]     = useState(null);
  const [downloadSessionId, setDownloadSessionId] = useState(null);
  const [downloadStatus,    setDownloadStatus]    = useState(null);
  const [downloadCommand,   setDownloadCommand]   = useState(null);
  const [downloadLogs,      setDownloadLogs]      = useState([]);
  const [downloadDone,      setDownloadDone]      = useState(false);
  const downloadPollRef = useRef(null);
  const downloadEsRef   = useRef(null);

  // ── hydration guard ────────────────────────────────────────────────────────
  const hydrated    = useRef(false);
  const initialized = useRef(false);

  // ── pre-fill from shared state on load (unconditional, single-pass) ───────
  useEffect(() => {
    if (sharedLoading || !sharedState || hydrated.current) return;
    hydrated.current = true;

    setTimeout(() => {
      if (sharedState.strategy_name && strategy !== sharedState.strategy_name) setStrategy(sharedState.strategy_name);
      if (sharedState.timeframe && timeframe !== sharedState.timeframe) setTimeframe(sharedState.timeframe);
      if (sharedState.dry_run_wallet != null && wallet !== String(sharedState.dry_run_wallet)) setWallet(String(sharedState.dry_run_wallet));
      if (sharedState.max_open_trades != null && maxTrades !== String(sharedState.max_open_trades)) setMaxTrades(String(sharedState.max_open_trades));
      if (sharedState.pairs?.length && JSON.stringify(pairs) !== JSON.stringify(sharedState.pairs)) setPairs(sharedState.pairs);

      const savedStart = sharedState.start_date || "";
      const savedEnd   = sharedState.end_date   || "";

      if (savedStart && savedEnd) {
        if (startDate !== savedStart) setStartDate(savedStart);
        if (endDate !== savedEnd) setEndDate(savedEnd);
        const newTimerange = dateToTimerange(savedStart, savedEnd);
        if (timerange !== newTimerange) setTimerange(newTimerange);
      }
    }, 0);
  }, [sharedState, sharedLoading, strategy, timeframe, wallet, maxTrades, pairs, startDate, endDate, timerange]);


  // ── auto-sync to shared state after form values settle ────────────────────
  useEffect(() => {
    if (!initialized.current) return;
    const walletNum = parseFloat(wallet);
    const tradesNum = parseInt(maxTrades, 10);
    const payload = {};
    if (strategy)                           payload.strategy_name   = strategy;
    if (timeframe)                          payload.timeframe       = timeframe;
    if (timerange)                          payload.timerange       = timerange;
    if (startDate)                          payload.start_date      = startDate;
    if (endDate)                            payload.end_date        = endDate;
    if (!isNaN(walletNum) && walletNum > 0) payload.dry_run_wallet  = walletNum;
    if (!isNaN(tradesNum) && tradesNum > 0) payload.max_open_trades = tradesNum;
    if (pairs.length)                       payload.pairs           = pairs;
    if (Object.keys(payload).length > 0)    syncSharedState(payload);
  // syncSharedState is a stable callback — omitting it avoids spurious re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy, timeframe, timerange, startDate, endDate, wallet, maxTrades, pairs]);

  const onStrategyChange  = (v) => setStrategy(v);
  const onTimeframeChange = (v) => setTimeframe(v);
  const onWalletChange    = (v) => setWallet(v);
  const onMaxTradesChange = (v) => setMaxTrades(v);

  const onDateChange = (newStart, newEnd) => {
    setStartDate(newStart);
    setEndDate(newEnd);
    if (newStart && newEnd) setTimerange(dateToTimerange(newStart, newEnd));
  };

  // ── preset handlers ────────────────────────────────────────────────────────
  const applyPreset = (days) => {
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const s = fmtDate(start);
    const e = fmtDate(end);
    setStartDate(s);
    setEndDate(e);
    setTimerange(dateToTimerange(s, e));
  };

  // ── session polling ────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const fetchResults = useCallback(async (rid) => {
    setResultsLoading(true);
    try {
      const data = await api.backtest.getResults(rid);
      setResults(data);
    } catch (e) {
      setRunError(e.message || "Failed to load results.");
    } finally {
      setResultsLoading(false);
    }
  }, []);

  const startPolling = useCallback((sid) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.session.getStatus(sid);
        if (!data) {
          stopPolling(); setRunning(false);
          setRunError("Session expired (server restarted). Please run again.");
          return;
        }
        const status = data.status;
        setRunStatus(status);
        const cmd = data.result?.command;
        if (cmd) setCommand(cmd);
        if (status === "completed") {
          stopPolling(); setRunning(false);
          const rid = data.result?.run_id;
          if (rid) { setRunId(rid); await fetchResults(rid); }
        } else if (status === "failed") {
          stopPolling(); setRunning(false);
          setRunError(data.error || "Backtest failed.");
        }
      } catch {
        stopPolling();
        setRunning(false);
        setRunError("Lost connection to the backend. Please check the server and try again.");
      }
    }, POLL_INTERVAL);
  }, [stopPolling, fetchResults]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── download cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (downloadPollRef.current) clearInterval(downloadPollRef.current);
      if (downloadEsRef.current)   downloadEsRef.current.close();
    };
  }, []);

  // ── run backtest ───────────────────────────────────────────────────────────
  const handleRun = async () => {
    setRunError(null); setResults(null); setRunId(null);
    setSessionId(null); setRunStatus(null); setCommand(null);

    if (!strategy)  { setRunError("Please select a strategy."); return; }
    if (!timerange) { setRunError("Please select a date range."); return; }

    setRunning(true);
    try {
      const body = {
        strategy_name: strategy,
        timerange,
        ...(timeframe  ? { timeframe } : {}),
        ...(pairs.length ? { pairs } : {}),
        ...(maxTrades  ? { max_open_trades: parseInt(maxTrades, 10) } : {}),
        ...(wallet     ? { dry_run_wallet: parseFloat(wallet) } : {}),
      };
      const r = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setRunError(data.detail || data.message || "Backtest failed to start.");
        setRunning(false); return;
      }
      const sid = data.session_id;
      setSessionId(sid); setRunStatus("queued");
      startPolling(sid);
    } catch {
      setRunError("Network error. Is the backend running?");
      setRunning(false);
    }
  };

  // ── download historical data ───────────────────────────────────────────────
  const stopDownloadPoll = useCallback(() => {
    if (downloadPollRef.current) { clearInterval(downloadPollRef.current); downloadPollRef.current = null; }
  }, []);

  const closeDownloadEs = useCallback(() => {
    if (downloadEsRef.current) { downloadEsRef.current.close(); downloadEsRef.current = null; }
  }, []);

  const handleDownload = async () => {
    setDownloadError(null);
    setDownloadLogs([]);
    setDownloadSessionId(null);
    setDownloadStatus(null);
    setDownloadCommand(null);
    setDownloadDone(false);

    if (!pairs.length) { setDownloadError("Please select at least one pair first."); return; }
    if (!timerange)    { setDownloadError("Please select a date range first."); return; }

    setDownloading(true);

    // Open SSE log stream immediately so we capture all download output
    closeDownloadEs();
    const es = new EventSource("/api/logs/stream");
    downloadEsRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          setDownloadLogs((prev) => [...prev, data.message]);
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { closeDownloadEs(); };

    try {
      const body = {
        pairs,
        timeframes: timeframe ? [timeframe] : ["5m"],
        timerange,
        prepend: true,
      };
      const r = await fetch("/api/data/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setDownloadError(data.detail || "Failed to start download.");
        setDownloading(false);
        closeDownloadEs();
        return;
      }
      const sid = data.session_id;
      setDownloadSessionId(sid);
      setDownloadStatus("queued");

      stopDownloadPoll();
      downloadPollRef.current = setInterval(async () => {
        try {
          const status = await api.session.getStatus(sid);
          setDownloadStatus(status.status);
          if (status.result?.command) setDownloadCommand(status.result.command);
          if (status.status === "completed" || status.status === "failed") {
            stopDownloadPoll();
            setDownloading(false);
            setDownloadDone(true);
            closeDownloadEs();
            if (status.status === "failed") {
              setDownloadError(status.error || "Download failed. See log output above.");
            }
          }
        } catch {
          stopDownloadPoll();
          setDownloading(false);
          closeDownloadEs();
          setDownloadError("Lost connection to backend. Please try again.");
        }
      }, POLL_INTERVAL);
    } catch {
      setDownloadError("Network error. Is the backend running?");
      setDownloading(false);
      closeDownloadEs();
    }
  };

  const handleReset = () => {
    stopPolling();
    setRunning(false); setResults(null); setRunId(null);
    setSessionId(null); setRunStatus(null); setRunError(null); setCommand(null);
  };

  const isReady = strategy && timerange;

  const statusLabel = {
    queued:      "Queued — waiting for runner…",
    downloading: "Downloading candle history…",
    running:     "Running backtest…",
    completed:   "Completed",
    failed:      "Failed",
  }[runStatus] ?? "";

  const downloadStatusLabel = {
    queued:    "Queued — starting download…",
    running:   "Downloading candle data…",
    completed: "Download complete",
    failed:    "Download failed",
  }[downloadStatus] ?? "Preparing…";

  const isDownloading = runStatus === "downloading";

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="card bg-base-200 shadow-xl border border-base-300">
          <div className="card-body gap-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="card-title text-xl font-semibold tracking-tight">
                Backtest Configuration
              </h2>
              <div className="flex items-center gap-2">
                {results && (
                  <button className="btn btn-xs btn-ghost" onClick={handleReset}>Reset</button>
                )}
                <span className="badge badge-sm badge-primary">Beta</span>
              </div>
            </div>

            {/* Strategy */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Strategy</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={strategy}
                onChange={(e) => onStrategyChange(e.target.value)}
                disabled={strategiesLoading || running || downloading}
              >
                <option value="" disabled>
                  {strategiesLoading ? "Loading strategies..." : "Select a strategy"}
                </option>
                {strategies.map((s) => (
                  <option key={s.strategy_name} value={s.strategy_name}>
                    {s.strategy_name}{s.timeframe ? ` — ${s.timeframe}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Timeframe */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Timeframe</span>
                <span className="label-text-alt text-base-content/50">Candle size</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={timeframe}
                onChange={(e) => onTimeframeChange(e.target.value)}
                disabled={running || downloading}
              >
                <option value="" disabled>Select timeframe</option>
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>{tf}</option>
                ))}
              </select>
            </div>

            {/* Wallet + Max Trades */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Dry Run Wallet</span>
                  <span className="label-text-alt text-base-content/50">USDT</span>
                </label>
                <input
                  type="number" min="0" step="100" placeholder="1000"
                  className="input input-bordered w-full"
                  value={wallet}
                  onChange={(e) => onWalletChange(e.target.value)}
                  disabled={running || downloading}
                />
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Max Open Trades</span>
                  <span className="label-text-alt text-base-content/50">Integer</span>
                </label>
                <input
                  type="number" min="1" step="1" placeholder="1"
                  className="input input-bordered w-full"
                  value={maxTrades}
                  onChange={(e) => onMaxTradesChange(e.target.value)}
                  disabled={running || downloading}
                />
              </div>
            </div>

            {/* Date Range */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Date Range</span>
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="btn btn-xs btn-outline btn-primary"
                    onClick={() => applyPreset(p.days)}
                    disabled={running || downloading}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-base-content/60 mb-1 block">Start Date</label>
                  <input
                    type="date"
                    className="input input-bordered w-full"
                    value={startDate}
                    onChange={(e) => onDateChange(e.target.value, endDate)}
                    disabled={running || downloading}
                  />
                </div>
                <div>
                  <label className="text-xs text-base-content/60 mb-1 block">End Date</label>
                  <input
                    type="date"
                    className="input input-bordered w-full"
                    value={endDate}
                    onChange={(e) => onDateChange(startDate, e.target.value)}
                    disabled={running || downloading}
                  />
                </div>
              </div>
              {timerange && (
                <div className="mt-2 text-xs text-base-content/40 font-mono">{timerange}</div>
              )}
            </div>

            {/* Pairs Selector */}
            <div className="relative">
              <SmartPairSelector
                value={pairs}
                onChange={(newPairs) => setPairs(newPairs)}
                onMaxTradesChange={(n) => setMaxTrades(String(n))}
                disabled={running || downloading}
              />
            </div>

            {/* Error */}
            {runError && (
              <div className="alert alert-error alert-sm"><span>{runError}</span></div>
            )}

            {/* Run Backtest Button */}
            <button
              type="button"
              className={`btn btn-block ${isReady && !running && !downloading ? "btn-primary" : "btn-disabled"} ${running ? "loading" : ""}`}
              onClick={handleRun}
              disabled={!isReady || running || downloading}
            >
              {running ? statusLabel || "Running…" : "Run Backtest"}
            </button>

            {/* Download Historical Data Button */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={`btn btn-block btn-outline btn-info ${downloading ? "loading" : ""}`}
                onClick={handleDownload}
                disabled={running || downloading}
              >
                {downloading ? "Downloading Candle Data…" : "Download Historical Data"}
              </button>
              {downloadError && (
                <div className="alert alert-error alert-sm text-sm">
                  <span>{downloadError}</span>
                </div>
              )}
              {downloadDone && !downloadError && (
                <div className="alert alert-success alert-sm text-sm">
                  <span>Download complete — candle data is ready.</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Download progress + logs ─────────────────────────────────────────── */}
      {(downloading || downloadLogs.length > 0) && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 flex flex-col gap-3">
          {downloading && (
            <div className="alert bg-base-200 border border-info/30 flex items-center gap-3">
              <span className="loading loading-bars loading-sm text-info" />
              <div>
                <div className="text-sm font-medium text-info">{downloadStatusLabel}</div>
                {downloadSessionId && (
                  <div className="text-xs text-base-content/40 font-mono mt-0.5">
                    session: {downloadSessionId}
                  </div>
                )}
              </div>
            </div>
          )}
          <LiveLogWindow logs={downloadLogs} title="Download Output" />
          {downloadCommand && (
            <CommandViewer command={downloadCommand} />
          )}
        </div>
      )}

      {/* ── Backtest progress indicator ──────────────────────────────────────── */}
      {running && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 flex flex-col gap-3">
          {isDownloading && (
            <div className="alert alert-warning border border-warning/40 flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <div className="font-semibold text-sm">Missing historical data detected</div>
                <div className="text-sm mt-0.5">
                  Automatically downloading candle history first, please wait…
                  <span className="loading loading-dots loading-xs ml-2 align-middle" />
                </div>
                <div className="text-xs mt-1 opacity-70">
                  Using <code className="font-mono bg-warning/20 px-1 rounded">--prepend</code> to preserve existing data and fetch only missing candles.
                </div>
              </div>
            </div>
          )}
          <div className="alert bg-base-200 border border-base-300 flex items-center gap-3">
            <span className="loading loading-bars loading-sm text-primary" />
            <div>
              <div className="text-sm font-medium">{statusLabel}</div>
              {sessionId && (
                <div className="text-xs text-base-content/40 font-mono mt-0.5">session: {sessionId}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Command Viewer */}
      {(running || command) && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <CommandViewer command={command} />
        </div>
      )}

      {/* Results loading skeleton */}
      {resultsLoading && !results && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 flex flex-col gap-4">
          <div className="skeleton h-24 w-full rounded-box" />
          <div className="skeleton h-16 w-full rounded-box" />
          <div className="skeleton h-32 w-full rounded-box" />
        </div>
      )}

      {/* Results panel */}
      {results && !resultsLoading && (
        <>
          <div className="mx-auto w-full max-w-3xl px-4 pb-2">
            <div className="divider text-xs text-base-content/40 font-mono">BACKTEST RESULTS</div>
          </div>
          <BacktestResults results={results} runId={runId} />
        </>
      )}
    </div>
  );
}
