import { renderHook, act } from "@testing-library/react";
import useAutoQuantUI from "./useAutoQuantUI";

describe("useAutoQuantUI", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  test("initializes with default UI state", () => {
    const { result } = renderHook(() => useAutoQuantUI());

    expect(result.current.showHyperopt).toBe(false);
    expect(result.current.showWfo).toBe(false);
    expect(result.current.showEnsemble).toBe(false);
    expect(result.current.logFilter).toBe("");
    expect(result.current.notifEnabled).toBe(false);
  });

  test("initializes notifEnabled from localStorage", () => {
    localStorage.setItem("aq_notif_enabled", "true");
    const { result } = renderHook(() => useAutoQuantUI());

    expect(result.current.notifEnabled).toBe(true);
  });

  test("toggleNotif switches notification state and persists to localStorage", () => {
    const { result } = renderHook(() => useAutoQuantUI());

    act(() => {
      result.current.toggleNotif();
    });

    expect(result.current.notifEnabled).toBe(true);
    expect(localStorage.getItem("aq_notif_enabled")).toBe("true");

    act(() => {
      result.current.toggleNotif();
    });

    expect(result.current.notifEnabled).toBe(false);
    expect(localStorage.getItem("aq_notif_enabled")).toBe("false");
  });

  test("setShowHyperopt toggles hyperopt visibility", () => {
    const { result } = renderHook(() => useAutoQuantUI());

    act(() => {
      result.current.setShowHyperopt(true);
    });

    expect(result.current.showHyperopt).toBe(true);
  });

  test("setShowWfo toggles WFO visibility", () => {
    const { result } = renderHook(() => useAutoQuantUI());

    act(() => {
      result.current.setShowWfo(true);
    });

    expect(result.current.showWfo).toBe(true);
  });

  test("setShowEnsemble toggles ensemble visibility", () => {
    const { result } = renderHook(() => useAutoQuantUI());

    act(() => {
      result.current.setShowEnsemble(true);
    });

    expect(result.current.showEnsemble).toBe(true);
  });

  test("setLogFilter updates log filter string", () => {
    const { result } = renderHook(() => useAutoQuantUI());

    act(() => {
      result.current.setLogFilter("error");
    });

    expect(result.current.logFilter).toBe("error");
  });

  test("setNotifEnabled directly sets notification state", () => {
    const { result } = renderHook(() => useAutoQuantUI());

    act(() => {
      result.current.setNotifEnabled(true);
    });

    expect(result.current.notifEnabled).toBe(true);
  });

  test("handles localStorage errors gracefully", () => {
    // Mock localStorage to throw error
    const originalGetItem = localStorage.getItem;
    const originalSetItem = localStorage.setItem;

    localStorage.getItem = jest.fn(() => {
      throw new Error("Storage error");
    });
    localStorage.setItem = jest.fn(() => {
      throw new Error("Storage error");
    });

    const { result } = renderHook(() => useAutoQuantUI());

    // Should still initialize with default false
    expect(result.current.notifEnabled).toBe(false);

    // toggleNotif should not throw
    act(() => {
      result.current.toggleNotif();
    });

    expect(result.current.notifEnabled).toBe(true);

    // Restore original methods
    localStorage.getItem = originalGetItem;
    localStorage.setItem = originalSetItem;
  });
});
