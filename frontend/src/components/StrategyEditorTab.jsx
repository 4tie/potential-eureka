import { useState, useEffect, useRef, useCallback } from "react";

// ── Syntax highlighting (no external deps) ────────────────────────────────────

function escHtml(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PY_TOKEN = new RegExp(
  [
    /"""[\s\S]*?"""/.source,
    /'''[\s\S]*?'''/.source,
    /"(?:[^"\\]|\\.)*"/.source,
    /'(?:[^'\\]|\\.)*'/.source,
    /#[^\n]*/.source,
    /\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|self|super|try|while|with|yield)\b/.source,
    /@[\w.]+/.source,
    /\b0x[0-9a-fA-F]+\b/.source,
    /\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/.source,
  ].join("|"),
  "g"
);

const KW = new Set([
  "False","None","True","and","as","assert","async","await","break","class",
  "continue","def","del","elif","else","except","finally","for","from","global",
  "if","import","in","is","lambda","nonlocal","not","or","pass","raise","return",
  "self","super","try","while","with","yield",
]);

function highlightPy(raw) {
  return escHtml(raw).replace(PY_TOKEN, (m) => {
    if (m[0] === "#")                   return `<span style="color:#6b7280;font-style:italic">${m}</span>`;
    if (m[0] === '"' || m[0] === "'")   return `<span style="color:#4ade80">${m}</span>`;
    if (m[0] === "@")                   return `<span style="color:#f59e0b">${m}</span>`;
    if (/^\d/.test(m))                  return `<span style="color:#fb923c">${m}</span>`;
    if (KW.has(m))                      return `<span style="color:#818cf8;font-weight:600">${m}</span>`;
    return m;
  });
}

const JSON_TOKEN = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|\b(true|false|null)\b|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g;

function highlightJson(raw) {
  return escHtml(raw).replace(JSON_TOKEN, (m, key, str, bool, num) => {
    if (key)  return `<span style="color:#60a5fa">${m}</span>`;
    if (str)  return `<span style="color:#4ade80">${m}</span>`;
    if (bool) return `<span style="color:#f472b6">${m}</span>`;
    if (num)  return `<span style="color:#fb923c">${m}</span>`;
    return m;
  });
}

// ── Structural code hints ─────────────────────────────────────────────────────

function analyzeStrategy(code) {
  if (!code?.trim()) return [];
  const hints = [];
  const classM = code.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/m);
  if (classM) {
    const [, name, bases] = classM;
    if (!bases?.includes("IStrategy"))
      hints.push({ type: "warn", msg: `"${name}" should inherit IStrategy`, fix: `class ${name}(IStrategy):` });
  } else {
    hints.push({ type: "info", msg: "No strategy class detected yet", fix: "class MyStrategy(IStrategy):" });
  }
  if (!/INTERFACE_VERSION\s*[:=]/.test(code))
    hints.push({ type: "warn", msg: "Missing INTERFACE_VERSION", fix: "INTERFACE_VERSION: int = 3" });
  if (!/timeframe\s*=/.test(code))
    hints.push({ type: "warn", msg: "Missing timeframe declaration", fix: 'timeframe = "1h"' });
  if (!/stoploss\s*=/.test(code))
    hints.push({ type: "warn", msg: "Missing stoploss declaration", fix: "stoploss = -0.10" });
  if (!/def populate_entry_trend|def populate_buy_trend/.test(code))
    hints.push({ type: "error", msg: "Missing populate_entry_trend()", fix: "def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:" });
  if (!/def populate_exit_trend|def populate_sell_trend/.test(code))
    hints.push({ type: "error", msg: "Missing populate_exit_trend()", fix: "def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:" });
  if (!/def populate_indicators/.test(code))
    hints.push({ type: "info", msg: "No populate_indicators() — typically needed", fix: "def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:" });
  return hints;
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────

const TRIGGER_LABELS = {
  editor_save:   "Editor Save",
  hyperopt_apply: "Hyperopt Apply",
  manual_save:   "Manual Save",
};

