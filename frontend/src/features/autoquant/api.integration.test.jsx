/* global describe, expect, jest, test, beforeEach */
import api from "../../services/api";

// Mock fetch for API calls
globalThis.fetch = jest.fn();
globalThis.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
  }
};

describe("AutoQuant API Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
  });

  test("loadOptions calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ timeframe: "1h", risk_profile: "balanced" }),
    });

    await api.autoquant.loadOptions();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auto-quant/options")
    );
  });

  test("saveOptions calls correct endpoint with data", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const options = { timeframe: "5m", risk_profile: "aggressive" };
    await api.autoquant.saveOptions(options);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auto-quant/options"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(options),
      })
    );
  });

  test("generateTemplate calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ strategy_name: "TestStrategy_5m" }),
    });

    const payload = {
      strategy_name: "OmniFactory",
      timeframe: "5m",
      omni: true,
    };
    await api.autoquant.generateTemplate(payload);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auto-quant/generate-template"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  test("screenPairs calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { pair: "BTC/USDT", profit: 10.5 },
          { pair: "ETH/USDT", profit: 8.3 },
        ],
      }),
    });

    const payload = {
      strategy: "TestStrategy",
      timeframe: "1h",
      pairs: ["BTC/USDT", "ETH/USDT"],
      exchange: "binance",
    };
    await api.autoquant.screenPairs(payload);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auto-quant/screen-pairs"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  test("startRun calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ run_id: "test-run-1" }),
    });

    const payload = { strategy: "TestStrategy" };
    await api.autoquant.startRun(payload);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auto-quant/start"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  test("cancelRun calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const runId = "test-run-1";
    await api.autoquant.cancelRun(runId);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/auto-quant/cancel/${runId}`),
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  test("resumeRun calls correct endpoint with approved pairs", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "running" }),
    });

    const runId = "test-run-1";
    const approvedPairs = ["BTC/USDT", "ETH/USDT"];
    await api.autoquant.resumeRun(runId, approvedPairs);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/auto-quant/resume/${runId}`),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ approved_pairs: approvedPairs }),
      })
    );
  });

  test("getStatus calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: "running", progress: 50 }),
    });

    const runId = "test-run-1";
    await api.autoquant.getStatus(runId);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/auto-quant/status/${runId}`)
    );
  });

  test("getReport calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ profit: 100, sharpe: 1.5 }),
    });

    const runId = "test-run-1";
    await api.autoquant.getReport(runId);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/auto-quant/report/${runId}`)
    );
  });

  test("listRuns calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        runs: [
          { run_id: "run-1", status: "completed" },
          { run_id: "run-2", status: "running" },
        ],
      }),
    });

    await api.autoquant.listRuns();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auto-quant/runs")
    );
  });

  test("connectWebSocket returns WebSocket with correct URL", () => {
    const runId = "test-run-1";
    const ws = api.autoquant.connectWebSocket(runId);

    expect(ws.url).toContain(runId);
    expect(ws.url).toContain("ws");
  });

  test("API handles JSON response parsing", async () => {
    const mockData = { timeframe: "4h", risk_profile: "conservative" };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await api.autoquant.loadOptions();

    expect(result).toEqual(mockData);
  });

  test("API handles network errors", async () => {
    fetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(api.autoquant.loadOptions()).rejects.toThrow("Network error");
  });

  test("API handles HTTP errors", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(api.autoquant.loadOptions()).rejects.toThrow();
  });

  test("loadTimeframeThresholds calls correct endpoint", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        min_oos_profit: 0.08,
        max_drawdown_threshold: 20,
      }),
    });

    const timeframe = "15m";
    await api.autoquant.loadTimeframeThresholds(timeframe);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/auto-quant/timeframe-thresholds/${timeframe}`)
    );
  });
});
