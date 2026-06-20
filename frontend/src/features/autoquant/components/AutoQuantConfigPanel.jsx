import RunHistoryDashboard from "../../../components/RunHistoryDashboard";
import { getTimerangeSummary, getWfoWindowSummary } from "../viewModel";

const DEFAULT_PAIR_UNIVERSE =
  "BTC/USDT,ETH/USDT,BNB/USDT,SOL/USDT,XRP/USDT,ADA/USDT,DOGE/USDT,AVAX/USDT,DOT/USDT,MATIC/USDT,LINK/USDT,UNI/USDT,ATOM/USDT,LTC/USDT,ETC/USDT,FIL/USDT,NEAR/USDT,ALGO/USDT,VET/USDT,ICP/USDT,OP/USDT,ARB/USDT,PEPE/USDT,SHIB/USDT,RNDR/USDT,INJ/USDT,APT/USDT,QNT/USDT,AAVE/USDT,MKR/USDT,CRV/USDT,COMP/USDT,YFI/USDT,SNX/USDT,KAVA/USDT,ROSE/USDT,FTM/USDT,GLM/USDT,GRT/USDT,LDO/USDT,FXS/USDT,PENDLE/USDT,GMX/USDT,GALA/USDT,SAND/USDT,MANA/USDT,AXS/USDT,ENJ/USDT,IMX/USDT,SUI/USDT";

const SPACE_META = {
  buy: { description: "Entry signal thresholds that trigger a buy", costMultiplier: "2x" },
  sell: { description: "Exit signal thresholds that trigger a sell", costMultiplier: "2x" },
  roi: { description: "Minimum return targets per time bucket", costMultiplier: "1x" },
  stoploss: { description: "Fixed stop-loss percentage below entry", costMultiplier: "1x" },
  trailing: { description: "Trailing stop offset that follows price upward", costMultiplier: "1x" },
  protection: { description: "Cooldown and stoploss-guard rules", costMultiplier: "3x" },
};

const SPACE_PRESETS = [
  { label: "Fast", spaces: ["stoploss", "roi"], epochs: 50 },
  { label: "Balanced", spaces: ["buy", "roi", "stoploss"], epochs: 100 },
  { label: "Thorough", spaces: Object.keys(SPACE_META), epochs: 200 },
];

function ToggleSection({ title, open, onToggle, badge, children }) {
  return (
    <div className="border border-base-300 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-base-content/70 hover:bg-base-300 transition-colors"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2">
          {title}
          {badge}
        </span>
        <span className="text-base-content/40 text-[10px]">{open ? "collapse" : "expand"}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-3 bg-base-300/30 space-y-4">{children}</div>}
    </div>
  );
}

function InSampleHint({ timerange }) {
  const summary = getTimerangeSummary(timerange);
  if (!summary) {
    return <span className="label-text-alt text-base-content/40">Used for sanity backtest and hyperopt</span>;
  }
  if (summary.tone === "error") {
    return <span className="label-text-alt text-error">{summary.days} days - too short, expect overfitting</span>;
  }
  if (summary.tone === "warning") {
    return (
      <span className="label-text-alt text-warning">
        {summary.days} days ({summary.months} mo) - recommend 6+ months
      </span>
    );
  }
  return <span className="label-text-alt text-success">{summary.days} days (~{summary.months} months)</span>;
}

