/* global describe, expect, jest, test, beforeEach, afterEach */
import { renderHook, act, waitFor } from "@testing-library/react";
import useAutoQuantForm from "./hooks/useAutoQuantForm";
import useAutoQuantUI from "./hooks/useAutoQuantUI";
import useAutoQuantScreening from "./hooks/useAutoQuantScreening";
import useAutoQuantStrategyGen from "./hooks/useAutoQuantStrategyGen";
import useAutoQuantPipeline from "./hooks/useAutoQuantPipeline";

// Mock the API
jest.mock("./api", () => ({
  loadAutoQuantOptions: jest.fn(() => Promise.resolve({ timeframe: "1h" })),
  saveAutoQuantOptions: jest.fn(() => Promise.resolve()),
  loadTimeframeThresholds: jest.fn(() => Promise.resolve({
    min_oos_profit: 0.05,
    max_drawdown_threshold: 25,
  })),
  generateTemplate: jest.fn(() => Promise.resolve({ strategy_name: "TestStrategy_1h" })),
  screenPairs: jest.fn(() => Promise.resolve({ results: [] })),
}));

jest.mock("./utils", () => ({
  normalizeStrategies: jest.fn((strategies) => strategies),
  playChime: jest.fn(),
}));

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: {
    autoquant: {
      startRun: jest.fn(() => Promise.resolve({ run_id: "run-1" })),
      getStatus: jest.fn(() => Promise.resolve({ run_id: "run-1", status: "running", stages: [] })),
      getReport: jest.fn(() => Promise.resolve({ run_id: "run-1" })),
      resumeRun: jest.fn(() => Promise.resolve({ run_id: "run-1", status: "running" })),
      cancelRun: jest.fn(() => Promise.resolve({ ok: true })),
      connectWebSocket: jest.fn(() => ({
        close: jest.fn(),
      })),
    },
  },
}));

