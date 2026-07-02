import {
  datePreset,
  fmtRelTime,
  fromTimerangeDate,
  toTimerange,
} from "./formatters";
import {
  normalizePairExplorerSession,
} from "./api";
import {
  buildStartPayload,
  normalizeStrategies,
  sortResults,
} from "./utils";

describe("pairExplorer helpers", () => {
  test("normalizes strategy objects from backend and frontend shapes", () => {
    expect(
      normalizeStrategies([
        { strategy_name: "BackendStrategy", file: "backend.py" },
        { name: "FrontendStrategy", file: "frontend.py" },
        { strategy_name: "BackendStrategy", file: "dupe.py" },
        { strategy_name: "", name: "" },
      ])
    ).toEqual([
      { strategy_name: "BackendStrategy", file: "backend.py", name: "BackendStrategy" },
      { name: "FrontendStrategy", file: "frontend.py", strategy_name: "FrontendStrategy" },
    ]);
  });

  test("formats timeranges and relative timestamps deterministically", () => {
    expect(toTimerange("2024-01-02", "2024-03-04")).toBe("20240102-20240304");
    expect(fromTimerangeDate("20240102")).toBe("2024-01-02");
    expect(datePreset(1, new Date("2024-01-10T00:00:00Z"))).toEqual({
      start: "2024-01-09",
      end: "2024-01-10",
    });
    expect(fmtRelTime("2024-01-10T09:30:00Z", new Date("2024-01-10T10:00:00Z").getTime())).toBe("30m ago");
  });

  test("sorts results by requested metric and direction", () => {
    const rows = [
      { pair: "ETH/USDT", total_profit_pct: 4, win_rate: 50 },
      { pair: "BTC/USDT", total_profit_pct: 8, win_rate: 40 },
      { pair: "SOL/USDT", total_profit_pct: -1, win_rate: 70 },
    ];

    expect(sortResults(rows, "total_profit_pct", "desc").map((row) => row.pair)).toEqual([
      "BTC/USDT",
      "ETH/USDT",
      "SOL/USDT",
    ]);
    expect(sortResults(rows, "win_rate", "asc").map((row) => row.pair)).toEqual([
      "BTC/USDT",
      "ETH/USDT",
      "SOL/USDT",
    ]);
  });

  test("builds the start payload without changing backend wire shape", () => {
    expect(
      buildStartPayload({
        strategyName: "DemoStrategy",
        pairs: ["BTC/USDT", "ETH/USDT"],
        timeframe: "1h",
        dateStart: "2024-01-01",
        dateEnd: "2024-02-01",
        wallet: "2500",
        maxTrades: "2",
      })
    ).toEqual({
      strategy_name: "DemoStrategy",
      pairs: ["BTC/USDT", "ETH/USDT"],
      timeframe: "1h",
      timerange: "20240101-20240201",
      dry_run_wallet: 2500,
      max_open_trades: 2,
    });
  });

  test("normalizes session results from object maps", () => {
    expect(
      normalizePairExplorerSession({
        session_id: "session-1",
        results: {
          "BTC/USDT": { group: "BTC/USDT", status: "completed" },
          "ETH/USDT": { group: "ETH/USDT", status: "failed" },
        },
      }).results
    ).toEqual([
      { group: "BTC/USDT", status: "completed" },
      { group: "ETH/USDT", status: "failed" },
    ]);
  });
});
