import { useMemo, useState } from "react";
import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  BoltIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ClockIcon,
  FunnelIcon,
  PlayIcon,
  RectangleStackIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import RunHistoryDashboard from "../../../components/RunHistoryDashboard";
import { getTimerangeSummary, getWfoWindowSummary } from "../viewModel";

const DEFAULT_PAIR_UNIVERSE =
  "BTC/USDT,ETH/USDT,BNB/USDT,SOL/USDT,XRP/USDT,ADA/USDT,DOGE/USDT,AVAX/USDT,DOT/USDT,MATIC/USDT,LINK/USDT,UNI/USDT,ATOM/USDT,LTC/USDT,ETC/USDT,FIL/USDT,NEAR/USDT,ALGO/USDT,VET/USDT,ICP/USDT,OP/USDT,ARB/USDT,PEPE/USDT,SHIB/USDT,RNDR/USDT,INJ/USDT,APT/USDT,QNT/USDT,AAVE/USDT,MKR/USDT,CRV/USDT,COMP/USDT,YFI/USDT,SNX/USDT,KAVA/USDT,ROSE/USDT,FTM/USDT,GLM/USDT,GRT/USDT,LDO/USDT,FXS/USDT,PENDLE/USDT,GMX/USDT,GALA/USDT,SAND/USDT,MANA/USDT,AXS/USDT,ENJ/USDT,IMX/USDT,SUI/USDT";

const SPACE_META = {
  buy: { description: "Entry signal thresholds", costMultiplier: "2x" },
  sell: { description: "Exit signal thresholds", costMultiplier: "2x" },
  roi: { description: "Return targets by time bucket", costMultiplier: "1x" },
  stoploss: { description: "Fixed downside guard", costMultiplier: "1x" },
  trailing: { description: "Price-following stop offset", costMultiplier: "1x" },
  protection: { description: "Cooldown and guard rules", costMultiplier: "3x" },
};

const SPACE_PRESETS = [
  { label: "Fast", spaces: ["stoploss", "roi"], epochs: 50 },
  { label: "Balanced", spaces: ["buy", "roi", "stoploss"], epochs: 100 },
  { label: "Thorough", spaces: Object.keys(SPACE_META), epochs: 200 },
];

const SECTION_STYLES =
  "rounded-lg border border-primary/30 bg-base-200/50 shadow-sm shadow-primary/10 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/20";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function countPairs(value) {
  if (!value) return 0;
  return String(value)
    .split(/[,\n]+/)
    .map((pair) => pair.trim())
    .filter(Boolean).length;
}

function Section({
  title,
  eyebrow,
  icon: Icon,
  open,
  onToggle,
  badge,
  children,
  defaultDense = false,
}) {
  return (
    <section className={SECTION_STYLES}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-300 hover:bg-primary/10 hover:border-primary/50"
        onClick={onToggle}
      >
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary neon-glow">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          {eyebrow && (
            <span className="block text-[10px] font-semibold uppercase tracking-widest text-primary/50">
              {eyebrow}
            </span>
          )}
          <span className="flex items-center gap-2 text-sm font-semibold text-primary">
            {title}
            {badge}
          </span>
        </span>
        <ChevronDownIcon
          className={classNames(
            "h-4 w-4 text-primary/50 transition-transform duration-300",
            open ? "rotate-180" : ""
          )}
        />
      </button>
      {open && (
        <div className={classNames("border-t border-primary/30 px-4 py-4 bg-base-300/30", defaultDense ? "space-y-3" : "space-y-4")}>
          {children}
        </div>
      )}
    </section>
  );
}

