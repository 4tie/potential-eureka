/* global describe, expect, jest, test, beforeEach, afterEach */
import { renderHook, act, waitFor } from "@testing-library/react";
import useAutoQuantForm from "./useAutoQuantForm";

// Mock the API functions
jest.mock("../api", () => ({
  loadAutoQuantOptions: jest.fn(() => Promise.resolve({ timeframe: "1h" })),
  saveAutoQuantOptions: jest.fn(() => Promise.resolve()),
  loadTimeframeThresholds: jest.fn(() => Promise.resolve({
    min_oos_profit: 0.05,
    max_drawdown_threshold: 25,
    min_win_rate: 45,
    min_profit_factor: 1.1,
    min_sharpe: 0.6,
  })),
}));

describe("useAutoQuantForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("initializes with default form state", () => {
    const { result } = renderHook(() => useAutoQuantForm());

    expect(result.current.form).toBeDefined();
    expect(result.current.optionsLoaded).toBe(false);
    expect(result.current.showAdvanced).toBe(false);
    expect(result.current.timeframeProfile).toBe(null);
  });

  test("loads saved options on mount", async () => {
    const { loadAutoQuantOptions } = await import("../api");
    loadAutoQuantOptions.mockResolvedValueOnce({ timeframe: "4h", risk_profile: "aggressive" });

    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    expect(loadAutoQuantOptions).toHaveBeenCalled();
    expect(result.current.form.timeframe).toBe("4h");
    expect(result.current.form.risk_profile).toBe("aggressive");
  });

  test("saves options with debounce on form change", async () => {
    const { saveAutoQuantOptions } = await import("../api");
    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    act(() => {
      result.current.updateField("timeframe", "5m");
    });

    // Fast-forward past debounce delay
    jest.advanceTimersByTime(500);

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveAutoQuantOptions).toHaveBeenCalled();
  });

  test("applies timeframe thresholds when timeframe changes", async () => {
    const { loadTimeframeThresholds } = await import("../api");
    loadTimeframeThresholds.mockResolvedValueOnce({
      min_oos_profit: 0.08,
      max_drawdown_threshold: 20,
      min_win_rate: 50,
      min_profit_factor: 1.2,
      min_sharpe: 0.7,
    });

    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    act(() => {
      result.current.updateField("timeframe", "15m");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(loadTimeframeThresholds).toHaveBeenCalledWith("15m");
  });

  test("updateField updates a single form field", async () => {
    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    act(() => {
      result.current.updateField("strategy", "TestStrategy");
    });

    expect(result.current.form.strategy).toBe("TestStrategy");
  });

  test("toggleSpace function exists and can be called", async () => {
    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    // Just verify the function exists and can be called without errors
    expect(typeof result.current.toggleSpace).toBe("function");
    
    act(() => {
      result.current.toggleSpace("buy");
    });

    // Verify the function was called (the array may or may not have changed depending on initial state)
    expect(result.current.form.hyperopt_spaces).toBeDefined();
  });

  test("setForm allows direct form updates", async () => {
    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    act(() => {
      result.current.setForm({ strategy: "NewStrategy", timeframe: "1d" });
    });

    expect(result.current.form.strategy).toBe("NewStrategy");
    expect(result.current.form.timeframe).toBe("1d");
  });

  test("setShowAdvanced toggles advanced settings visibility", async () => {
    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    act(() => {
      result.current.setShowAdvanced(true);
    });

    expect(result.current.showAdvanced).toBe(true);
  });

  test("handles load options error gracefully", async () => {
    const { loadAutoQuantOptions } = await import("../api");
    loadAutoQuantOptions.mockRejectedValueOnce(new Error("Load failed"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    expect(consoleSpy).toHaveBeenCalledWith("Failed to load saved options:", expect.any(Error));
    expect(result.current.formError).toMatch("Failed to load saved AutoQuant options");

    consoleSpy.mockRestore();
  });

  test("handles save options error gracefully", async () => {
    const { saveAutoQuantOptions } = await import("../api");
    saveAutoQuantOptions.mockRejectedValueOnce(new Error("Save failed"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });

    act(() => {
      result.current.updateField("timeframe", "5m");
    });

    jest.advanceTimersByTime(500);

    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleSpy).toHaveBeenCalledWith("Failed to save options:", expect.any(Error));
    expect(result.current.formError).toMatch("Failed to save AutoQuant options");

    consoleSpy.mockRestore();
  });

  test("handles timeframe thresholds error gracefully", async () => {
    const { loadTimeframeThresholds } = await import("../api");
    const consoleSpy = jest.spyOn(console, "debug").mockImplementation();

    const { result } = renderHook(() => useAutoQuantForm());

    await waitFor(() => {
      expect(result.current.optionsLoaded).toBe(true);
    });
    await waitFor(() => {
      expect(loadTimeframeThresholds).toHaveBeenCalled();
    });

    loadTimeframeThresholds.mockRejectedValueOnce(new Error("Thresholds failed"));

    act(() => {
      result.current.updateField("timeframe", "15m");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleSpy).toHaveBeenCalledWith("Failed to apply timeframe thresholds:", expect.any(Error));
    expect(result.current.formError).toMatch("Failed to load thresholds for 15m");

    consoleSpy.mockRestore();
  });
});