describe("AutoQuant Hooks Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("useAutoQuantForm and useAutoQuantUI work together", async () => {
    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: uiResult } = renderHook(() => useAutoQuantUI());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    // Both hooks should initialize independently
    expect(formResult.current.form).toBeDefined();
    expect(formResult.current.showAdvanced).toBe(false); // showAdvanced is in form hook
    expect(uiResult.current.notifEnabled).toBe(false);
  });

  test("useAutoQuantForm and useAutoQuantScreening share form data", async () => {
    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: screeningResult } = renderHook(() => useAutoQuantScreening());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    // Form hook provides the form data
    const form = formResult.current.form;
    expect(form).toBeDefined();

    // Screening hook has its own independent state
    expect(screeningResult.current.screenPairs).toBeDefined();
  });

  test("useAutoQuantForm and useAutoQuantStrategyGen integrate for strategy selection", async () => {
    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: genResult } = renderHook(() => useAutoQuantStrategyGen());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    // Generate a strategy
    const { generateTemplate } = await import("./api");
    generateTemplate.mockResolvedValueOnce({
      strategy_name: "GeneratedStrategy_5m",
    });

    act(() => {
      genResult.current.setTemplateType("omni");
    });

    const form = formResult.current.form;
    const updateField = jest.fn();

    await act(async () => {
      await genResult.current.handleGenerateTemplate(form, updateField);
    });

    expect(updateField).toHaveBeenCalledWith("strategy", "GeneratedStrategy_5m");
  });

  test("multiple hooks can be used in the same component", async () => {
    function TestComponent() {
      const form = useAutoQuantForm();
      const ui = useAutoQuantUI();
      const screening = useAutoQuantScreening();
      const gen = useAutoQuantStrategyGen();

      return {
        form,
        ui,
        screening,
        gen,
      };
    }

    const { result } = renderHook(() => TestComponent());

    await waitFor(() => {
      expect(result.current.form.optionsLoaded).toBe(true);
    });

    // All hooks should work together
    expect(result.current.form.form).toBeDefined();
    expect(result.current.form.showAdvanced).toBe(false); // showAdvanced is in form hook
    expect(result.current.ui.showHyperopt).toBe(false); // UI hook has showHyperopt
    expect(result.current.screening.screenPairs).toBeDefined();
    expect(result.current.gen.strategyList).toBeDefined();
  });

  test("hooks handle concurrent state updates", async () => {
    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: uiResult } = renderHook(() => useAutoQuantUI());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    // Update multiple hooks concurrently
    act(() => {
      formResult.current.updateField("timeframe", "5m");
      formResult.current.setShowAdvanced(true); // showAdvanced is in form hook
      uiResult.current.toggleNotif();
    });

    expect(formResult.current.form.timeframe).toBe("5m");
    expect(formResult.current.showAdvanced).toBe(true);
    expect(uiResult.current.notifEnabled).toBe(true);
  });

  test("hooks maintain independent state", async () => {
    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: uiResult } = renderHook(() => useAutoQuantUI());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    // Update form hook
    act(() => {
      formResult.current.updateField("strategy", "TestStrategy");
    });

    // UI hook should not be affected
    expect(formResult.current.showAdvanced).toBe(false); // showAdvanced is in form hook
    expect(uiResult.current.logFilter).toBe("");

    // Update UI hook
    act(() => {
      uiResult.current.setShowHyperopt(true); // UI hook has showHyperopt
    });

    // Form hook should not be affected
    expect(formResult.current.form.strategy).toBe("TestStrategy");
  });

  test("hooks share API integration layer", async () => {
    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: genResult } = renderHook(() => useAutoQuantStrategyGen());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    const { loadAutoQuantOptions, generateTemplate } = await import("./api");

    // Both hooks should use the same API layer
    expect(loadAutoQuantOptions).toHaveBeenCalled();

    act(() => {
      genResult.current.setTemplateType("adaptive");
    });

    const form = formResult.current.form;
    const updateField = jest.fn();

    await act(async () => {
      await genResult.current.handleGenerateTemplate(form, updateField);
    });

    expect(generateTemplate).toHaveBeenCalled();
  });

  test("hooks handle errors independently", async () => {
    const { loadAutoQuantOptions } = await import("./api");
    loadAutoQuantOptions.mockRejectedValueOnce(new Error("Load failed"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: uiResult } = renderHook(() => useAutoQuantUI());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    // Form hook should handle error
    expect(consoleSpy).toHaveBeenCalledWith("Failed to load saved options:", expect.any(Error));

    // UI hook should not be affected
    expect(formResult.current.showAdvanced).toBe(false); // showAdvanced is in form hook
    expect(uiResult.current.showHyperopt).toBe(false); // UI hook has showHyperopt

    consoleSpy.mockRestore();
  });

  test("useAutoQuantPipeline exposes failed start errors", async () => {
    const api = (await import("../../services/api")).default;
    api.autoquant.startRun.mockRejectedValueOnce(new Error("Backend unavailable"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    const { result } = renderHook(() => useAutoQuantPipeline());

    await act(async () => {
      await expect(result.current.startPipeline({ strategy: "TestStrategy" })).rejects.toThrow("Backend unavailable");
    });

    expect(result.current.pipelineError).toMatch("Failed to start AutoQuant");
    expect(result.current.pipelineError).toMatch("Backend unavailable");
    consoleSpy.mockRestore();
  });

  test("hooks integrate with localStorage independently", () => {
    // Clear localStorage before test
    localStorage.clear();
    
    const { result: uiResult } = renderHook(() => useAutoQuantUI());

    // UI hook uses localStorage for notifications
    act(() => {
      uiResult.current.toggleNotif();
    });

    expect(localStorage.getItem("aq_notif_enabled")).toBe("true");
    expect(uiResult.current.notifEnabled).toBe(true);
  });

  test("debounced save in form hook does not affect other hooks", async () => {
    const { saveAutoQuantOptions } = await import("./api");
    const { result: formResult } = renderHook(() => useAutoQuantForm());
    const { result: uiResult } = renderHook(() => useAutoQuantUI());

    await waitFor(() => {
      expect(formResult.current.optionsLoaded).toBe(true);
    });

    act(() => {
      formResult.current.updateField("timeframe", "5m");
      formResult.current.setShowAdvanced(true); // showAdvanced is in form hook
      uiResult.current.setShowHyperopt(true); // UI hook has showHyperopt
    });

    // Fast-forward past debounce delay
    jest.advanceTimersByTime(600);

    await act(async () => {
      await Promise.resolve();
    });

    expect(saveAutoQuantOptions).toHaveBeenCalled();
    expect(formResult.current.showAdvanced).toBe(true);
    expect(uiResult.current.showHyperopt).toBe(true);
  });
});