function formatTs(ts) {
  if (!ts || ts.length < 15) return ts;
  const y   = ts.slice(0, 4);
  const mo  = ts.slice(4, 6);
  const d   = ts.slice(6, 8);
  const hr  = ts.slice(9, 11);
  const min = ts.slice(11, 13);
  const sec = ts.slice(13, 15);
  return `${y}-${mo}-${d}  ${hr}:${min}:${sec}`;
}

// ── Shared editor styles ──────────────────────────────────────────────────────

const EDITOR_FONT = {
  fontFamily: '"Fira Code","Cascadia Code","JetBrains Mono",Consolas,monospace',
  fontSize: "13px",
  lineHeight: "1.65",
  tabSize: 4,
};

const SHARED_AREA = {
  ...EDITOR_FONT,
  padding: "14px 16px",
  margin: 0,
  border: "none",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  whiteSpace: "pre",
  wordWrap: "normal",
  overflowWrap: "normal",
};

// ── Code editor component ─────────────────────────────────────────────────────

function CodeEditor({ value, onChange, language }) {
  const preRef  = useRef(null);
  const areaRef = useRef(null);
  const lineRef = useRef(null);

  const highlighted = language === "python" ? highlightPy(value) : highlightJson(value);
  const lines = (value.match(/\n/g) || []).length + 1;

  const syncScroll = useCallback(() => {
    if (!areaRef.current || !preRef.current) return;
    preRef.current.scrollTop  = areaRef.current.scrollTop;
    preRef.current.scrollLeft = areaRef.current.scrollLeft;
    if (lineRef.current) lineRef.current.scrollTop = areaRef.current.scrollTop;
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end   = e.target.selectionEnd;
      onChange(value.substring(0, start) + "    " + value.substring(end));
      requestAnimationFrame(() => {
        if (areaRef.current)
          areaRef.current.selectionStart = areaRef.current.selectionEnd = start + 4;
      });
    }
  };

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", background: "#0f172a", borderRadius: "0 0 12px 12px" }}>
      {/* Line numbers */}
      <div
        ref={lineRef}
        style={{
          ...EDITOR_FONT,
          padding: "14px 10px 14px 14px",
          minWidth: "52px",
          textAlign: "right",
          color: "#374151",
          userSelect: "none",
          overflowY: "hidden",
          borderRight: "1px solid #1e293b",
          background: "#0a0f1e",
          flexShrink: 0,
        }}
      >
        {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>

      {/* Highlighted pre + transparent textarea overlay */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <pre
          ref={preRef}
          aria-hidden="true"
          style={{
            ...SHARED_AREA,
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            color: "#e2e8f0",
            background: "transparent",
            pointerEvents: "none",
            margin: 0,
          }}
          dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
        />
        <textarea
          ref={areaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          style={{
            ...SHARED_AREA,
            position: "relative",
            background: "transparent",
            color: "transparent",
            caretColor: "#f8fafc",
            resize: "none",
            height: "100%",
            overflowY: "auto",
            overflowX: "auto",
          }}
        />
      </div>
    </div>
  );
}

// ── Validate result panel ─────────────────────────────────────────────────────

function ValidatePanel({ result }) {
  if (!result) return null;
  return (
    <div className={`rounded-xl border p-4 font-mono text-xs leading-relaxed overflow-auto max-h-56
      ${result.valid ? "border-success/30 bg-success/5 text-success" : "border-error/30 bg-error/5 text-error"}`}
    >
      <div className={`font-bold mb-2 ${result.valid ? "text-success" : "text-error"}`}>
        {result.valid ? "✓ Strategy valid!" : "✗ Validation found issues"}
      </div>
      {result.errors.map((e, i)   => <div key={i} className="text-error/90">⚠ {e}</div>)}
      {result.warnings.map((w, i) => <div key={i} className="text-warning/90 mt-0.5">ℹ {w}</div>)}
      <pre className="text-base-content/50 whitespace-pre-wrap mt-2">{result.output}</pre>
    </div>
  );
}

// ── Code hint badge ───────────────────────────────────────────────────────────

function HintBadge({ hint, onInsert }) {
  const colors = { error: "text-error bg-error/10 border-error/20", warn: "text-warning bg-warning/10 border-warning/20", info: "text-info bg-info/10 border-info/20" };
  const icons  = { error: "✗", warn: "⚠", info: "ℹ" };
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${colors[hint.type]}`}>
      <span className="mt-0.5 shrink-0">{icons[hint.type]}</span>
      <div className="flex-1">
        <div>{hint.msg}</div>
        <button
          type="button"
          className="font-mono text-[11px] opacity-70 hover:opacity-100 underline mt-0.5 text-left"
          onClick={() => onInsert(hint.fix)}
        >
          {hint.fix}
        </button>
      </div>
    </div>
  );
}

// ── Version history panel ─────────────────────────────────────────────────────

function VersionHistoryPanel({ onRestore, loading, snapshots }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <span className="loading loading-spinner loading-sm opacity-40"></span>
      </div>
    );
  }
  if (snapshots.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="text-3xl mb-2 opacity-10">📷</div>
        <div className="text-xs text-base-content/30">No snapshots yet</div>
        <div className="text-[10px] text-base-content/20 mt-1">Snapshots are taken automatically on every save</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 p-2">
      {snapshots.map((snap, idx) => (
        <div
          key={snap.timestamp}
          className="group relative flex flex-col gap-1 px-3 py-2.5 rounded-lg border border-base-300 hover:border-primary/30 hover:bg-primary/5 transition-colors"
        >
          <div className="absolute left-[-1px] top-4 w-1.5 h-1.5 rounded-full bg-primary/40 -translate-x-[5px]" />
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[11px] text-base-content/80 tabular-nums">
                {formatTs(snap.timestamp)}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`badge badge-xs ${
                  snap.trigger === "hyperopt_apply" ? "badge-accent" :
                  snap.trigger === "editor_save"    ? "badge-primary" : "badge-ghost"
                }`}>
                  {TRIGGER_LABELS[snap.trigger] || snap.trigger}
                </span>
                {idx === 0 && (
                  <span className="badge badge-xs badge-success">latest</span>
                )}
              </div>
              <div className="text-[10px] text-base-content/30 mt-0.5">
                {snap.files.join(", ")}
              </div>
            </div>
            <button
              className="btn btn-xs btn-outline btn-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => onRestore(snap)}
            >
              Restore
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Toast notification system ─────────────────────────────────────────────────

function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`alert shadow-lg text-sm py-2.5 px-4 min-w-64 max-w-sm
            ${t.type === "success" ? "alert-success" : t.type === "error" ? "alert-error" : "alert-info"}`}
          style={{ animation: "slideIn 0.2s ease-out" }}
        >
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StrategyEditorTab({ onDirtyChange, onAgentContextChange = null }) {
  const [fileList,         setFileList]         = useState([]);
  const [selected,         setSelected]         = useState(null);
  const [activeFile,       setActiveFile]       = useState("py");

  const [pyContent,        setPyContent]        = useState("");
  const [jsonContent,      setJsonContent]      = useState("");
  const [savedPy,          setSavedPy]          = useState("");
  const [savedJson,        setSavedJson]        = useState("");

  const [loadingList,      setLoadingList]      = useState(true);
  const [loadingFile,      setLoadingFile]      = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [validating,       setValidating]       = useState(false);
  const [validateResult,   setValidateResult]   = useState(null);
  const [error,            setError]            = useState(null);
  const [saveOk,           setSaveOk]           = useState(false);

  // Version history
  const [showHistory,      setShowHistory]      = useState(false);
  const [snapshots,        setSnapshots]        = useState([]);
  const [loadingSnaps,     setLoadingSnaps]     = useState(false);
  const [restoreTarget,    setRestoreTarget]    = useState(null);
  const [restoring,        setRestoring]        = useState(false);

  // Toast
  const [toasts, setToasts] = useState([]);

  const isDirty = pyContent !== savedPy || jsonContent !== savedJson;

  useEffect(() => { if (onDirtyChange) onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!onAgentContextChange) return;
    onAgentContextChange({
      active_panel: activeFile,
      strategy_name: selected?.name ?? null,
      auto_quant_run_id: null,
      optimizer_session_id: null,
      optimizer_trial_number: null,
      backtest_run_id: null,
      api_session_id: null,
    });
  }, [activeFile, onAgentContextChange, selected?.name]);

  // ── toast helper ─────────────────────────────────────────────────────────

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ── load file list ────────────────────────────────────────────────────────

  const loadFileList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch("/api/strategies/files");
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setFileList(data.strategies || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadFileList(); }, [loadFileList]);

  // ── load strategy ─────────────────────────────────────────────────────────

  const loadStrategy = useCallback(async (strat) => {
    setTimeout(() => {
      setLoadingFile(true);
      setError(null);
      setValidateResult(null);
      setSaveOk(false);
      setSnapshots([]);
    }, 0);
    try {
      const r = await fetch(`/api/strategies/files/${encodeURIComponent(strat.name)}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setPyContent(data.python_content || "");
      setSavedPy(data.python_content || "");
      setJsonContent(data.json_content || "");
      setSavedJson(data.json_content || "");
      setSelected({ ...strat, py_file: data.python_path, json_file: data.json_path, has_json: data.json_exists });
      setActiveFile("py");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingFile(false);
    }
  }, []);

  // ── snapshots ─────────────────────────────────────────────────────────────

  const fetchSnapshots = useCallback(async (name) => {
    setLoadingSnaps(true);
    try {
      const r = await fetch(`/api/strategies/${encodeURIComponent(name)}/snapshots`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setSnapshots(data.snapshots || []);
    } catch {
      setSnapshots([]);
    } finally {
      setLoadingSnaps(false);
    }
  }, []);

  useEffect(() => {
    if (showHistory && selected) fetchSnapshots(selected.name);
  }, [showHistory, selected, fetchSnapshots]);

  // ── save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSaveOk(false);
    try {
      const filename = activeFile === "py" ? selected.py_file : selected.json_file;
      const content  = activeFile === "py" ? pyContent : jsonContent;
      const r = await fetch("/api/strategies/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Save failed");
      if (activeFile === "py") { setSavedPy(pyContent); }
      else                     { setSavedJson(jsonContent); }
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
      addToast("✓ Strategy saved!", "success");
      if (showHistory) fetchSnapshots(selected.name);
    } catch (e) {
      setError(String(e));
      addToast(`Failed to save: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPyContent(savedPy);
    setJsonContent(savedJson);
    setValidateResult(null);
    setError(null);
  };

  // ── validate ──────────────────────────────────────────────────────────────

  const handleValidate = async () => {
    if (!selected) return;
    setValidating(true);
    setValidateResult(null);
    setError(null);
    try {
      const filename = activeFile === "py" ? selected.py_file : selected.json_file;
      const content  = activeFile === "py" ? pyContent : jsonContent;
      const r = await fetch("/api/strategies/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Validate failed");
      setValidateResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setValidating(false);
    }
  };

  // ── rollback ──────────────────────────────────────────────────────────────

  const handleRestoreConfirm = async () => {
    if (!restoreTarget || !selected) return;
    setRestoring(true);
    try {
      const r = await fetch("/api/strategies/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_name: selected.name, timestamp: restoreTarget.timestamp }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Rollback failed");

      if (data.py_content   != null) { setPyContent(data.py_content);     setSavedPy(data.py_content); }
      if (data.json_content != null) { setJsonContent(data.json_content); setSavedJson(data.json_content); }

      setValidateResult(null);
      setRestoreTarget(null);
      addToast(`✓ Rolled back to snapshot ${formatTs(data.timestamp)}`, "success");
      fetchSnapshots(selected.name);
    } catch (e) {
      addToast(`Rollback failed: ${e}`, "error");
    } finally {
      setRestoring(false);
    }
  };

  // ── insert snippet ────────────────────────────────────────────────────────

  const insertSnippet = (text) => {
    if (activeFile !== "py") return;
    setPyContent(prev => prev + "\n" + text);
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const currentContent    = activeFile === "py" ? pyContent  : jsonContent;
  const setCurrentContent = activeFile === "py" ? setPyContent : setJsonContent;
  const currentLanguage   = activeFile === "py" ? "python" : "json";
  const hints             = activeFile === "py" ? analyzeStrategy(pyContent) : [];
  const canSave           = activeFile === "py" || (selected?.has_json && activeFile === "json");

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`@keyframes slideIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}`}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }} className="bg-base-100">

        {/* ── File explorer sidebar ── */}
        <aside className="w-56 bg-base-200 border-r border-base-300 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-3 border-b border-base-300 flex items-center justify-between">
            <span className="text-xs font-bold text-base-content/50 uppercase tracking-wider">Strategies</span>
            <button onClick={loadFileList} className="btn btn-xs btn-ghost opacity-60 hover:opacity-100" title="Refresh">↺</button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {loadingList ? (
              <div className="flex items-center justify-center py-8">
                <span className="loading loading-spinner loading-sm opacity-40"></span>
              </div>
            ) : fileList.length === 0 ? (
              <div className="px-3 py-4 text-xs text-base-content/30 text-center">No strategy files found</div>
            ) : (
              fileList.map(strat => (
                <button
                  key={strat.name}
                  onClick={() => loadStrategy(strat)}
                  className={`w-full text-left px-3 py-2.5 text-xs transition-colors rounded-lg mx-0 my-0.5 flex flex-col gap-0.5
                    ${selected?.name === strat.name
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-base-content/70 hover:bg-base-300 hover:text-base-content"
                    }`}
                >
                  <span className="font-mono truncate">{strat.name}</span>
                  <span className="text-[10px] opacity-50 flex gap-1">
                    <span className="badge badge-xs">py</span>
                    {strat.has_json && <span className="badge badge-xs badge-ghost">json</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ── Main area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <div className="text-5xl mb-4 opacity-10">📝</div>
                <div className="text-base font-semibold text-base-content/30">Select a strategy to edit</div>
                <div className="text-xs text-base-content/20 mt-1">Choose a file from the sidebar</div>
              </div>
            </div>
          ) : (
            <>
              {/* ── Header bar ── */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-base-200 border-b border-base-300 shrink-0 flex-wrap">
                <span className="font-semibold text-sm truncate">{selected.name}</span>

                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => setActiveFile("py")}
                    className={`btn btn-xs ${activeFile === "py" ? "btn-primary" : "btn-ghost opacity-60"}`}
                  >.py</button>
                  {selected.has_json && (
                    <button
                      onClick={() => setActiveFile("json")}
                      className={`btn btn-xs ${activeFile === "json" ? "btn-primary" : "btn-ghost opacity-60"}`}
                    >.json</button>
                  )}
                </div>

                {isDirty && (
                  <span className="badge badge-warning badge-xs ml-1">unsaved</span>
                )}

                <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                  <button
                    className={`btn btn-xs gap-1 ${showHistory ? "btn-secondary" : "btn-ghost opacity-70"}`}
                    onClick={() => setShowHistory(v => !v)}
                    title="Version History"
                  >
                    🕐 History {snapshots.length > 0 && !loadingSnaps && (
                      <span className="badge badge-xs">{snapshots.length}</span>
                    )}
                  </button>
                  <button className="btn btn-xs btn-outline" onClick={handleValidate} disabled={validating || loadingFile}>
                    {validating ? <><span className="loading loading-spinner loading-xs"></span> Validating…</> : "✓ Validate"}
                  </button>
                  <button className="btn btn-xs btn-ghost" onClick={handleCancel} disabled={!isDirty || saving}>Cancel</button>
                  <button
                    className={`btn btn-xs ${saveOk ? "btn-success" : "btn-primary"}`}
                    onClick={handleSave}
                    disabled={saving || !isDirty || !canSave || loadingFile}
                  >
                    {saving
                      ? <><span className="loading loading-spinner loading-xs"></span> Saving…</>
                      : saveOk ? "✓ Saved!" : "Save"}
                  </button>
                </div>
              </div>

              {/* ── Loading overlay ── */}
              {loadingFile && (
                <div className="flex-1 flex items-center justify-center">
                  <span className="loading loading-spinner loading-md opacity-40"></span>
                </div>
              )}

              {/* ── Editor + side panels ── */}
              {!loadingFile && (
                <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

                  {/* Code editor column */}
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                    <CodeEditor
                      value={currentContent}
                      onChange={setCurrentContent}
                      language={currentLanguage}
                    />
                    {(error || validateResult) && (
                      <div className="px-4 py-3 bg-base-200 border-t border-base-300 shrink-0 flex flex-col gap-2 max-h-64 overflow-y-auto">
                        {error && (
                          <div className="alert alert-error text-xs py-2 flex items-center">
                            <span className="flex-1">⚠ {error}</span>
                            <button onClick={() => setError(null)} className="btn btn-xs btn-ghost">✕</button>
                          </div>
                        )}
                        <ValidatePanel result={validateResult} />
                      </div>
                    )}
                  </div>

                  {/* ── Version History sidebar ── */}
                  {showHistory && (
                    <aside className="w-72 bg-base-200 border-l border-base-300 flex flex-col overflow-hidden shrink-0">
                      <div className="px-3 py-2.5 border-b border-base-300 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                          Version History
                        </span>
                        <button
                          className="btn btn-xs btn-ghost opacity-60"
                          onClick={() => fetchSnapshots(selected.name)}
                          title="Refresh"
                        >↺</button>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <VersionHistoryPanel
                          strategyName={selected.name}
                          snapshots={snapshots}
                          loading={loadingSnaps}
                          onRestore={snap => setRestoreTarget(snap)}
                        />
                      </div>
                      <div className="px-3 py-2 border-t border-base-300 text-[10px] text-base-content/20">
                        Snapshots auto-created on every save
                      </div>
                    </aside>
                  )}

                  {/* ── Code Hints sidebar ── */}
                  {!showHistory && activeFile === "py" && hints.length > 0 && (
                    <aside className="w-64 bg-base-200 border-l border-base-300 flex flex-col overflow-hidden shrink-0">
                      <div className="px-3 py-2.5 border-b border-base-300">
                        <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider">Code Hints</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
                        {hints.map((h, i) => <HintBadge key={i} hint={h} onInsert={insertSnippet} />)}
                      </div>
                      <div className="px-3 py-2 border-t border-base-300 text-[10px] text-base-content/20">
                        Click a hint to append snippet
                      </div>
                    </aside>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Restore confirmation modal ── */}
      {restoreTarget && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-1">⚠️ Revert Strategy?</h3>
            <p className="text-sm text-base-content/70 mb-1">
              This will overwrite your <strong>current active code and parameters</strong> with the historical snapshot from:
            </p>
            <div className="bg-base-200 rounded-lg px-3 py-2 font-mono text-sm text-base-content/80 mb-1">
              {formatTs(restoreTarget.timestamp)}
            </div>
            <div className="text-xs text-base-content/40 mb-3">
              Files: {restoreTarget.files?.join(", ") || "—"}
            </div>
            <p className="text-xs text-warning/80 mb-4">
              ⚠ Any unsaved edits will be lost. This action cannot be undone without another save.
            </p>
            <div className="modal-action mt-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setRestoreTarget(null)} disabled={restoring}>
                Cancel
              </button>
              <button className="btn btn-error btn-sm" onClick={handleRestoreConfirm} disabled={restoring}>
                {restoring
                  ? <><span className="loading loading-spinner loading-xs"></span> Restoring…</>
                  : "Restore Snapshot"}
              </button>
            </div>
          </div>
          <div className="modal-backdrop bg-black/40" onClick={() => !restoring && setRestoreTarget(null)} />
        </dialog>
      )}

      {/* ── Toast stack ── */}
      <ToastStack toasts={toasts} />
    </>
  );
}