function MetricPill({ label, value, tone = "base" }) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success neon-glow-green"
      : tone === "warning"
        ? "border-warning/30 bg-warning/10 text-warning neon-glow-orange"
        : tone === "error"
          ? "border-error/30 bg-error/10 text-error neon-glow-red"
          : "border-primary/30 bg-primary/10 text-primary neon-glow";

  return (
    <div className={`rounded-md border px-3 py-2 transition-all duration-300 hover:scale-105 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-bold tabular-nums">{value}</div>
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
    <div className="overflow-x-auto rounded-lg border border-primary/30 bg-base-200/50 neon-glow">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-primary/50">
            <th className="font-semibold">Rank</th>
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
              className={classNames(
                "cursor-pointer text-xs transition-all duration-300 hover:bg-primary/20 hover:scale-[1.02]",
                selectedPair === row.pair ? "bg-primary/15 border-l-2 border-primary" : ""
              )}
              onClick={() => onSelect(row.pair)}
              title="Select this pair and populate the Pair Universe field"
            >
              <td className="font-mono text-[10px] text-primary/40">{i + 1}</td>
              <td className="font-mono font-semibold text-primary">{row.pair}</td>
              <td
                className={classNames(
                  "text-right font-mono font-bold",
                  row.profit_pct == null
                    ? "text-base-content/30"
                    : row.profit_pct >= 0
                      ? "text-success neon-glow-green"
                      : "text-error neon-glow-red"
                )}
              >
                {row.profit_pct == null ? "-" : `${row.profit_pct >= 0 ? "+" : ""}${row.profit_pct}%`}
              </td>
              <td className="text-right font-mono text-base-content/60">{row.trade_count ?? "-"}</td>
              <td
                className={classNames(
                  "text-right font-mono",
                  row.win_rate == null
                    ? "text-base-content/30"
                    : row.win_rate >= 50
                      ? "text-success neon-glow-green"
                      : "text-error neon-glow-red"
                )}
              >
                {row.win_rate == null ? "-" : `${row.win_rate}%`}
              </td>
              <td
                className={classNames(
                  "text-right font-mono",
                  row.max_dd == null
                    ? "text-base-content/30"
                    : row.max_dd > 20
                      ? "text-error neon-glow-red"
                      : row.max_dd > 10
                        ? "text-warning neon-glow-orange"
                        : "text-success neon-glow-green"
                )}
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
  const [showRisk, setShowRisk] = useState(true);
  const wfoSummary = form.wfo_enabled ? getWfoWindowSummary(form) : null;
  const pairCount = useMemo(() => countPairs(form.pair_universe), [form.pair_universe]);
  const searchSpaceLabel = form.hyperopt_spaces.length ? form.hyperopt_spaces.join(", ") : "none";

  const selectScreenedPair = (pair) => {
    setSelectedPair(pair);
    updateField("pair_universe", pair);
  };

  const startDisabled = !form.strategy || isConnecting;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div className="card border border-primary/30 bg-base-200/50 neon-glow scan-effect">
          <div className="card-body p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                  Launch Console
                </p>
                <h2 className="mt-1 text-base font-bold tracking-tight text-primary crt-flicker">Pipeline Configuration</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-base-content/55">
                  Configure the validation run before AutoQuant sends the strategy through backtests,
                  hyperopt, OOS gates, stress tests, and export.
                </p>
              </div>
              <button
                className="btn btn-primary btn-sm gap-2 lg:min-w-44 neon-glow hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                onClick={onStart}
                disabled={startDisabled}
                title={!form.strategy ? "Select a strategy first" : ""}
              >
                {isConnecting ? <span className="loading loading-spinner loading-xs" /> : <PlayIcon className="h-4 w-4" />}
                Start Auto-Quant
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <MetricPill label="Timeframe" value={form.timeframe} tone="success" />
              <MetricPill label="Pairs" value={pairCount || "Default"} />
              <MetricPill label="Epochs" value={form.hyperopt_epochs} />
              <MetricPill
                label="OOS Gate"
                value={`${form.min_oos_profit}`}
                tone={Number(form.min_oos_profit) >= 0 ? "success" : "warning"}
              />
            </div>
          </div>
        </div>

        <section className={SECTION_STYLES}>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(17rem,0.9fr)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <RectangleStackIcon className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40">
                  Strategy
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {strategiesLoading ? (
                  <div className="skeleton h-9 min-w-0 flex-1 rounded-lg" />
                ) : (
                  <label className="form-control min-w-0 flex-1">
                    <span className="sr-only">Strategy</span>
                    <select
                      className="select select-bordered select-sm w-full"
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
                  </label>
                )}
                <label className="form-control sm:w-64">
                  <span className="sr-only">Template Type</span>
                  <select
                    className="select select-bordered select-sm w-full"
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value)}
                    disabled={isGenerating}
                    title="Choose which strategy template to generate"
                  >
                    <option value="omni">Omni-Strategy</option>
                    <option value="catfactory">CatFactory</option>
                    <option value="adaptive">Adaptive Regime</option>
                    <option value="ensemble">Ensemble Voting</option>
                    <option value="momentum">Momentum EMA/ATR</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-outline btn-sm gap-1.5"
                  onClick={() => handleGenerateTemplate(form, updateField)}
                  disabled={isGenerating}
                >
                  {isGenerating && <span className="loading loading-spinner loading-xs" />}
                  Generate
                </button>
              </div>
              {generateStatus && (
                <div
                  className={classNames(
                    "rounded border px-3 py-2 text-xs",
                    generateStatus.ok ? "border-success/25 bg-success/10 text-success" : "border-error/25 bg-error/10 text-error"
                  )}
                >
                  {generateStatus.message}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                ["trading_style", "Style", [
                  ["scalping", "Scalp"],
                  ["intraday", "Intraday"],
                  ["swing", "Swing"],
                  ["position", "Position"],
                ]],
                ["risk_profile", "Risk", [
                  ["conservative", "Conservative"],
                  ["balanced", "Balanced"],
                  ["aggressive", "Aggressive"],
                ]],
                ["analysis_depth", "Depth", [
                  ["quick", "Quick"],
                  ["standard", "Standard"],
                  ["deep", "Deep"],
                ]],
              ].map(([field, label, options]) => (
                <label key={field} className="form-control min-w-0">
                  <span className="label py-0 pb-1">
                    <span className="label-text text-[10px] font-semibold uppercase tracking-widest text-base-content/40">
                      {label}
                    </span>
                  </span>
                  <select
                    className="select select-bordered select-xs w-full"
                    value={form[field]}
                    onChange={(e) => updateField(field, e.target.value)}
                  >
                    {options.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        </section>

        <Section
          title="Advanced Settings"
          eyebrow="Market scope"
          icon={AdjustmentsHorizontalIcon}
          open={showAdvanced}
          onToggle={() => setShowAdvanced((v) => !v)}
          badge={timeframeProfile && <span className="badge badge-xs badge-primary">{timeframeProfile.profile}</span>}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="form-control">
              <span className="label label-text text-xs font-medium">Timeframe</span>
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
                rows={3}
                value={form.pair_universe}
                onChange={(e) => updateField("pair_universe", e.target.value)}
                placeholder="BTC/USDT, ETH/USDT, SOL/USDT"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={() => updateField("pair_universe", DEFAULT_PAIR_UNIVERSE)}
              >
                Load Default Top 50
              </button>
              <span className="text-[10px] text-base-content/45">
                Empty pair universe uses the backend default universe.
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Screen Pairs"
          eyebrow="Pre-flight"
          icon={FunnelIcon}
          open={showScreener}
          onToggle={() => setShowScreener((v) => !v)}
          badge={selectedPair && <span className="badge badge-xs badge-primary">{selectedPair}</span>}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-base-content/55">
                Run quick backtests across a candidate list, then click a pair to copy it into the launch universe.
              </p>
              <label className="form-control">
                <span className="label label-text text-xs font-medium">Pairs to Screen</span>
                <textarea
                  className="textarea textarea-bordered textarea-sm font-mono text-xs leading-relaxed"
                  rows={4}
                  value={screenPairs}
                  onChange={(e) => setScreenPairs(e.target.value)}
                  disabled={isScreening}
                />
              </label>
              <button
                type="button"
                className="btn btn-sm btn-outline w-full gap-2"
                onClick={() => handleScreenPairs(form)}
                disabled={isScreening || !form.strategy || !screenPairs.trim()}
                title={!form.strategy ? "Select a strategy first" : ""}
              >
                {isScreening && <span className="loading loading-spinner loading-xs" />}
                Screen Pairs
              </button>
            </div>
            <div className="min-h-36">
              {screenError && (
                <div className="mb-2 rounded border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
                  {screenError}
                </div>
              )}
              <ScreeningResultsTable rows={screenResults} selectedPair={selectedPair} onSelect={selectScreenedPair} />
              {screenResults.length === 0 && !isScreening && !screenError && (
                <div className="flex h-full min-h-36 items-center justify-center rounded-lg border border-dashed border-base-300 bg-base-100/60 px-4 text-center text-xs text-base-content/35">
                  Screening results appear here after the run completes.
                </div>
              )}
            </div>
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section
            title="Hyperopt Settings"
            eyebrow="Search"
            icon={BoltIcon}
            open={showHyperopt}
            onToggle={() => setShowHyperopt((v) => !v)}
            badge={<span className="badge badge-xs badge-ghost">{form.hyperopt_epochs} epochs</span>}
            defaultDense
          >
            <label className="form-control">
              <span className="label label-text text-xs font-medium">Loss Function</span>
              <select
                className="select select-bordered select-sm"
                value={form.hyperopt_loss}
                onChange={(e) => updateField("hyperopt_loss", e.target.value)}
              >
                <option value="ProfitLockinHyperOptLoss">ProfitLockinHyperOptLoss - locks in high-profit trades</option>
                <option value="SharpeHyperOptLoss">SharpeHyperOptLoss - stable returns, low risk</option>
                <option value="SortinoHyperOptLoss">SortinoHyperOptLoss - penalizes downside volatility only</option>
                <option value="CalmarHyperOptLoss">CalmarHyperOptLoss - return / max drawdown ratio</option>
                <option value="MaxDrawDownRelativeHyperOptLoss">MaxDrawDownRelativeHyperOptLoss - minimize drawdown first</option>
                <option value="OnlyProfitHyperOptLoss">OnlyProfitHyperOptLoss - maximize profit</option>
              </select>
            </label>
            <div>
              <span className="label label-text text-xs font-medium">Search Spaces</span>
              <div className="mb-3 flex flex-wrap gap-2">
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
                    {preset.label}
                    <span className="opacity-60">{preset.epochs} ep</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(SPACE_META).map(([space, meta]) => {
                  const active = form.hyperopt_spaces.includes(space);
                  return (
                    <button
                      key={space}
                      type="button"
                      onClick={() => toggleSpace(space)}
                      className={classNames(
                        "rounded-lg border px-3 py-2 text-left transition-all",
                        active ? "border-primary bg-primary/10" : "border-base-300 bg-base-200/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={classNames("font-mono text-xs font-semibold", active ? "text-primary" : "text-base-content/70")}>
                          {space}
                        </span>
                        <span className="text-[10px] text-base-content/40">{meta.costMultiplier}</span>
                      </div>
                      <p className="mt-1 text-[10px] leading-snug text-base-content/50">{meta.description}</p>
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
            <div className="rounded-md border border-base-300 bg-base-200 px-3 py-2 text-[10px] text-base-content/45">
              Active spaces: <span className="font-mono text-base-content/70">{searchSpaceLabel}</span>
            </div>
          </Section>

          <Section
            title="Risk Thresholds"
            eyebrow="Validation gates"
            icon={ShieldCheckIcon}
            open={showRisk}
            onToggle={() => setShowRisk((v) => !v)}
            badge={<span className="badge badge-xs badge-outline">independent</span>}
            defaultDense
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section
            title="Walk-Forward Optimization"
            eyebrow="Temporal robustness"
            icon={ClockIcon}
            open={showWfo}
            onToggle={() => setShowWfo((v) => !v)}
            badge={form.wfo_enabled && <span className="badge badge-primary badge-xs">ON</span>}
            defaultDense
          >
            <label className="flex cursor-pointer items-center gap-3 text-xs font-medium">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={form.wfo_enabled}
                onChange={(e) => updateField("wfo_enabled", e.target.checked)}
              />
              {form.wfo_enabled ? "Walk-Forward enabled" : "Walk-Forward disabled"}
            </label>
            {form.wfo_enabled && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ["wfo_is_months", "IS Window", 1, 24, 1, 3],
                  ["wfo_oos_months", "OOS Window", 1, 6, 1, 1],
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
              <div
                className={classNames(
                  "rounded border px-3 py-2 text-[10px]",
                  wfoSummary.isHealthy ? "border-success/25 bg-success/10 text-success" : "border-warning/25 bg-warning/10 text-warning"
                )}
              >
                {wfoSummary.isHealthy
                  ? `${wfoSummary.approxWindows} rolling windows from your IS range (${wfoSummary.totalMonths}m total)`
                  : `Too few windows (${wfoSummary.approxWindows}) - increase IS range or reduce window sizes. Need 2+ windows.`}
              </div>
            )}
          </Section>

          <Section
            title="Alpha Consensus Voting"
            eyebrow="Ensemble"
            icon={BeakerIcon}
            open={showEnsemble}
            onToggle={() => setShowEnsemble((v) => !v)}
            badge={form.ensemble_enabled && <span className="badge badge-secondary badge-xs">ON</span>}
            defaultDense
          >
            <label className="flex cursor-pointer items-center gap-3 text-xs font-medium">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-secondary"
                checked={form.ensemble_enabled}
                onChange={(e) => updateField("ensemble_enabled", e.target.checked)}
              />
              {form.ensemble_enabled ? "Alpha Consensus Voting enabled" : "Alpha Consensus Voting disabled"}
            </label>
            <p className="text-xs leading-relaxed text-base-content/55">
              When enabled, the generated strategy can use weighted signal consensus while the backend still owns validation.
            </p>
          </Section>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card border border-base-300 bg-base-200 xl:sticky xl:top-4">
          <div className="card-body p-4">
            <div className="flex items-center gap-2">
              <ChartBarIcon className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Run History</h2>
            </div>
            <p className="text-xs leading-relaxed text-base-content/50">
              Reconnect to running reviews, inspect completed exports, or load previous reports into the cockpit.
            </p>
            <RunHistoryDashboard ref={runHistoryRef} onLoad={onLoadRun} />
          </div>
        </div>
      </aside>
    </div>
  );
}
