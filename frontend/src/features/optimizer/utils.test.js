import {
  autoSafeSpaces,
  buildOptimizerRunPayload,
  gridEstimate,
  parsePairs,
} from "./utils";
import { fmtDate, toTimerange } from "./formatters";
import { buildOptimizerViewModel, optimizerRunDisabledReason } from "./viewModel";

describe("optimizer utilities", () => {
  test("parsePairs accepts comma and whitespace separated pairs", () => {
    expect(parsePairs("BTC/USDT, ETH/USDT\nSOL/USDT")).toEqual([
      "BTC/USDT",
      "ETH/USDT",
      "SOL/USDT",
    ]);
  });

  test("autoSafeSpaces enables only safe optimizable buy/sell spaces up to the cap", () => {
    const spaces = [
      { name: "buy_a", space: "buy", optimizable: true },
      { name: "sell_a", space: "sell", optimizable: true },
      { name: "roi__0", space: "roi", optimizable: true },
      { name: "buy_fixed", space: "buy", optimizable: false },
      { name: "stoploss__value", space: "stoploss", optimizable: true },
    ];

    const byName = Object.fromEntries(autoSafeSpaces(spaces).map((space) => [space.name, space]));

    expect(byName.buy_a.enabled).toBe(true);
    expect(byName.sell_a.enabled).toBe(true);
    expect(byName.roi__0.enabled).toBe(false);
    expect(byName.buy_fixed.enabled).toBe(false);
    expect(byName.stoploss__value.enabled).toBe(false);
  });

  test("gridEstimate multiplies enabled discrete choices", () => {
    expect(gridEstimate([
      { enabled: true, param_type: "int", min_value: 1, max_value: 3, step: 1 },
      { enabled: true, param_type: "categorical", choices: ["a", "b"] },
      { enabled: false, param_type: "boolean", choices: [true, false] },
    ])).toBe(6);
  });

  test("buildOptimizerRunPayload preserves backend field names", () => {
    const payload = buildOptimizerRunPayload({
      strategyName: "DemoStrategy",
      dateStart: "2024-01-01",
      dateEnd: "2024-12-31",
      timeframe: "1h",
      pairList: ["BTC/USDT"],
      totalTrials: 50,
      searchStrategy: "random",
      parameterMode: "auto_safe",
      scoreMetric: "composite",
      maxOpenTrades: 3,
      wallet: 1000,
      enableVectorbtScreening: false,
      vectorbtCandidateCount: 250,
      vectorbtKeepRatio: 0.25,
      vectorbtTimeoutSeconds: 45,
      searchSpaces: [{ name: "buy_a" }],
    });

    expect(payload).toMatchObject({
      strategy_name: "DemoStrategy",
      timerange: "20240101-20241231",
      timeframe: "1h",
      pairs: ["BTC/USDT"],
      total_trials: 50,
      search_strategy: "random",
      parameter_mode: "auto_safe",
      score_metric: "composite",
      max_open_trades: 3,
      dry_run_wallet: 1000,
      fee_rate: 0.001,
      enable_vectorbt_screening: false,
      vectorbt_candidate_count: 250,
      vectorbt_keep_ratio: 0.25,
      vectorbt_timeout_seconds: 45,
      search_spaces: [{ name: "buy_a" }],
    });
  });

  test("date formatters produce API timeranges", () => {
    expect(fmtDate(new Date("2024-02-03T00:00:00Z"))).toBe("2024-02-03");
    expect(toTimerange("2024-02-03", "2024-03-04")).toBe("20240203-20240304");
  });

  test("buildOptimizerViewModel derives progress, best trial, and chart data", () => {
    const session = {
      phase: "completed",
      total_trials: 3,
      completed_trials: 2,
      failed_trials: 1,
      best_trial_number: 2,
      trials: [
        { trial_number: 1, status: "completed", metrics: { score: 4, net_profit_pct: -1, max_drawdown_pct: -3 } },
        { trial_number: 2, status: "completed", metrics: { score: 8, net_profit_pct: 6, max_drawdown_pct: -2 } },
        { trial_number: 3, status: "failed" },
      ],
    };

    const vm = buildOptimizerViewModel({ session, apiStatus: null, totalTrials: 10 });

    expect(vm.progressPct).toBe(100);
    expect(vm.bestTrial.trial_number).toBe(2);
    expect(vm.topFiveTrials.map((trial) => trial.trial_number)).toEqual([2, 1]);
    expect(vm.profitData).toEqual([{ trial: 1, profit: -1 }, { trial: 2, profit: 6 }]);
    expect(vm.drawdownData).toEqual([{ trial: 1, drawdown: 3 }, { trial: 2, drawdown: 2 }]);
    expect(vm.isTerminal).toBe(true);
  });

  test("optimizerRunDisabledReason validates workflow requirements", () => {
    const base = {
      strategyName: "DemoStrategy",
      dateStart: "2024-01-01",
      dateEnd: "2024-01-31",
      validDateRange: true,
      pairList: ["BTC/USDT"],
      enabledSpaces: [{ name: "buy_window" }],
      isRunning: false,
    };

    expect(optimizerRunDisabledReason(base)).toBeNull();
    expect(optimizerRunDisabledReason({ ...base, pairList: [] })).toBe("Add at least one trading pair.");
    expect(optimizerRunDisabledReason({ ...base, enabledSpaces: [] })).toBe("Enable at least one optimizable parameter.");
    expect(optimizerRunDisabledReason({ ...base, validDateRange: false })).toBe("Start date must be before or equal to end date.");
    expect(optimizerRunDisabledReason({ ...base, isRunning: true })).toBe("Optimizer is already running.");
  });
});
