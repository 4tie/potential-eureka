/* global describe, expect, jest, test, beforeEach, global */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AutoQuantTab from "./AutoQuantTab";

// Mock the API
jest.mock("../services/api", () => ({
  default: {
    autoquant: {
      loadOptions: jest.fn(() => Promise.resolve({ timeframe: "1h" })),
      saveOptions: jest.fn(() => Promise.resolve()),
      loadTimeframeThresholds: jest.fn(() => Promise.resolve({
        min_oos_profit: 0.05,
        max_drawdown_threshold: 25,
      })),
      generateTemplate: jest.fn(() => Promise.resolve({ strategy_name: "TestStrategy_1h" })),
      screenPairs: jest.fn(() => Promise.resolve({ results: [] })),
      startPipeline: jest.fn(() => Promise.resolve({ run_id: "test-run-1" })),
      cancelRun: jest.fn(() => Promise.resolve()),
      getStatus: jest.fn(() => Promise.resolve({ status: "completed" })),
      getReport: jest.fn(() => Promise.resolve({ profit: 100 })),
      listRuns: jest.fn(() => Promise.resolve({ runs: [] })),
      connectWebSocket: jest.fn(() => ({
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        close: jest.fn(),
      })),
    },
  },
}));

// Mock the WebSocket
global.WebSocket = class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    setTimeout(() => this.onopen?.(), 0);
  }
  close() {}
  send() {}
};

describe("AutoQuantTab Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test("renders AutoQuantTab with all tabs visible", () => {
    render(<AutoQuantTab />);

    // Check that main tabs are rendered
    expect(screen.getByText(/AutoQuant/i)).toBeInTheDocument();
  });

  test("initializes form with default values", async () => {
    render(<AutoQuantTab />);

    await waitFor(() => {
      // Check that form elements are present
      const timeframeSelect = screen.queryByLabelText(/timeframe/i);
      expect(timeframeSelect).toBeInTheDocument();
    });
  });

  test("integrates useAutoQuantForm hook for form management", async () => {
    render(<AutoQuantTab />);

    await waitFor(async () => {
      // The hook should load options on mount
      const api = (await import("../services/api")).default;
      expect(api.autoquant.loadOptions).toHaveBeenCalled();
    });
  });

  test("integrates useAutoQuantUI hook for UI state", () => {
    render(<AutoQuantTab />);

    // Check that UI elements are present
    const advancedToggle = screen.queryByText(/advanced/i);
    expect(advancedToggle).toBeInTheDocument();
  });

  test("integrates useAutoQuantScreening hook for pair screening", async () => {
    render(<AutoQuantTab />);

    // Check that screening elements are present
    const screenerButton = screen.queryByText(/screen/i);
    expect(screenerButton).toBeInTheDocument();
  });

  test("integrates useAutoQuantStrategyGen hook for strategy generation", async () => {
    render(<AutoQuantTab />);

    // Check that strategy generation elements are present
    const generateButton = screen.queryByText(/generate/i);
    expect(generateButton).toBeInTheDocument();
  });

  test("integrates useAutoQuantPipeline hook for pipeline management", async () => {
    render(<AutoQuantTab />);

    // Check that pipeline elements are present
    const startButton = screen.queryByText(/start/i);
    expect(startButton).toBeInTheDocument();
  });

  test("form changes trigger debounced save", async () => {
    const api = (await import("../services/api")).default;
    jest.useFakeTimers();

    render(<AutoQuantTab />);

    await waitFor(() => {
      expect(api.autoquant.loadOptions).toHaveBeenCalled();
    });

    // Trigger a form change
    const timeframeSelect = screen.queryByLabelText(/timeframe/i);
    if (timeframeSelect) {
      // Simulate change
      fireEvent.change(timeframeSelect, { target: { value: "5m" } });
    }

    // Fast-forward past debounce delay
    jest.advanceTimersByTime(600);

    await waitFor(() => {
      expect(api.autoquant.saveOptions).toHaveBeenCalled();
    });

    jest.useRealTimers();
  });

  test("strategy generation integrates with form state", async () => {
    const api = (await import("../services/api")).default;
    api.autoquant.generateTemplate.mockResolvedValueOnce({
      strategy_name: "GeneratedStrategy_5m",
    });

    render(<AutoQuantTab />);

    await waitFor(() => {
      expect(api.autoquant.loadOptions).toHaveBeenCalled();
    });

    // Find and click generate button
    const generateButton = screen.queryByText(/generate/i);
    if (generateButton) {
      fireEvent.click(generateButton);
    }

    await waitFor(() => {
      expect(api.autoquant.generateTemplate).toHaveBeenCalled();
    });
  });

  test("pipeline start integrates with form and strategy selection", async () => {
    const api = (await import("../services/api")).default;
    api.autoquant.startPipeline.mockResolvedValueOnce({ run_id: "test-run-1" });

    render(<AutoQuantTab />);

    await waitFor(() => {
      expect(api.autoquant.loadOptions).toHaveBeenCalled();
    });

    // Find and click start button
    const startButton = screen.queryByText(/start/i);
    if (startButton) {
      fireEvent.click(startButton);
    }

    await waitFor(() => {
      expect(api.autoquant.startPipeline).toHaveBeenCalled();
    });
  });

  test("components render with correct data flow from hooks", async () => {
    render(<AutoQuantTab />);

    await waitFor(() => {
      // Check that extracted components are present
      const metricCards = screen.queryAllByTestId(/metric/i);
      expect(metricCards.length).toBeGreaterThan(0);
    });
  });

  test("error handling integrates across hooks", async () => {
    const api = (await import("../services/api")).default;
    api.autoquant.loadOptions.mockRejectedValueOnce(new Error("Load failed"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    render(<AutoQuantTab />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load saved options:",
        expect.any(Error)
      );
    });

    consoleSpy.mockRestore();
  });
});
