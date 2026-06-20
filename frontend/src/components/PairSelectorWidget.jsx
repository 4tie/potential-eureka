import { useState, useEffect, useRef, useCallback } from "react";

const API = {
  state:         () => fetch("/api/pairs").then(r => r.json()),
  search:        (q) => fetch(`/api/pairs/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
  toggleFav:     (pair) => fetch("/api/pairs/toggle-favorite", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ pair }) }).then(r => r.json()),
  toggleLock:    (pair) => fetch("/api/pairs/toggle-lock",    { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ pair }) }).then(r => r.json()),
  toggleSelect:  (pair, selected) => fetch("/api/pairs/toggle-select", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ pair, selected }) }).then(r => r.json()),
  randomize:     () => fetch("/api/pairs/randomize", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ preserve_locked: true }) }).then(r => r.json()),
  updateMax:     (n) => fetch("/api/pairs/update-max-trades", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ max_open_trades: n }) }).then(r => r.json()),
  clear:         () => fetch("/api/pairs/clear", { method:"POST" }).then(r => r.json()),
};

function applyState(data, setState) {
  if (!data) return;
  setState({
    available: data.available_pairs || [],
    selected:  new Set(data.selected_pairs || []),
    favorites: new Set(data.favorite_pairs || []),
    locked:    new Set(data.locked_pairs   || []),
    maxTrades: data.max_open_trades ?? 1,
  });
}

export default function PairSelectorWidget({ onSelectionChange }) {
  const [ps, setPs] = useState({
    available: [], selected: new Set(), favorites: new Set(), locked: new Set(), maxTrades: 1,
  });
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [maxInput,   setMaxInput]   = useState("1");
  const [busy,       setBusy]       = useState(new Set());
  const [error,      setError]      = useState(null);
  const searchRef = useRef(null);
  const maxTimer  = useRef(null);
  const lastSelectedRef = useRef("");

  const load = useCallback(async () => {
    try {
      const data = await API.state();
      applyState(data, setPs);
      setMaxInput(String(data.max_open_trades ?? 1));
      setError(null);
    } catch {
      setError("Failed to load pairs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!onSelectionChange) return;
    setTimeout(() => load(), 0);
  }, [load, onSelectionChange]);

  useEffect(() => {
    if (onSelectionChange) {
      const selectedStr = JSON.stringify(ps.selected);
      if (selectedStr !== lastSelectedRef.current) {
        lastSelectedRef.current = selectedStr;
        setTimeout(() => onSelectionChange([...ps.selected]), 0);
      }
    }
  }, [ps.selected, onSelectionChange]);

  const mutate = useCallback(async (key, fn) => {
    setBusy(b => new Set([...b, key]));
    try {
      const data = await fn();
      applyState(data, setPs);
      setMaxInput(String(data.max_open_trades ?? 1));
      setError(null);
    } catch (e) {
      setError(e.message || "Action failed");
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(key); return n; });
    }
  }, []);

  const handleToggleFav    = (pair) => mutate(`fav-${pair}`,    () => API.toggleFav(pair));
  const handleToggleLock   = (pair) => mutate(`lock-${pair}`,   () => API.toggleLock(pair));
  const handleToggleSelect = (pair) => mutate(`sel-${pair}`,    () => API.toggleSelect(pair, !ps.selected.has(pair)));
  const handleRandomize    = ()     => mutate("randomize",      () => API.randomize());
  const handleClear        = ()     => mutate("clear",          () => API.clear());

  const handleMaxChange = (raw) => {
    setMaxInput(raw);
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1) return;
    if (maxTimer.current) clearTimeout(maxTimer.current);
    maxTimer.current = setTimeout(() => mutate("max", () => API.updateMax(n)), 600);
  };

  const visiblePairs = (() => {
    const q = search.trim().toUpperCase();
    const list = q
      ? ps.available.filter(p => p.includes(q))
      : ps.available;
    const favs   = list.filter(p => ps.favorites.has(p)).sort();
    const others = list.filter(p => !ps.favorites.has(p)).sort();
    return [...favs, ...others];
  })();

  const selectedCount = ps.selected.size;
  const atLimit = selectedCount >= ps.maxTrades;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="loading loading-spinner loading-sm text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full select-none">

      {error && (
        <div className="shrink-0 mx-3 mt-2 mb-1 text-[10px] text-error bg-error/10 border border-error/20 rounded px-2.5 py-1.5">
          {error}
        </div>
      )}

      {/* ── Header controls ── */}
      <div className="shrink-0 px-3 pt-3 pb-2 flex flex-col gap-2">

        {/* Search */}
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/25 text-xs pointer-events-none">🔍</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search pairs…"
            className="input input-xs input-bordered w-full pl-7 text-xs font-mono"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/30 hover:text-base-content/70 text-xs"
              onClick={() => setSearch("")}
            >✕</button>
          )}
        </div>

        {/* Max trades + actions */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-base-content/40 font-semibold uppercase tracking-wider shrink-0">Max</span>
          <input
            type="number"
            min={1}
            className="input input-xs input-bordered w-14 text-center text-xs font-mono"
            value={maxInput}
            onChange={e => handleMaxChange(e.target.value)}
          />
          <div className="flex-1" />
          <button
            className={`btn btn-xs gap-1 ${busy.has("randomize") ? "btn-disabled" : "btn-ghost border border-base-300 hover:border-primary/40 hover:text-primary"}`}
            onClick={handleRandomize}
            title="Randomize selection"
            disabled={busy.has("randomize")}
          >
            {busy.has("randomize") ? <span className="loading loading-spinner loading-xs" /> : "🎲"}
            <span className="text-[10px]">Randomize</span>
          </button>
          <button
            className={`btn btn-xs gap-1 ${busy.has("clear") ? "btn-disabled" : "btn-ghost border border-base-300 hover:border-error/40 hover:text-error"}`}
            onClick={handleClear}
            title="Clear non-locked pairs"
            disabled={busy.has("clear")}
          >
            {busy.has("clear") ? <span className="loading loading-spinner loading-xs" /> : "✕"}
            <span className="text-[10px]">Clear</span>
          </button>
        </div>

        {/* Selection counter */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className={`font-semibold font-mono ${atLimit ? "text-warning" : "text-base-content/50"}`}>
            {selectedCount} / {ps.maxTrades}
          </span>
          <span className="text-base-content/25">selected</span>
          {ps.locked.size > 0 && (
            <span className="text-base-content/25">· {ps.locked.size} locked</span>
          )}
        </div>
      </div>

      <div className="border-t border-base-300/50 mx-3" />

      {/* ── Pair list ── */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {visiblePairs.length === 0 && (
          <div className="text-center py-6 text-xs text-base-content/25 italic">
            {search ? "No pairs match your search." : "No pairs available."}
          </div>
        )}

        {visiblePairs.map(pair => {
          const isSel  = ps.selected.has(pair);
          const isFav  = ps.favorites.has(pair);
          const isLock = ps.locked.has(pair);
          const isBusySel  = busy.has(`sel-${pair}`);
          const isBusyFav  = busy.has(`fav-${pair}`);
          const isBusyLock = busy.has(`lock-${pair}`);
          const canSelect  = isSel || !atLimit;

          return (
            <div
              key={pair}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-0.5 transition-colors cursor-pointer group
                ${isSel
                  ? "bg-primary/10 hover:bg-primary/15"
                  : "hover:bg-base-200/60"
                }
                ${!canSelect && !isSel ? "opacity-50" : ""}
              `}
              onClick={() => { if (!isBusySel && (canSelect || isSel) && !isLock) handleToggleSelect(pair); }}
            >
              {/* Checkbox */}
              <div className="shrink-0">
                {isBusySel ? (
                  <span className="loading loading-spinner loading-xs text-primary" />
                ) : (
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs checkbox-primary"
                    checked={isSel}
                    disabled={(!canSelect && !isSel) || isLock}
                    onChange={() => {}}
                    onClick={e => { e.stopPropagation(); if (!isBusySel && !isLock) handleToggleSelect(pair); }}
                    readOnly
                  />
                )}
              </div>

              {/* Pair name */}
              <span className={`flex-1 font-mono text-xs truncate ${isSel ? "text-base-content/90 font-semibold" : "text-base-content/60"}`}>
                {pair}
              </span>

              {/* Lock badge if locked */}
              {isLock && (
                <span className="text-[9px] text-warning/70 font-mono">locked</span>
              )}

              {/* Favorite star */}
              <button
                className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors
                  ${isFav ? "text-yellow-400" : "text-base-content/15 hover:text-yellow-400/60"}
                  ${isBusyFav ? "pointer-events-none" : ""}
                `}
                onClick={e => { e.stopPropagation(); handleToggleFav(pair); }}
                title={isFav ? "Remove from favorites" : "Add to favorites"}
              >
                {isBusyFav ? <span className="loading loading-spinner loading-xs" /> : "★"}
              </button>

              {/* Lock toggle */}
              <button
                className={`shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors text-[11px]
                  ${isLock ? "text-warning hover:text-warning/70" : "text-base-content/15 hover:text-warning/60"}
                  ${isBusyLock ? "pointer-events-none" : ""}
                `}
                onClick={e => { e.stopPropagation(); handleToggleLock(pair); }}
                title={isLock ? "Unlock pair" : "Lock pair (won't be cleared or randomized away)"}
              >
                {isBusyLock ? <span className="loading loading-spinner loading-xs" /> : (isLock ? "🔒" : "🔓")}
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}
