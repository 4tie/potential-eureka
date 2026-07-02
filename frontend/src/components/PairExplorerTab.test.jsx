import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PairExplorerTab from "./PairExplorerTab";
import { LAST_USED_PAIR_PRESET_STORAGE_KEY } from "../features/pairExplorer/constants";

const strategies = [
  { strategy_name: "BackendStrategy", file: "backend.py" },
  { name: "FrontendStrategy", file: "frontend.py" },
];

function mockFetch({ availablePairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] } = {}) {
  globalThis.fetch = jest.fn(async (url, init) => {
    const text = String(url);
    if (text === "/api/pairs") {
      return {
        ok: true,
        json: async () => ({
          available_pairs: availablePairs,
          favorite_pairs: [],
          locked_pairs: [],
          max_open_trades: 2,
        }),
      };
    }
    if (text.startsWith("/api/pairs/search")) {
      return {
        ok: true,
        json: async () => ({ matches: ["BTC/USDT"] }),
      };
    }
    if (text === "/api/strategy/pair-explorer" && init?.method === "POST") {
      return {
        ok: true,
        json: async () => ({
          session_id: "session-1",
          status: "running",
          total: 1,
          groups: ["BTC/USDT + ETH/USDT"],
        }),
      };
    }
    if (text === "/api/strategy/pair-explorer") {
      return {
        ok: true,
        json: async () => ({
          sessions: [
            {
              session_id: "session-1",
              strategy_name: "BackendStrategy",
              status: "completed",
              total: 1,
              completed: 1,
              created_at: "2024-01-10T09:00:00Z",
              timeframe: "1h",
            },
          ],
        }),
      };
    }
    if (text === "/api/strategy/pair-explorer/session-1") {
      return {
        ok: true,
        json: async () => ({
          session_id: "session-1",
          status: "completed",
          total: 1,
          completed: 1,
          strategy_name: "BackendStrategy",
          timeframe: "1h",
          timerange: "20240101-20240201",
          results: [
            {
              group: "BTC/USDT + ETH/USDT",
              pairs: ["BTC/USDT", "ETH/USDT"],
              status: "completed",
              total_profit_pct: 8.5,
              win_rate: 60,
              sharpe_ratio: 1.2,
              max_drawdown: 5,
              total_trades: 12,
            },
          ],
        }),
      };
    }
    return { ok: true, json: async () => ({}) };
  });
}

describe("PairExplorerTab", () => {
  beforeEach(() => {
    jest.useRealTimers();
    globalThis.localStorage.clear();
    mockFetch();
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.localStorage.clear();
  });

  test("normalizes strategy options from strategy_name and name", async () => {
    render(<PairExplorerTab strategies={strategies} />);

    expect(await screen.findByRole("option", { name: "BackendStrategy" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "FrontendStrategy" })).toBeInTheDocument();
  });

  test("starts exploration with existing shared-state form values", async () => {
    render(
      <PairExplorerTab
        strategies={strategies}
        sharedState={{
          strategy_name: "BackendStrategy",
          timeframe: "1h",
          start_date: "2024-01-01",
          end_date: "2024-02-01",
          pairs: ["BTC/USDT", "ETH/USDT"],
          dry_run_wallet: 2500,
          max_open_trades: 2,
        }}
      />
    );

    const button = await screen.findByRole("button", { name: /run exploration/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => {
      const post = fetch.mock.calls.find(([url, init]) => url === "/api/strategy/pair-explorer" && init?.method === "POST");
      expect(post).toBeTruthy();
      expect(JSON.parse(post[1].body)).toEqual({
        strategy_name: "BackendStrategy",
        pairs: ["BTC/USDT", "ETH/USDT"],
        timeframe: "1h",
        timerange: "20240101-20240201",
        dry_run_wallet: 2500,
        max_open_trades: 2,
      });
      expect(JSON.parse(globalThis.localStorage.getItem(LAST_USED_PAIR_PRESET_STORAGE_KEY))).toMatchObject({
        pairs: ["BTC/USDT", "ETH/USDT"],
        maxTrades: 2,
      });
    });
  });

  test("configured 50-pair preset starts 13 groups of 4", async () => {
    const availablePairs = Array.from({ length: 52 }, (_, index) => `PAIR${String(index + 1).padStart(2, "0")}/USDT`);
    mockFetch({ availablePairs });
    render(
      <PairExplorerTab
        strategies={strategies}
        sharedState={{
          strategy_name: "BackendStrategy",
          timeframe: "1h",
          start_date: "2024-01-01",
          end_date: "2024-02-01",
        }}
      />
    );

    const presetSelect = await screen.findByRole("combobox", { name: /pair preset/i });
    expect(screen.getByRole("option", { name: "Configured 12 pairs - 12 pairs, 4 groups of 3" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Configured 24 pairs - 24 pairs, 6 groups of 4" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Configured 50 pairs - 50 pairs, 13 groups of 4" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All configured pairs - 52 pairs, 13 groups of 4" })).toBeInTheDocument();
    fireEvent.change(presetSelect, { target: { value: "configured-top-50" } });

    expect(await screen.findByText("50 pairs -> 13 groups of 4")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /run exploration/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => {
      const post = fetch.mock.calls.find(([url, init]) => url === "/api/strategy/pair-explorer" && init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(post[1].body);
      expect(body.pairs).toEqual(availablePairs.slice(0, 50));
      expect(body.max_open_trades).toBe(4);
    });
  });

  test("last used preset restores previous pairs and group size", async () => {
    globalThis.localStorage.setItem(
      LAST_USED_PAIR_PRESET_STORAGE_KEY,
      JSON.stringify({
        pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "ADA/USDT", "LINK/USDT"],
        maxTrades: 2,
        savedAt: "2024-01-10T10:00:00Z",
      })
    );
    render(
      <PairExplorerTab
        strategies={strategies}
        sharedState={{
          strategy_name: "BackendStrategy",
          timeframe: "1h",
          start_date: "2024-01-01",
          end_date: "2024-02-01",
        }}
      />
    );

    const presetSelect = await screen.findByRole("combobox", { name: /pair preset/i });
    expect(await screen.findByRole("option", { name: "Last used - 5 pairs, 3 groups of 2" })).toBeInTheDocument();
    fireEvent.change(presetSelect, { target: { value: "last-used" } });

    expect(await screen.findByText("5 pairs -> 3 groups of 2")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /run exploration/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => {
      const post = fetch.mock.calls.find(([url, init]) => url === "/api/strategy/pair-explorer" && init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(post[1].body);
      expect(body.pairs).toEqual(["BTC/USDT", "ETH/USDT", "SOL/USDT", "ADA/USDT", "LINK/USDT"]);
      expect(body.max_open_trades).toBe(2);
    });
  });

  test("loads a completed session and applies selected pairs to shared state", async () => {
    const syncSharedState = jest.fn();
    render(<PairExplorerTab strategies={strategies} syncSharedState={syncSharedState} />);

    fireEvent.click(await screen.findByText(/Past Runs/));
    fireEvent.click(await screen.findByRole("button", { name: /load backendstrategy run/i }));

    expect(await screen.findByText("BTC/USDT")).toBeInTheDocument();
    fireEvent.click(screen.getByText("BTC/USDT"));
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    expect(syncSharedState).toHaveBeenCalledWith({ pairs: ["BTC/USDT", "ETH/USDT"] });
  });
});