function ScreeningResultsTable({ rows, selectedPair, onSelect }) {
  if (!rows.length) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-base-300">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-base-content/40 text-[9px] uppercase tracking-wider">
            <th className="font-semibold">#</th>
            <th className="font-semibold">Pair</th>
            <th className="font-semibold text-right">Profit %</th>
            <th className="font-semibold text-right">Trades</th>
            <th className="font-semibold text-right">Win Rate</th>
            <th className="font-semibold text-right">Max DD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.pair}
              className={`cursor-pointer hover:bg-primary/10 transition-colors text-xs ${
                selectedPair === row.pair ? "bg-primary/15 border-l-2 border-l-primary" : ""
              }`}
              onClick={() => onSelect(row.pair)}
              title="Click to select this pair and populate the Pair Universe field"
            >
              <td className="font-mono text-base-content/40 text-[10px]">{i + 1}</td>
              <td className="font-semibold">{row.pair}</td>
              <td
                className={`text-right font-mono font-bold ${
                  row.profit_pct == null ? "text-base-content/30" : row.profit_pct >= 0 ? "text-success" : "text-error"
                }`}
              >
                {row.profit_pct == null ? "-" : `${row.profit_pct >= 0 ? "+" : ""}${row.profit_pct}%`}
              </td>
              <td className="text-right font-mono text-base-content/60">{row.trade_count ?? "-"}</td>
              <td
                className={`text-right font-mono ${
                  row.win_rate == null ? "text-base-content/30" : row.win_rate >= 50 ? "text-success" : "text-error"
                }`}
              >
                {row.win_rate == null ? "-" : `${row.win_rate}%`}
              </td>
              <td
                className={`text-right font-mono ${
                  row.max_dd == null
                    ? "text-base-content/30"
                    : row.max_dd > 20
                      ? "text-error"
                      : row.max_dd > 10
                        ? "text-warning"
                        : "text-base-content/60"
                }`}
              >
                {row.max_dd == null ? "-" : `${row.max_dd}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AutoQuantConfigPanel({
  formState,
  strategyGen,
  screening,
  uiState,
  strategiesLoading,
  isConnecting,
  runHistoryRef,
  onStart,
  onLoadRun,
}) {
  const { form, updateField, toggleSpace, timeframeProfile, showAdvanced, setShowAdvanced } = formState;
  const { generateStatus, isGenerating, templateType, setTemplateType, strategyList, handleGenerateTemplate } =
    strategyGen;
  const {
    showScreener,
    setShowScreener,
    screenPairs,
    setScreenPairs,
    screening: isScreening,
    screenResults,
    screenError,
    selectedPair,
    setSelectedPair,
    handleScreenPairs,
  } = screening;
  const { showHyperopt, setShowHyperopt, showWfo, setShowWfo, showEnsemble, setShowEnsemble } = uiState;
  const wfoSummary = form.wfo_enabled ? getWfoWindowSummary(form) : null;

  const selectScreenedPair = (pair) => {
    setSelectedPair(pair);
    updateField("pair_universe", pair);
  };

  return (
    <>
      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-5 space-y-5">
          <h2 className="text-sm font-semibold">Pipeline Configuration</h2>

          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40">
              Robustness-First Settings
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="form-control">
                <span className="label label-text text-xs font-medium">Trading Style</span>
                <select
                  className="select select-bordered select-sm"
                  value={form.trading_style}
                  onChange={(e) => updateField("trading_style", e.target.value)}
                >
                  <option value="scalping">Scalping (1m-5m)</option>
                  <option value="intraday">Intraday (5m-30m)</option>
                  <option value="swing">Swing (1h-4h)</option>
                  <option value="position">Position (1d+)</option>
                </select>
              </label>
              <label className="form-control">
                <span className="label label-text text-xs font-medium">Risk Profile</span>
                <select
                  className="select select-bordered select-sm"
                  value={form.risk_profile}
                  onChange={(e) => updateField("risk_profile", e.target.value)}
                >
                  <option value="conservative">Conservative (low risk)</option>
                  <option value="balanced">Balanced (moderate risk)</option>
                  <option value="aggressive">Aggressive (high risk)</option>
                </select>
              </label>
              <label className="form-control">
                <span className="label label-text text-xs font-medium">Analysis Depth</span>
                <select
                  className="select select-bordered select-sm"
                  value={form.analysis_depth}
                  onChange={(e) => updateField("analysis_depth", e.target.value)}
                >
                  <option value="quick">Quick (3 months IS)</option>
                  <option value="standard">Standard (6 months IS)</option>
                  <option value="deep">Deep (12 months IS)</option>
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40">Strategy</p>
            <div className="flex gap-2 items-start flex-wrap">
              {strategiesLoading ? (
                <div className="skeleton h-9 flex-1 rounded-lg" />
              ) : (
                <select
                  className="select select-bordered select-sm flex-1"
                  value={form.strategy}
                  onChange={(e) => updateField("strategy", e.target.value)}
                >
                  <option value="">Select strategy...</option>
                  {strategyList.map((s) => (
                    <option key={s.strategy_name} value={s.strategy_name}>
                      {s.strategy_name}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="select select-bordered select-sm shrink-0"
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                disabled={isGenerating}
                title="Choose which strategy template to generate"
              >
                <option value="omni">Omni-Strategy (Boolean Switches)</option>
                <option value="catfactory">CatFactory (MACD/RSI/BB)</option>
                <option value="adaptive">Adaptive Regime (ATR)</option>
                <option value="ensemble">Ensemble (Weighted Voting)</option>
                <option value="momentum">Momentum (EMA + ATR)</option>
              </select>
              <button
                type="button"
                className="btn btn-outline btn-sm gap-1.5 shrink-0"
                onClick={() => handleGenerateTemplate(form, updateField)}
                disabled={isGenerating}
              >
                {isGenerating && <span className="loading loading-spinner loading-xs" />}
                Generate
              </button>
            </div>
            {generateStatus && (
              <div className={`mt-1.5 text-xs px-2 py-1 rounded ${generateStatus.ok ? "text-success bg-success/10" : "text-error bg-error/10"}`}>
                {generateStatus.message}
              </div>
            )}
          </div>

          <ToggleSection
            title="Advanced Settings"
            open={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="form-control">
                <span className="label label-text text-xs font-medium">
                  Timeframe
                  {timeframeProfile && <span className="badge badge-xs badge-primary ml-2">{timeframeProfile.profile}</span>}
                </span>
                <select
                  className="select select-bordered select-sm"
                  value={form.timeframe}
                  onChange={(e) => updateField("timeframe", e.target.value)}
                >
                  {["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"].map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label label-text text-xs font-medium">Exchange</span>
                <select
                  className="select select-bordered select-sm"
                  value={form.exchange}
                  onChange={(e) => updateField("exchange", e.target.value)}
                >
                  {["binance", "bybit", "kraken", "kucoin", "okx", "gate"].map((ex) => (
                    <option key={ex} value={ex}>
                      {ex}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label label-text text-xs font-medium">In-Sample Timerange</span>
                <input
                  type="text"
                  className="input input-bordered input-sm font-mono"
                  value={form.in_sample_range}
                  onChange={(e) => updateField("in_sample_range", e.target.value)}
                />
                <span className="label py-0.5">
                  <InSampleHint timerange={form.in_sample_range} />
                </span>
              </label>
              <label className="form-control">
                <span className="label label-text text-xs font-medium">Out-of-Sample Timerange</span>
                <input
                  type="text"
                  className="input input-bordered input-sm font-mono"
                  value={form.out_sample_range}
                  onChange={(e) => updateField("out_sample_range", e.target.value)}
                />
              </label>
              <label className="form-control sm:col-span-2">
                <span className="label label-text text-xs font-medium">Pair Universe</span>
                <textarea
                  className="textarea textarea-bordered textarea-sm font-mono text-xs leading-relaxed"
                  rows={2}
                  value={form.pair_universe}
                  onChange={(e) => updateField("pair_universe", e.target.value)}
                  placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
                />
              </label>
              <button
                type="button"
                className="btn btn-xs btn-ghost text-[10px] gap-1 sm:col-span-2 justify-self-start"
                onClick={() => updateField("pair_universe", DEFAULT_PAIR_UNIVERSE)}
              >
                Load Default Top 50
              </button>
            </div>
          </ToggleSection>

          <ToggleSection
            title="Screen Pairs"
            open={showScreener}
            onToggle={() => setShowScreener((v) => !v)}
            badge={selectedPair && <span className="badge badge-xs badge-primary">{selectedPair}</span>}
          >
            <p className="text-[10px] text-base-content/50 leading-relaxed">
              Run quick backtests across a list of pairs to find the most profitable for your strategy.
            </p>
            <label className="form-control">
              <span className="label label-text text-xs font-medium">Pairs to Screen</span>
              <textarea
                className="textarea textarea-bordered textarea-sm font-mono text-xs leading-relaxed"
                rows={2}
                value={screenPairs}
                onChange={(e) => setScreenPairs(e.target.value)}
                disabled={isScreening}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm btn-outline gap-2 w-full"
              onClick={() => handleScreenPairs(form)}
              disabled={isScreening || !form.strategy || !screenPairs.trim()}
              title={!form.strategy ? "Select a strategy first" : ""}
            >
              {isScreening && <span className="loading loading-spinner loading-xs" />}
              Screen Pairs
            </button>
            {screenError && <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded px-3 py-2">{screenError}</div>}
            <ScreeningResultsTable rows={screenResults} selectedPair={selectedPair} onSelect={selectScreenedPair} />
            {screenResults.length === 0 && !isScreening && !screenError && (
              <div className="text-center py-3 text-xs text-base-content/35 italic">Results appear here after screening runs.</div>
            )}
          </ToggleSection>

          <ToggleSection title="Hyperopt Settings" open={showHyperopt} onToggle={() => setShowHyperopt((v) => !v)}>
            <label className="form-control">
              <span className="label label-text text-xs font-medium">Loss Function</span>
              <select
                className="select select-bordered select-sm"
                value={form.hyperopt_loss}
                onChange={(e) => updateField("hyperopt_loss", e.target.value)}
              >
                <option value="ProfitLockinHyperOptLoss">ProfitLockinHyperOptLoss - locks in high-profit trades</option>
                <option value="SharpeHyperOptLoss">SharpeHyperOptLoss - stable returns, low risk</option>
                <option value="SortinoHyperOptLoss">SortinoHyperOptLoss - penalises downside volatility only</option>
                <option value="CalmarHyperOptLoss">CalmarHyperOptLoss - return / max drawdown ratio</option>
                <option value="MaxDrawDownRelativeHyperOptLoss">MaxDrawDownRelativeHyperOptLoss - minimise drawdown first</option>
                <option value="OnlyProfitHyperOptLoss">OnlyProfitHyperOptLoss - maximise profit</option>
              </select>
            </label>
            <div>
              <span className="label label-text text-xs font-medium">Search Spaces</span>
              <div className="flex flex-wrap gap-2 mb-3">
                {SPACE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="btn btn-xs btn-outline"
                    onClick={() => {
                      updateField("hyperopt_spaces", preset.spaces);
                      updateField("hyperopt_epochs", preset.epochs);
                    }}
                  >
                    {preset.label} <span className="opacity-60 font-normal">{preset.epochs} ep</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(SPACE_META).map(([space, meta]) => {
                  const active = form.hyperopt_spaces.includes(space);
                  return (
                    <button
                      key={space}
                      type="button"
                      onClick={() => toggleSpace(space)}
                      className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                        active ? "border-primary bg-primary/10" : "border-base-300 bg-base-200/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-mono font-semibold ${active ? "text-primary" : "text-base-content/70"}`}>
                          {space}
                        </span>
                        <span className="text-[10px]">{meta.costMultiplier}</span>
                      </div>
                      <p className="text-[10px] leading-snug text-base-content/50">{meta.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="form-control">
              <span className="label label-text text-xs font-medium">Epochs</span>
              <input
                type="number"
                className="input input-bordered input-sm w-32"
                min={10}
                max={1000}
                step={10}
                value={form.hyperopt_epochs}
                onChange={(e) => updateField("hyperopt_epochs", parseInt(e.target.value, 10) || 100)}
              />
            </label>
          </ToggleSection>

          <ToggleSection
            title="Walk-Forward Optimization"
            open={showWfo}
            onToggle={() => setShowWfo((v) => !v)}
            badge={form.wfo_enabled && <span className="badge badge-primary badge-xs">ON</span>}
          >
            <label className="flex items-center gap-3 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={form.wfo_enabled}
                onChange={(e) => updateField("wfo_enabled", e.target.checked)}
              />
              {form.wfo_enabled ? "Walk-Forward enabled" : "Walk-Forward disabled (standard hyperopt)"}
            </label>
            {form.wfo_enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  ["wfo_is_months", "IS Window (months)", 1, 24, 1, 3],
                  ["wfo_oos_months", "OOS Window (months)", 1, 6, 1, 1],
                  ["wfo_recency_weight", "Recency Weight", 1, 3, 0.1, 1],
                ].map(([field, label, min, max, step, fallback]) => (
                  <label key={field} className="form-control">
                    <span className="label label-text text-xs font-medium">{label}</span>
                    <input
                      type="number"
                      className="input input-bordered input-sm"
                      min={min}
                      max={max}
                      step={step}
                      value={form[field]}
                      onChange={(e) => updateField(field, Number(e.target.value) || fallback)}
                    />
                  </label>
                ))}
              </div>
            )}
            {wfoSummary && (
              <div className={`text-[10px] px-3 py-2 rounded ${wfoSummary.isHealthy ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                {wfoSummary.isHealthy
                  ? `${wfoSummary.approxWindows} rolling windows from your IS range (${wfoSummary.totalMonths}m total)`
                  : `Too few windows (${wfoSummary.approxWindows}) - increase IS range or reduce window sizes. Need 2+ windows.`}
              </div>
            )}
          </ToggleSection>

          <ToggleSection
            title="Alpha Consensus Voting"
            open={showEnsemble}
            onToggle={() => setShowEnsemble((v) => !v)}
            badge={form.ensemble_enabled && <span className="badge badge-secondary badge-xs">ON</span>}
          >
            <label className="flex items-center gap-3 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-secondary"
                checked={form.ensemble_enabled}
                onChange={(e) => updateField("ensemble_enabled", e.target.checked)}
              />
              {form.ensemble_enabled ? "Alpha Consensus Voting enabled" : "Alpha Consensus Voting disabled"}
            </label>
          </ToggleSection>

          <ToggleSection title="Risk Thresholds" open={showAdvanced} onToggle={() => setShowAdvanced((v) => !v)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ["max_drawdown_threshold", "Max Drawdown (%)", 1, 100, 1],
                ["min_win_rate", "Min Win Rate (%)", 0, 100, 1],
                ["min_profit_factor", "Min Profit Factor", 0, undefined, 0.1],
                ["min_sharpe", "Min Sharpe Ratio", 0, undefined, 0.1],
                ["min_oos_profit", "Min OOS Profit (fraction)", -1, undefined, 0.01],
                ["monte_carlo_threshold", "MC p95 Drawdown Limit (fraction)", 0.01, 1, 0.01],
              ].map(([field, label, min, max, step]) => (
                <label key={field} className="form-control">
                  <span className="label label-text text-xs font-medium">{label}</span>
                  <input
                    type="number"
                    className="input input-bordered input-sm"
                    min={min}
                    max={max}
                    step={step}
                    value={form[field]}
                    onChange={(e) => updateField(field, parseFloat(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </ToggleSection>

          <div className="pt-2">
            <button className="btn btn-primary btn-sm gap-2" onClick={onStart} disabled={!form.strategy || isConnecting}>
              {isConnecting && <span className="loading loading-spinner loading-xs" />}
              Start Auto-Quant
            </button>
          </div>
        </div>
      </div>

      <div className="card bg-base-200 border border-base-300">
        <div className="card-body p-5">
          <h2 className="text-sm font-semibold mb-3">Run History</h2>
          <RunHistoryDashboard ref={runHistoryRef} onLoad={onLoadRun} />
        </div>
      </div>
    </>
  );
}
