import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api.js";
import { useToast } from "../hooks/useToast.js";

export function InputRow({ label, sub, value, onChange, disabled, placeholder, readOnly, type = "text", min, max }) {
  return (
    <div className="form-control">
      <label className="label py-1">
        <span className="label-text font-medium text-sm">{label}</span>
        {sub && <span className="label-text-alt text-base-content/50 text-xs">{sub}</span>}
      </label>
      <input
        type={type}
        className={`input input-bordered input-sm w-full ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
        value={value}
        onChange={e => onChange(type === "number" ? parseInt(e.target.value) || 0 : e.target.value)}
        disabled={disabled || readOnly}
        placeholder={placeholder}
        readOnly={readOnly}
        min={min}
        max={max}
      />
    </div>
  );
}

export function SectionDivider({ label, danger }) {
  return (
    <div className={`divider text-xs my-0 ${danger ? "text-error/60" : "text-base-content/40"}`}>
      {label}
    </div>
  );
}

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [saved, setSaved]       = useState(false);
  const [dirty, setDirty]       = useState(false);

  const [models, setModels]           = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [healthMetrics, setHealthMetrics] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const { push: pushToast } = useToast();

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(d => { setSettings(d.settings); setLoading(false); })
      .catch(() => { setError("Failed to load settings."); setLoading(false); });
  }, []);

  const update = useCallback((key, val) => {
    setSettings(prev => prev ? { ...prev, [key]: val } : prev);
    setDirty(true);
    setSaved(false);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true); setError(null); setSaved(false);
    try {
      const d = await api.settings.save(settings);
      setSettings(d.settings);
      setSaved(true);
      setDirty(false);
      pushToast("Settings saved.", "success", 3000);
    } catch (e) {
      setError(e.message || "Network error while saving settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all settings to server defaults? Any custom paths will be overwritten.")) return;
    setLoading(true); setError(null); setSaved(false);
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freqtrade_executable_path: "freqtrade",
          strategies_directory_path: "user_data/strategies",
          user_data_directory_path: "user_data",
          default_config_file_path: "user_data/config.json",
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.detail || "Reset failed.");
      } else {
        setSettings(d.settings);
        setSaved(true);
        setDirty(false);
      }
    } catch {
      setError("Network error during reset.");
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const d = await api.ai.getModels();
      if (!d.reachable) {
        const provider = settings?.ollama_provider || "local";
        const netMode = settings?.network_mode || "local";
        const hint = provider === "ollama_cloud"
          ? "Check your Ollama Cloud API URL and API key above, and ensure the endpoint is reachable."
          : netMode === "tailscale"
            ? "Check your Tailscale IP in the URL field above and ensure Ollama is running on your home machine."
            : "Start Ollama locally: run `ollama serve` on this machine.";
        setModelsError(`${d.error || "Ollama unreachable."} ${hint}`);
        setModels([]);
      } else {
        setModels(d.models || []);
        if ((d.models || []).length === 0) {
          const provider = settings?.ollama_provider || "local";
          setModelsError(provider === "ollama_cloud"
            ? "No cloud models found. Try a different cloud model name."
            : "No models found. Pull one with: ollama pull llama3");
        }
      }
    } catch (e) {
      setModelsError(e.message);
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [settings]);

  const fetchHealthMetrics = useCallback(async () => {
    setHealthLoading(true);
    try {
      const response = await fetch("/api/ai/health-monitor");
      const data = await response.json();
      setHealthMetrics(data);
    } catch (e) {
      console.error("Failed to fetch health metrics:", e);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="skeleton h-64 w-full rounded-box" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="alert alert-error"><span>Could not load settings.</span></div>
      </div>
    );
  }

  const pathFields = [
    { key: "freqtrade_executable_path", label: "Freqtrade Executable",  sub: "Path to freqtrade binary" },
    { key: "strategies_directory_path", label: "Strategies Directory",  sub: "Where strategy .py files live" },
    { key: "user_data_directory_path",  label: "User Data Directory",   sub: "Data, results, logs root" },
    { key: "default_config_file_path",  label: "Default Config File",   sub: "Base Freqtrade config JSON" },
  ];

  const perfFields = [
    { key: "hyperopt_workers", label: "Workers Count", sub: "Parallel workers for hyperopt (2 = safe default)", type: "number", min: 1, max: 32 },
  ];

  const currentModel = settings.ollama_model || "";

  return (
    <div className="flex flex-col gap-0">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="card bg-base-200 shadow-xl border border-base-300">
          <div className="card-body gap-6">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="card-title text-xl font-semibold tracking-tight">Settings</h2>
                <p className="text-xs text-base-content/50 mt-0.5">
                  Configure engine paths, directories, and AI assistant
                </p>
              </div>
              <div className="flex items-center gap-2">
                {dirty && (
                  <span className="badge badge-sm badge-warning gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning-content" />
                    Unsaved changes
                  </span>
                )}
                {saved && (
                  <span className="badge badge-sm badge-success gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Saved
                  </span>
                )}
                <button
                  className={`btn btn-sm btn-primary ${saving ? "loading" : ""}`}
                  onClick={handleSave}
                  disabled={saving || !dirty}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="alert alert-error alert-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* ── Freqtrade Engine ── */}
            <SectionDivider label="FREQTRADE ENGINE" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pathFields.map(f => (
                <InputRow
                  key={f.key}
                  label={f.label}
                  sub={f.sub}
                  value={settings[f.key] || ""}
                  onChange={v => update(f.key, v)}
                  disabled={saving}
                />
              ))}
              {perfFields.map(f => (
                <InputRow
                  key={f.key}
                  label={f.label}
                  sub={f.sub}
                  value={settings[f.key] ?? ""}
                  onChange={v => update(f.key, v)}
                  disabled={saving}
                  type={f.type}
                  min={f.min}
                  max={f.max}
                />
              ))}
            </div>

            {/* Workers explanation */}
            <div className="bg-base-300/30 border border-base-300 rounded-lg px-3 py-2.5 text-xs text-base-content/60 space-y-1">
              <p className="font-semibold text-base-content/80">Parallel Workers Explained:</p>
              <p>• <strong>What it does:</strong> Speeds up hyperopt by running multiple optimization trials simultaneously on different CPU cores.</p>
              <p>• <strong>How to choose:</strong></p>
              <p className="pl-4">- Use <strong>2-4 workers</strong> for most systems (safe default)</p>
              <p className="pl-4">- Higher numbers = faster optimization but may slow down other processes</p>
              <p className="pl-4">- For maximum speed: Use your CPU core count (e.g., 8 cores = 8 workers)</p>
              <p className="pl-4">- To leave one core free for system: Use CPU core count - 1</p>
              <p>• <strong>Applies to:</strong> Both standard hyperopt and Walk-Forward Optimization</p>
            </div>

            {/* ── Network Mode ── */}
            <SectionDivider label="NETWORK MODE" />

            <div className="space-y-3">
              <div className="flex items-start gap-2 text-xs text-base-content/50 bg-base-300/30 rounded-lg px-3 py-2.5 border border-base-300">
                <span className="text-base leading-none mt-0.5 shrink-0">🔒</span>
                <span>
                  Choose how this Replit instance connects to your local services.
                  <strong> Tailscale</strong> creates a secure VPN tunnel to your home network —
                  no port-forwarding needed.
                </span>
              </div>

              <div className="flex gap-2">
                {[
                  { value: "local", label: "Local / Direct", icon: "🌐",
                    hint: "Connect via localhost or LAN IP. Works when Replit and Ollama are on the same machine or network." },
                  { value: "tailscale", label: "Tailscale VPN", icon: "🔒",
                    hint: "Connect via your Tailscale mesh. Use your home machine's Tailscale IP (100.x.y.z) as the Ollama URL." },
                ].map(({ value, label, icon, hint }) => {
                  const active = (settings.network_mode || "local") === value;
                  return (
                    <button
                      key={value}
                      className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all cursor-pointer ${
                        active
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-base-300 bg-base-300/30 hover:border-base-content/30"
                      }`}
                      onClick={() => {
                        update("network_mode", value);
                        if (value === "local") update("ollama_api_url", "http://localhost:11434");
                      }}
                      disabled={saving}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{icon}</span>
                        <span className={`text-xs font-semibold ${active ? "text-primary" : "text-base-content/70"}`}>
                          {label}
                        </span>
                        {active && (
                          <span className="ml-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-base-content/40 leading-snug">{hint}</p>
                    </button>
                  );
                })}
              </div>

              {(settings.network_mode || "local") === "tailscale" && (
                <div className="bg-base-300/30 border border-primary/20 rounded-lg px-3 py-2.5 text-xs text-base-content/60 space-y-1">
                  <p className="font-semibold text-base-content/80">Tailscale quick-start:</p>
                  <p>1. Add <code className="bg-base-300 px-1 rounded font-mono">TAILSCALE_AUTH_KEY</code> to your Replit Secrets</p>
                  <p>2. Restart the Backend — it will connect automatically on startup</p>
                  <p>3. Set the Ollama URL below to your home machine's Tailscale IP:<br/>
                     <code className="bg-base-300 px-1 rounded font-mono">http://100.x.y.z:11434</code></p>
                </div>
              )}
            </div>

            {/* ── AI Assistant (OLLAMA) ── */}
            <SectionDivider label="AI ASSISTANT (OLLAMA)" />

            <div className="space-y-4">
              {/* AI Provider toggle */}
              <div className="flex gap-2">
                {[
                  { value: "local", label: "Local", icon: "🖥️",
                    hint: "Connect to Ollama running on localhost:11434. No API key needed." },
                  { value: "ollama_cloud", label: "Ollama Cloud API", icon: "☁️",
                    hint: "Connect to ollama.com's API directly. Requires an API key from ollama.com/settings/keys." },
                ].map(({ value, label, icon, hint }) => {
                  const active = (settings.ollama_provider || "local") === value;
                  return (
                    <button
                      key={value}
                      className={`flex-1 rounded-xl border px-4 py-3 text-left transition-all cursor-pointer ${
                        active
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-base-300 bg-base-300/30 hover:border-base-content/30"
                      }`}
                      onClick={() => {
                        update("ollama_provider", value);
                        if (value === "local") update("ollama_api_url", "http://localhost:11434");
                        if (value === "ollama_cloud" && (!settings.ollama_api_url || settings.ollama_api_url === "http://localhost:11434")) {
                          update("ollama_api_url", "https://api.ollama.com");
                        }
                      }}
                      disabled={saving}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{icon}</span>
                        <span className={`text-xs font-semibold ${active ? "text-primary" : "text-base-content/70"}`}>
                          {label}
                        </span>
                        {active && (
                          <span className="ml-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-base-content/40 leading-snug">{hint}</p>
                    </button>
                  );
                })}
              </div>

              {/* URL input — always visible, read-only in local mode */}
              <InputRow
                label="Ollama API URL"
                sub={settings.ollama_provider === "ollama_cloud" ? "e.g. https://api.ollama.com" : "Auto-set to localhost for local provider"}
                value={settings.ollama_api_url || ""}
                onChange={v => update("ollama_api_url", v)}
                placeholder="https://api.ollama.com"
                disabled={saving || settings.ollama_provider === "local"}
                readOnly={settings.ollama_provider === "local"}
              />

              {/* API Key input — only in cloud mode */}
              {settings.ollama_provider === "ollama_cloud" && (
                <InputRow
                  label="Ollama Cloud API Key"
                  sub="Create one at ollama.com/settings/keys"
                  value={settings.ollama_api_key || ""}
                  onChange={v => update("ollama_api_key", v)}
                  placeholder="ollama-key-..."
                  type="password"
                  disabled={saving}
                />
              )}

              {/* Model selector */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text font-medium text-sm">AI Model</span>
                  <span className="label-text-alt text-base-content/50 text-xs">Model used for strategy explanations</span>
                </label>
                <div className="flex gap-2">
                  <select
                    className="select select-bordered select-sm flex-1"
                    value={currentModel}
                    onChange={e => update("ollama_model", e.target.value)}
                    disabled={saving || modelsLoading}
                  >
                    {!currentModel && models.length === 0 && (
                      <option value="">— Refresh to load models —</option>
                    )}
                    {currentModel && !models.includes(currentModel) && (
                      <option value={currentModel}>{currentModel}</option>
                    )}
                    {models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {models.length === 0 && currentModel && (
                      <option value="">— none —</option>
                    )}
                  </select>

                  <button
                    className={`btn btn-sm btn-ghost border border-base-300 gap-1.5 shrink-0 ${modelsLoading ? "loading" : ""}`}
                    onClick={() => fetchModels()}
                    disabled={modelsLoading || saving || !settings.ollama_api_url}
                    title="Fetch available models from Ollama"
                  >
                    {modelsLoading ? "" : "↻ Refresh Models"}
                  </button>
                </div>

                {modelsError && (
                  <div className="mt-2 text-xs text-error/80 flex items-start gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>{modelsError}</span>
                  </div>
                )}

                {models.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-base-content/40">
                    {models.length} model{models.length !== 1 ? "s" : ""} found · select one and save
                  </p>
                )}

                {!currentModel && models.length === 0 && !modelsError && (
                  <p className="mt-1.5 text-[11px] text-base-content/30 italic">
                    Click "↻ Refresh Models" to load available Ollama models
                  </p>
                )}
              </div>

              {/* quick-start hint */}
              {!currentModel && (
                <div className="bg-base-300/30 border border-base-300 rounded-lg p-3 text-xs text-base-content/50 space-y-1">
                  <p className="font-medium text-base-content/70">Getting started:</p>
                  {(settings.ollama_provider || "local") === "local" ? (
                    <>
                      <p>1. Install Ollama → <span className="font-mono">https://ollama.com</span></p>
                      <p>2. <code className="bg-base-300 px-1 rounded font-mono">ollama serve</code></p>
                      <p>3. <code className="bg-base-300 px-1 rounded font-mono">ollama pull llama3</code></p>
                      <p>4. Click Refresh Models, select <span className="font-mono">llama3:latest</span>, then Save</p>
                    </>
                  ) : (
                    <>
                      <p>1. Sign in at <span className="font-mono">https://ollama.com</span></p>
                      <p>2. Create an API key at <span className="font-mono">ollama.com/settings/keys</span></p>
                      <p>3. Paste the API key above</p>
                      <p>4. Click Refresh Models, select a cloud model, then Save</p>
                    </>
                  )}
                </div>
              )}

              {/* Timeout input */}
              <InputRow
                label="Ollama Timeout (seconds)"
                sub="Request timeout for AI calls"
                value={settings.ollama_timeout ?? 30}
                onChange={v => update("ollama_timeout", v)}
                disabled={saving}
                type="number"
                min={5}
                max={120}
              />

              {/* AI Self-Healing Toggle */}
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={settings.ollama_self_healing_enabled || false}
                    onChange={e => update("ollama_self_healing_enabled", e.target.checked)}
                    disabled={saving || !currentModel}
                  />
                  <div className="flex flex-col">
                    <span className="label-text font-medium text-sm">Enable AI Self-Healing</span>
                    <span className="label-text-alt text-base-content/50 text-xs">
                      Use Ollama to suggest intelligent parameter adjustments when sensitivity checks fail
                    </span>
                  </div>
                </label>
                {!currentModel && (
                  <p className="mt-1 text-[11px] text-base-content/30 italic">
                    Configure an AI model above to enable self-healing
                  </p>
                )}
              </div>
            </div>

            {/* ── Reliability Settings ── */}
            <SectionDivider label="RELIABILITY SETTINGS" />

            <div className="space-y-4">
              <div className="bg-base-300/30 border border-base-300 rounded-lg px-3 py-2.5 text-xs text-base-content/60 space-y-1">
                <p className="font-semibold text-base-content/80">Configure Ollama reliability and performance:</p>
                <p>• <strong>Retry delays:</strong> Time to wait between retry attempts (seconds)</p>
                <p>• <strong>Circuit breaker:</strong> Opens after N failures, cools down for M seconds</p>
                <p>• <strong>Connection pooling:</strong> Max concurrent connections and keepalive duration</p>
              </div>

              {/* Retry Delays */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text font-medium text-sm">Retry Delays (seconds)</span>
                  <span className="label-text-alt text-base-content/50 text-xs">Comma-separated: 2,5,10,15</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered input-sm w-full"
                  value={(settings.ollama_retry_delays || []).join(",")}
                  onChange={e => {
                    const delays = e.target.value.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
                    update("ollama_retry_delays", delays.length > 0 ? delays : [2, 5, 10, 15]);
                  }}
                  placeholder="2,5,10,15"
                  disabled={saving}
                />
              </div>

              {/* Circuit Breaker Settings */}
              <div className="grid grid-cols-2 gap-4">
                <InputRow
                  label="Circuit Breaker Threshold"
                  sub="Failures before opening circuit"
                  value={settings.ollama_circuit_breaker_threshold ?? 5}
                  onChange={v => update("ollama_circuit_breaker_threshold", v)}
                  disabled={saving}
                  type="number"
                  min={1}
                  max={20}
                />
                <InputRow
                  label="Circuit Breaker Cooldown (s)"
                  sub="Seconds to wait before retry"
                  value={settings.ollama_circuit_breaker_cooldown ?? 300}
                  onChange={v => update("ollama_circuit_breaker_cooldown", v)}
                  disabled={saving}
                  type="number"
                  min={30}
                  max={600}
                />
              </div>

              {/* Connection Pool Settings */}
              <div className="grid grid-cols-2 gap-4">
                <InputRow
                  label="Connection Pool Size"
                  sub="Max concurrent connections"
                  value={settings.ollama_connection_pool_size ?? 10}
                  onChange={v => update("ollama_connection_pool_size", v)}
                  disabled={saving}
                  type="number"
                  min={1}
                  max={50}
                />
                <InputRow
                  label="Connection Keepalive (s)"
                  sub="Keep idle connections alive"
                  value={settings.ollama_connection_keepalive ?? 30}
                  onChange={v => update("ollama_connection_keepalive", v)}
                  disabled={saving}
                  type="number"
                  min={5}
                  max={120}
                />
              </div>

              {/* Health Check Settings */}
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm toggle-primary"
                    checked={settings.ollama_enable_health_check ?? true}
                    onChange={e => update("ollama_enable_health_check", e.target.checked)}
                    disabled={saving}
                  />
                  <div className="flex flex-col">
                    <span className="label-text font-medium text-sm">Enable Health Checks</span>
                    <span className="label-text-alt text-base-content/50 text-xs">
                      Periodically check Ollama health before requests
                    </span>
                  </div>
                </label>
              </div>

              {settings.ollama_enable_health_check && (
                <InputRow
                  label="Health Check Interval (seconds)"
                  sub="Time between health checks"
                  value={settings.ollama_health_check_interval ?? 60}
                  onChange={v => update("ollama_health_check_interval", v)}
                  disabled={saving}
                  type="number"
                  min={10}
                  max={300}
                />
              )}
            </div>

            {/* ── Ollama Health Monitor ── */}
            <SectionDivider label="OLLAMA HEALTH MONITOR" />

            <div className="space-y-4">
              <div className="bg-base-300/30 border border-base-300 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Real-time Health Status</span>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => fetchHealthMetrics()}
                    disabled={healthLoading}
                  >
                    {healthLoading ? "Loading..." : "↻ Refresh"}
                  </button>
                </div>

                {healthMetrics ? (
                  <div className="space-y-3">
                    {/* Health Status */}
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${healthMetrics.healthy ? "bg-success" : "bg-error"}`} />
                      <span className="text-sm">
                        {healthMetrics.healthy ? "Healthy" : "Unhealthy"}
                      </span>
                      {healthMetrics.last_check_time && (
                        <span className="text-xs text-base-content/50 ml-auto">
                          Last check: {new Date(healthMetrics.last_check_time).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    {/* Circuit Breaker State */}
                    {healthMetrics.metrics?.circuit_breaker && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Circuit State:</span>
                          <span className={`font-medium ${healthMetrics.metrics.circuit_breaker.state === "open" ? "text-error" : "text-success"}`}>
                            {healthMetrics.metrics.circuit_breaker.state.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Failures:</span>
                          <span>{healthMetrics.metrics.circuit_breaker.failure_count}/{healthMetrics.metrics.circuit_breaker.failure_threshold}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Total Failures:</span>
                          <span>{healthMetrics.metrics.circuit_breaker.total_failures}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Total Successes:</span>
                          <span>{healthMetrics.metrics.circuit_breaker.total_successes}</span>
                        </div>
                      </div>
                    )}

                    {/* Request Metrics */}
                    {healthMetrics.metrics?.client_metrics && (
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Total Requests:</span>
                          <span>{healthMetrics.metrics.client_metrics.total_requests}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Success Rate:</span>
                          <span>{(healthMetrics.metrics.success_rate * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-base-content/60">Avg Latency:</span>
                          <span>{healthMetrics.metrics.average_latency_ms.toFixed(0)}ms</span>
                        </div>
                      </div>
                    )}

                    {/* Consecutive Failures/Successes */}
                    {healthMetrics.consecutive_failures > 0 && (
                      <div className="text-xs text-error/80">
                        Consecutive failures: {healthMetrics.consecutive_failures}
                      </div>
                    )}
                    {healthMetrics.consecutive_successes > 0 && (
                      <div className="text-xs text-success/80">
                        Consecutive successes: {healthMetrics.consecutive_successes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-base-content/50">
                    Click "↻ Refresh" to load health metrics
                  </div>
                )}
              </div>
            </div>

            {/* ── Danger Zone ── */}
            <SectionDivider label="DANGER ZONE" danger />
            <div className="card bg-error/5 border border-error/20 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-medium text-sm text-error">Reset to Defaults</div>
                  <div className="text-xs text-base-content/50">
                    Overwrites all custom paths with server defaults
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-error btn-outline"
                  onClick={handleReset}
                  disabled={saving}
                >
                  Reset
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
