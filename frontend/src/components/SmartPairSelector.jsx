/**
 * SmartPairSelector — drop-in replacement for the Trading Pairs input.
 *
 * Props:
 *   value               string[]   – currently selected pairs (controlled)
 *   onChange            fn         – called with new string[] when selection changes
 *   onMaxTradesChange   fn         – called with new number when max trades changes
 *   maxTrades           number     – optional controlled selection/group limit
 *   disabled            bool       – disables trigger and all interactions
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../services/api.js";

export default function SmartPairSelector({ value, onChange, onMaxTradesChange, maxTrades, disabled }) {
  const [available, setAvailable] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [locked, setLocked]       = useState(new Set());
  const [maxTradesLimit, setMaxTradesLimit] = useState(1);
  const [maxInput, setMaxInput]   = useState("1");
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState("");
  const [error, setError]         = useState(null);
  const [loading, setLoading]     = useState(true);

  const wrapRef  = useRef(null);
  const searchTimer = useRef(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── derive selected from value prop (fully controlled) ────────────────────
  const selected = useMemo(() => new Set(value?.filter(Boolean) || []), [value]);

  // ── initial load from API (available pairs only) ──────────────────────────
  useEffect(() => {
    api.pairs.getAll()
      .then(data => {
        setAvailable(data.available_pairs || []);
        setFavorites(new Set(data.favorite_pairs || []));
        setLocked(new Set(data.locked_pairs || []));
        const max = data.max_open_trades ?? 1;
        setMaxTradesLimit(max);
        setMaxInput(String(max));
        setLoading(false);
      })
      .catch(() => setError("Failed to load pairs"))
      .finally(() => setLoading(false));
  // run once on mount
  }, []);

  // ── close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!search.trim()) {
      // Clearing the controlled search state when the query is emptied is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await api.pairs.search(search);
        setSearchResults(data.matches || []);
      } catch (err) {
        console.debug("Pair search failed:", err);
        setSearchResults([]);
      }
      setSearchLoading(false);
    }, 200);
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
        searchTimer.current = null;
      }
    };
  }, [search]);

  const handleToggleFav    = (e, pair) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(pair)) next.delete(pair);
      else next.add(pair);
      return next;
    });
  };

  const handleToggleLock   = (e, pair) => {
    e.stopPropagation();
    setLocked(prev => {
      const next = new Set(prev);
      if (next.has(pair)) next.delete(pair);
      else next.add(pair);
      return next;
    });
  };

  const controlledMaxTrades = parseInt(maxTrades, 10);
  const hasControlledMaxTrades = !isNaN(controlledMaxTrades) && controlledMaxTrades > 0;
  const effectiveMaxTrades = hasControlledMaxTrades ? controlledMaxTrades : maxTradesLimit;
  const displayedMaxInput = hasControlledMaxTrades ? String(controlledMaxTrades) : maxInput;

  const handleToggleSelect = (pair) => {
    const next = new Set(selected);
    if (next.has(pair)) next.delete(pair);
    else if (next.size < effectiveMaxTrades) next.add(pair);
    if (onChange) onChange([...next]);
  };

  const handleRandomize    = () => {
    if (available.length === 0) return;
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const toSelect = shuffled.slice(0, effectiveMaxTrades).filter(p => !locked.has(p));
    const newSelected = new Set([...locked].filter(p => available.includes(p)));
    toSelect.forEach(p => newSelected.add(p));
    if (onChange) onChange([...newSelected]);
  };

  const handleClear        = () => {
    const newSelected = new Set([...locked].filter(p => available.includes(p)));
    if (onChange) onChange([...newSelected]);
  };

  const handleMaxInput = (raw) => {
    setMaxInput(raw);
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 1) return;
    setMaxTradesLimit(n);
    if (onMaxTradesChange) onMaxTradesChange(n);
    // Trim selected pairs if over new limit
    if (selected.size > n) {
      const arr = [...selected];
      const newSelected = new Set(arr.slice(0, n));
      if (onChange) onChange([...newSelected]);
    }
  };

  // ── display list (favorites pinned, filtered by search) ──────────────────
  const displayList = (() => {
    const q = search.trim().toUpperCase();
    if (q && searchResults.length > 0) {
      return searchResults;
    }
    const base = q ? available.filter(p => p.includes(q)) : available;
    const favs   = base.filter(p => favorites.has(p)).sort();
    const others = base.filter(p => !favorites.has(p)).sort();
    return [...favs, ...others];
  })();

  const selectedArr = [...selected];
  const atLimit = selectedArr.length >= effectiveMaxTrades;

  // ── trigger label ─────────────────────────────────────────────────────────
  const triggerLabel = (() => {
    if (loading) return "Loading pairs…";
    if (selectedArr.length === 0) return null;
    const first2 = selectedArr.slice(0, 2).join(", ");
    return selectedArr.length > 2 ? `${first2}  +${selectedArr.length - 2} more` : first2;
  })();

  return (
    <div className="form-control" ref={wrapRef}>
      <label className="label">
        <span className="label-text font-medium">Trading Pairs</span>
        <span className="label-text-alt text-base-content/50">
          {selectedArr.length > 0
            ? <span className={`font-mono ${atLimit ? "text-warning" : ""}`}>{selectedArr.length} / {effectiveMaxTrades} selected</span>
            : "Click to choose pairs"}
        </span>
      </label>

      {/* ── Trigger button ── */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`input input-bordered w-full text-left flex items-center justify-between gap-2 px-3 cursor-pointer transition-colors
          ${open ? "border-primary/60 ring-1 ring-primary/20" : ""}
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-base-content/30"}
        `}
      >
        <span className={`flex-1 truncate font-mono text-sm ${triggerLabel ? "text-base-content/80" : "text-base-content/30 italic"}`}>
          {triggerLabel || "Select trading pairs…"}
        </span>
        {loading
          ? <span className="loading loading-spinner loading-xs text-primary shrink-0" />
          : <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-base-content/30 transition-transform ${open ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6"/></svg>
        }
      </button>

      {/* ── Popover panel ── */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-w-sm bg-base-100 border border-base-300 rounded-xl shadow-2xl overflow-hidden flex flex-col"
          style={{ top: "calc(100% + 4px)", left: 0, maxHeight: "420px" }}
        >
          {error && (
            <div className="px-3 pt-2 pb-0">
              <div className="text-[10px] text-error bg-error/10 border border-error/20 rounded px-2 py-1">{error}</div>
            </div>
          )}

          {/* Top controls */}
          <div className="px-3 pt-3 pb-2 flex flex-col gap-2 border-b border-base-300/60">
            {/* Search */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/25 text-xs pointer-events-none select-none">🔍</span>
              <input
                type="text"
                placeholder="Filter pairs…"
                className="input input-xs input-bordered w-full pl-7 font-mono text-xs"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              {searchLoading && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 loading loading-spinner loading-xs text-primary" />}
              {search && !searchLoading && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/25 hover:text-base-content/60 text-xs" onClick={() => setSearch("")}>✕</button>
              )}
            </div>

            {/* Max trades + action buttons */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-base-content/40 font-semibold uppercase tracking-wider shrink-0">Max</span>
              <input
                type="number"
                min={1}
                className="input input-xs input-bordered w-14 text-center font-mono text-xs"
                value={displayedMaxInput}
                onChange={e => handleMaxInput(e.target.value)}
              />
              <div className="flex-1"/>
              <button
                type="button"
                onClick={handleRandomize}
                className="btn btn-xs gap-1 btn-ghost border border-base-300 hover:border-primary/40 hover:text-primary"
                title="Randomize selection (respects max trades, preserves locks)"
              >
                🎲
                <span className="text-[10px]">Randomize</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="btn btn-xs gap-1 btn-ghost border border-base-300 hover:border-error/40 hover:text-error"
                title="Clear all unlocked pairs"
              >
                ✕
                <span className="text-[10px]">Clear</span>
              </button>
            </div>
          </div>

          {/* Pair list */}
          <div className="overflow-y-auto flex-1 px-1.5 py-1.5">
            {displayList.length === 0 && (
              <div className="text-center py-5 text-xs text-base-content/25 italic">
                {search ? "No matches found." : "No pairs available."}
              </div>
            )}
            {displayList.map(pair => {
              const isSel      = selected.has(pair);
              const isFav      = favorites.has(pair);
              const isLock     = locked.has(pair);
              const canSelect  = isSel || !atLimit;

              return (
                <div
                  key={pair}
                  onClick={() => { if (canSelect) handleToggleSelect(pair); }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-0.5 transition-colors cursor-pointer group select-none
                    ${isSel ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-base-200/70"}
                    ${!canSelect && !isSel ? "opacity-40 cursor-not-allowed" : ""}
                  `}
                >
                  {/* Checkbox */}
                  <div className="shrink-0 w-4 flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={isSel}
                      disabled={!canSelect && !isSel}
                      onClick={e => { e.stopPropagation(); if (canSelect) handleToggleSelect(pair); }}
                      readOnly
                    />
                  </div>

                  {/* Pair name */}
                  <span className={`flex-1 font-mono text-xs truncate ${isSel ? "text-base-content/90 font-semibold" : "text-base-content/60"}`}>
                    {pair}
                  </span>

                  {/* Locked badge */}
                  {isLock && <span className="text-[9px] text-warning/60 font-mono leading-none">locked</span>}

                  {/* Favorite */}
                  <button
                    type="button"
                    onClick={e => handleToggleFav(e, pair)}
                    className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-sm transition-colors leading-none
                      ${isFav ? "text-yellow-400" : "text-base-content/10 group-hover:text-base-content/25 hover:!text-yellow-400"}
                    `}
                    title={isFav ? "Remove from favorites" : "Add to favorites"}
                  >
                    ★
                  </button>

                  {/* Lock toggle */}
                  <button
                    type="button"
                    onClick={e => handleToggleLock(e, pair)}
                    className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[11px] transition-colors
                      ${isLock ? "text-warning hover:text-warning/60" : "text-base-content/10 group-hover:text-base-content/25 hover:!text-warning/60"}
                    `}
                    title={isLock ? "Unlock (will be affected by clear/randomize)" : "Lock (survives clear and randomize)"}
                  >
                    {isLock ? "🔒" : "🔓"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer: selected badges */}
          {selectedArr.length > 0 && (
            <div className="border-t border-base-300/60 px-3 py-2 flex flex-wrap gap-1.5 bg-base-200/40 max-h-24 overflow-y-auto">
              {selectedArr.map(p => (
                <span key={p} className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border
                  ${locked.has(p) ? "border-warning/30 text-warning/70 bg-warning/5" : "border-primary/25 text-primary/80 bg-primary/5"}
                `}>
                  {locked.has(p) && <span className="text-[9px]">🔒</span>}
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
