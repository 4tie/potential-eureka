import { renderHook, act } from "@testing-library/react";
import useAutoQuantScreening from "./useAutoQuantScreening";

// Mock the API function
jest.mock("../api", () => ({
  screenPairs: jest.fn(() => Promise.resolve({
    results: [
      { pair: "BTC/USDT", profit: 10.5, sharpe: 1.2 },
      { pair: "ETH/USDT", profit: 8.3, sharpe: 0.9 },
    ],
  })),
}));

describe("useAutoQuantScreening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("initializes with default screening state", () => {
    const { result } = renderHook(() => useAutoQuantScreening());

    expect(result.current.showScreener).toBe(false);
    expect(result.current.screenPairs).toBe("BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,ADA/USDT");
    expect(result.current.screening).toBe(false);
    expect(result.current.screenResults).toEqual([]);
    expect(result.current.screenError).toBe(null);
    expect(result.current.selectedPair).toBe(null);
  });

  test("handleScreenPairs screens pairs successfully", async () => {
    const { screenPairs } = await import("../api");
    screenPairs.mockResolvedValueOnce({
      results: [
        { pair: "BTC/USDT", profit: 10.5, sharpe: 1.2 },
        { pair: "ETH/USDT", profit: 8.3, sharpe: 0.9 },
      ],
    });

    const { result } = renderHook(() => useAutoQuantScreening());

    const form = {
      strategy: "TestStrategy",
      timeframe: "1h",
      in_sample_range: "20230101-20240101",
      exchange: "binance",
    };

    await act(async () => {
      await result.current.handleScreenPairs(form);
    });

    expect(result.current.screening).toBe(false);
    expect(result.current.screenResults).toHaveLength(2);
    expect(result.current.screenResults[0].pair).toBe("BTC/USDT");
    expect(screenPairs).toHaveBeenCalledWith({
      strategy: "TestStrategy",
      timeframe: "1h",
      date_range: "20230101-20240101",
      pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "ADA/USDT"],
      exchange: "binance",
      config_file: null,
    });
  });

  test("handleScreenPairs does nothing if strategy is missing", async () => {
    const { screenPairs } = await import("../api");

    const { result } = renderHook(() => useAutoQuantScreening());

    const form = {
      strategy: "",
      timeframe: "1h",
      in_sample_range: "20230101-20240101",
      exchange: "binance",
    };

    await act(async () => {
      await result.current.handleScreenPairs(form);
    });

    expect(screenPairs).not.toHaveBeenCalled();
    expect(result.current.screening).toBe(false);
  });

  test("handleScreenPairs does nothing if screenPairs is empty", async () => {
    const { screenPairs } = await import("../api");

    const { result } = renderHook(() => useAutoQuantScreening());

    act(() => {
      result.current.setScreenPairs("");
    });

    const form = {
      strategy: "TestStrategy",
      timeframe: "1h",
      in_sample_range: "20230101-20240101",
      exchange: "binance",
    };

    await act(async () => {
      await result.current.handleScreenPairs(form);
    });

    expect(screenPairs).not.toHaveBeenCalled();
    expect(result.current.screening).toBe(false);
  });

  test("handleScreenPairs handles API errors", async () => {
    const { screenPairs } = await import("../api");
    screenPairs.mockRejectedValueOnce(new Error("API error"));

    const { result } = renderHook(() => useAutoQuantScreening());

    const form = {
      strategy: "TestStrategy",
      timeframe: "1h",
      in_sample_range: "20230101-20240101",
      exchange: "binance",
    };

    await act(async () => {
      await result.current.handleScreenPairs(form);
    });

    expect(result.current.screening).toBe(false);
    expect(result.current.screenError).toBe("API error");
    expect(result.current.screenResults).toEqual([]);
  });

  test("handleScreenPairs handles partial errors in results", async () => {
    const { screenPairs } = await import("../api");
    screenPairs.mockResolvedValueOnce({
      results: [
        { pair: "BTC/USDT", profit: 10.5, sharpe: 1.2 },
      ],
      errors: ["ETH/USDT: insufficient data", "SOL/USDT: no trades"],
    });

    const { result } = renderHook(() => useAutoQuantScreening());

    const form = {
      strategy: "TestStrategy",
      timeframe: "1h",
      in_sample_range: "20230101-20240101",
      exchange: "binance",
    };

    await act(async () => {
      await result.current.handleScreenPairs(form);
    });

    expect(result.current.screenResults).toHaveLength(1);
    expect(result.current.screenError).toBe("2 pair(s) had errors: ETH/USDT: insufficient data; SOL/USDT: no trades");
  });

  test("setScreenPairs updates the pairs string", () => {
    const { result } = renderHook(() => useAutoQuantScreening());

    act(() => {
      result.current.setScreenPairs("BTC/USDT,ETH/USDT");
    });

    expect(result.current.screenPairs).toBe("BTC/USDT,ETH/USDT");
  });

  test("setShowScreener toggles screener visibility", () => {
    const { result } = renderHook(() => useAutoQuantScreening());

    act(() => {
      result.current.setShowScreener(true);
    });

    expect(result.current.showScreener).toBe(true);
  });

  test("setSelectedPair updates the selected pair", () => {
    const { result } = renderHook(() => useAutoQuantScreening());

    act(() => {
      result.current.setSelectedPair("BTC/USDT");
    });

    expect(result.current.selectedPair).toBe("BTC/USDT");
  });

  test("parses pairs with newlines and commas", async () => {
    const { screenPairs } = await import("../api");
    screenPairs.mockResolvedValueOnce({ results: [] });

    const { result } = renderHook(() => useAutoQuantScreening());

    act(() => {
      result.current.setScreenPairs("BTC/USDT\nETH/USDT,SOL/USDT");
    });

    const form = {
      strategy: "TestStrategy",
      timeframe: "1h",
      in_sample_range: "20230101-20240101",
      exchange: "binance",
    };

    await act(async () => {
      await result.current.handleScreenPairs(form);
    });

    expect(screenPairs).toHaveBeenCalledWith(
      expect.objectContaining({
        pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
      })
    );
  });

  test("filters empty pair strings", async () => {
    const { screenPairs } = await import("../api");
    screenPairs.mockResolvedValueOnce({ results: [] });

    const { result } = renderHook(() => useAutoQuantScreening());

    act(() => {
      result.current.setScreenPairs("BTC/USDT,,ETH/USDT, ,SOL/USDT");
    });

    const form = {
      strategy: "TestStrategy",
      timeframe: "1h",
      in_sample_range: "20230101-20240101",
      exchange: "binance",
    };

    await act(async () => {
      await result.current.handleScreenPairs(form);
    });

    expect(screenPairs).toHaveBeenCalledWith(
      expect.objectContaining({
        pairs: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
      })
    );
  });
});
