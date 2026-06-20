/* global describe, expect, jest, test, beforeEach */
import { renderHook, act } from "@testing-library/react";
import { useAutoQuantState } from "./useAutoQuantState";

// Mock the API
jest.mock("../../../services/api", () => ({
  __esModule: true,
  default: {
    autoquant: {
      listRuns: jest.fn(() => Promise.resolve({ runs: [] })),
      getStatus: jest.fn(() => Promise.resolve({ run_id: "test-1", status: "completed" })),
      startRun: jest.fn(() => Promise.resolve({ run_id: "new-1" })),
      cancelRun: jest.fn(() => Promise.resolve()),
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

describe("useAutoQuantState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("initializes with default state", () => {
    const { result } = renderHook(() => useAutoQuantState());

    expect(result.current.runs).toEqual([]);
    expect(result.current.currentRun).toBe(null);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  test("loadRuns fetches and sets runs", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.listRuns.mockResolvedValueOnce({
      runs: [
        { run_id: "run-1", status: "completed" },
        { run_id: "run-2", status: "running" },
      ],
    });

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      await result.current.loadRuns();
    });

    expect(result.current.runs).toHaveLength(2);
    expect(result.current.runs[0].run_id).toBe("run-1");
    expect(api.autoquant.listRuns).toHaveBeenCalled();
  });

  test("loadRuns handles errors", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.listRuns.mockRejectedValueOnce(new Error("API error"));

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      await result.current.loadRuns();
    });

    expect(result.current.error).toBe("API error");
    expect(result.current.loading).toBe(false);
  });

  test("loadRun fetches and sets current run", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.getStatus.mockResolvedValueOnce({
      run_id: "test-1",
      status: "completed",
      progress: 100,
    });

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      const data = await result.current.loadRun("test-1");
      expect(data).toEqual({ run_id: "test-1", status: "completed", progress: 100 });
    });

    expect(result.current.currentRun).toEqual({
      run_id: "test-1",
      status: "completed",
      progress: 100,
    });
  });

  test("loadRun handles errors", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.getStatus.mockRejectedValueOnce(new Error("Not found"));

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      const data = await result.current.loadRun("test-1");
      expect(data).toBe(null);
    });

    expect(result.current.error).toBe("Not found");
  });

  test("startPipeline creates new run and refreshes", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.startRun.mockResolvedValueOnce({ run_id: "new-1" });
    api.autoquant.listRuns.mockResolvedValueOnce({
      runs: [{ run_id: "new-1", status: "pending" }],
    });
    api.autoquant.getStatus.mockResolvedValueOnce({
      run_id: "new-1",
      status: "pending",
    });

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      const runId = await result.current.startPipeline("TestStrategy");
      expect(runId).toBe("new-1");
    });

    expect(api.autoquant.startRun).toHaveBeenCalledWith({ strategy: "TestStrategy" });
    expect(result.current.currentRun).toEqual({ run_id: "new-1", status: "pending" });
    expect(result.current.runs).toHaveLength(1);
  });

  test("startPipeline handles errors", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.startRun.mockRejectedValueOnce(new Error("Start failed"));

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      const runId = await result.current.startPipeline("TestStrategy");
      expect(runId).toBe(null);
    });

    expect(result.current.error).toBe("Start failed");
    expect(result.current.loading).toBe(false);
  });

  test("cancelRun cancels a running pipeline", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.cancelRun.mockResolvedValueOnce();
    api.autoquant.getStatus.mockResolvedValueOnce({
      run_id: "test-1",
      status: "cancelled",
    });

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      await result.current.cancelRun("test-1");
    });

    expect(api.autoquant.cancelRun).toHaveBeenCalledWith("test-1");
    expect(api.autoquant.getStatus).toHaveBeenCalledWith("test-1");
  });

  test("cancelRun handles errors", async () => {
    const api = (await import("../../../services/api")).default;
    api.autoquant.cancelRun.mockRejectedValueOnce(new Error("Cancel failed"));

    const { result } = renderHook(() => useAutoQuantState());

    await act(async () => {
      await result.current.cancelRun("test-1");
    });

    expect(result.current.error).toBe("Cancel failed");
  });

  test("connectWebSocket establishes WebSocket connection", async () => {
    const api = (await import("../../../services/api")).default;
    const mockWs = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: jest.fn(),
    };
    api.autoquant.connectWebSocket.mockReturnValueOnce(mockWs);

    const { result } = renderHook(() => useAutoQuantState());

    act(() => {
      result.current.connectWebSocket("test-1");
    });

    expect(api.autoquant.connectWebSocket).toHaveBeenCalledWith("test-1");
    expect(mockWs.onopen).toBeDefined();
    expect(mockWs.onmessage).toBeDefined();
    expect(mockWs.onerror).toBeDefined();
    expect(mockWs.onclose).toBeDefined();
  });

  test("connectWebSocket closes previous connection", async () => {
    const api = (await import("../../../services/api")).default;
    const mockWs1 = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: jest.fn(),
    };
    const mockWs2 = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: jest.fn(),
    };
    api.autoquant.connectWebSocket
      .mockReturnValueOnce(mockWs1)
      .mockReturnValueOnce(mockWs2);

    const { result } = renderHook(() => useAutoQuantState());

    act(() => {
      result.current.connectWebSocket("test-1");
    });

    act(() => {
      result.current.connectWebSocket("test-2");
    });

    expect(mockWs1.close).toHaveBeenCalled();
  });

  test("WebSocket onmessage updates currentRun", async () => {
    const api = (await import("../../../services/api")).default;
    const mockWs = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: jest.fn(),
    };
    api.autoquant.connectWebSocket.mockReturnValueOnce(mockWs);

    const { result } = renderHook(() => useAutoQuantState());

    act(() => {
      result.current.connectWebSocket("test-1");
    });

    act(() => {
      result.current.setCurrentRun({ run_id: "test-1", status: "running", progress: 50 });
    });

    act(() => {
      if (mockWs.onmessage) {
        mockWs.onmessage({
          data: JSON.stringify({
            data: { status: "running", progress: 75 },
            stage: "optimization",
          }),
        });
      }
    });

    expect(result.current.currentRun.progress).toBe(75);
    expect(result.current.currentRun.current_stage).toBe("optimization");
  });

  test("WebSocket onerror sets error state", async () => {
    const api = (await import("../../../services/api")).default;
    const mockWs = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: jest.fn(),
    };
    api.autoquant.connectWebSocket.mockReturnValueOnce(mockWs);

    const { result } = renderHook(() => useAutoQuantState());

    act(() => {
      result.current.connectWebSocket("test-1");
    });

    act(() => {
      if (mockWs.onerror) {
        mockWs.onerror(new Error("Connection failed"));
      }
    });

    expect(result.current.error).toBe("WebSocket connection failed");
  });

  test("cleanup closes WebSocket on unmount", async () => {
    const api = (await import("../../../services/api")).default;
    const mockWs = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      close: jest.fn(),
    };
    api.autoquant.connectWebSocket.mockReturnValueOnce(mockWs);

    const { result, unmount } = renderHook(() => useAutoQuantState());

    act(() => {
      result.current.connectWebSocket("test-1");
    });

    unmount();

    expect(mockWs.close).toHaveBeenCalled();
  });
});
