import { renderHook, act } from "@testing-library/react";
import { useOptimizerLogs } from "./useOptimizerLogs";

class MockEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.close = jest.fn();
    MockEventSource.instances.push(this);
  }

  emit(data) {
    this.onmessage?.({ data });
  }
}

describe("useOptimizerLogs", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource;
  });

  test("parses JSON log messages and closes the stream on cleanup", () => {
    const { result, unmount } = renderHook(() => useOptimizerLogs());

    act(() => {
      result.current.startLogs();
      MockEventSource.instances[0].emit(JSON.stringify({ message: "[Trial #1] Completed" }));
    });

    expect(result.current.logLines).toEqual(["[Trial #1] Completed"]);

    unmount();

    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });
});
