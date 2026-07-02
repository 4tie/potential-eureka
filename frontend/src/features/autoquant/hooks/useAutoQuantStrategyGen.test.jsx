import { renderHook, act } from "@testing-library/react";
import useAutoQuantStrategyGen from "./useAutoQuantStrategyGen";

// Mock the API function
jest.mock("../api", () => ({
  generateTemplate: jest.fn(() => Promise.resolve({
    strategy_name: "OmniFactory_5m",
  })),
}));

// Mock the utils function
jest.mock("../utils", () => ({
  normalizeStrategies: jest.fn((strategies) => strategies),
}));

describe("useAutoQuantStrategyGen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("initializes with default strategy generation state", () => {
    const { result } = renderHook(() => useAutoQuantStrategyGen());

    expect(result.current.generatedStrategies).toEqual([]);
    expect(result.current.generateStatus).toBe(null);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.templateType).toBe("omni");
    expect(result.current.strategyList).toEqual([]);
  });

  test("initializes with provided strategies", () => {
    const strategies = [
      { strategy_name: "ExistingStrategy1" },
      { strategy_name: "ExistingStrategy2" },
    ];

    const { result } = renderHook(() => useAutoQuantStrategyGen(strategies));

    expect(result.current.strategyList).toEqual(strategies);
  });

  test("handleGenerateTemplate generates strategy successfully", async () => {
    const { generateTemplate } = await import("../api");
    generateTemplate.mockResolvedValueOnce({
      strategy_name: "OmniFactory_5m",
    });

    const { result } = renderHook(() => useAutoQuantStrategyGen());

    const form = { timeframe: "5m" };
    const updateField = jest.fn();

    await act(async () => {
      await result.current.handleGenerateTemplate(form, updateField);
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generatedStrategies).toHaveLength(1);
    expect(result.current.generatedStrategies[0].strategy_name).toBe("OmniFactory_5m");
    expect(result.current.generateStatus).toEqual({
      ok: true,
      message: 'Strategy "OmniFactory_5m" created and selected.',
    });
    expect(updateField).toHaveBeenCalledWith("strategy", "OmniFactory_5m");
  });

  test("handleGenerateTemplate uses correct template type", async () => {
    const { generateTemplate } = await import("../api");

    const { result } = renderHook(() => useAutoQuantStrategyGen());

    act(() => {
      result.current.setTemplateType("adaptive");
    });

    const form = { timeframe: "1h" };
    const updateField = jest.fn();

    await act(async () => {
      await result.current.handleGenerateTemplate(form, updateField);
    });

    expect(generateTemplate).toHaveBeenCalledWith({
      strategy_name: "AdaptiveFactory",
      adaptive: true,
      ensemble: false,
      momentum: false,
      omni: false,
      timeframe: "1h",
    });
  });

  test("handleGenerateTemplate handles API errors", async () => {
    const { generateTemplate } = await import("../api");
    generateTemplate.mockRejectedValueOnce(new Error("Generation failed"));

    const { result } = renderHook(() => useAutoQuantStrategyGen());

    const form = { timeframe: "5m" };
    const updateField = jest.fn();

    await act(async () => {
      await result.current.handleGenerateTemplate(form, updateField);
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generateStatus).toEqual({
      ok: false,
      message: "Generation failed",
    });
    expect(result.current.generatedStrategies).toEqual([]);
  });

  test("handleGenerateTemplate does not add duplicate strategies", async () => {
    const { generateTemplate } = await import("../api");
    const { normalizeStrategies } = await import("../utils");

    generateTemplate.mockResolvedValueOnce({
      strategy_name: "OmniFactory_5m",
    });

    normalizeStrategies.mockImplementation((strategies) => strategies);

    const { result } = renderHook(() => useAutoQuantStrategyGen([
      { strategy_name: "OmniFactory_5m" },
    ]));

    const form = { timeframe: "5m" };
    const updateField = jest.fn();

    await act(async () => {
      await result.current.handleGenerateTemplate(form, updateField);
    });

    expect(result.current.generatedStrategies).toEqual([]);
  });

  test("setTemplateType updates template type", () => {
    const { result } = renderHook(() => useAutoQuantStrategyGen());

    act(() => {
      result.current.setTemplateType("momentum");
    });

    expect(result.current.templateType).toBe("momentum");
  });

  test("setGeneratedStrategies updates generated strategies", () => {
    const { result } = renderHook(() => useAutoQuantStrategyGen());

    act(() => {
      result.current.setGeneratedStrategies([
        { strategy_name: "Generated1" },
        { strategy_name: "Generated2" },
      ]);
    });

    expect(result.current.generatedStrategies).toHaveLength(2);
  });

  test("setGenerateStatus updates generation status", () => {
    const { result } = renderHook(() => useAutoQuantStrategyGen());

    act(() => {
      result.current.setGenerateStatus({ ok: true, message: "Test" });
    });

    expect(result.current.generateStatus).toEqual({ ok: true, message: "Test" });
  });

  test("setIsGenerating updates generating state", () => {
    const { result } = renderHook(() => useAutoQuantStrategyGen());

    act(() => {
      result.current.setIsGenerating(true);
    });

    expect(result.current.isGenerating).toBe(true);
  });

  test("strategyList combines provided and generated strategies", () => {
    const strategies = [
      { strategy_name: "Existing1" },
      { strategy_name: "Existing2" },
    ];

    const { result } = renderHook(() => useAutoQuantStrategyGen(strategies));

    act(() => {
      result.current.setGeneratedStrategies([
        { strategy_name: "Generated1" },
        { strategy_name: "Generated2" },
      ]);
    });

    expect(result.current.strategyList).toHaveLength(4);
  });

  test("maps template types to strategy names", async () => {
    const { generateTemplate } = await import("../api");

    const templateTypes = ["catfactory", "adaptive", "ensemble", "momentum", "omni"];
    const expectedNames = ["CatFactory", "AdaptiveFactory", "EnsembleFactory", "MomentumFactory", "OmniFactory"];

    for (let i = 0; i < templateTypes.length; i++) {
      const { result } = renderHook(() => useAutoQuantStrategyGen());

      act(() => {
        result.current.setTemplateType(templateTypes[i]);
      });

      const form = { timeframe: "5m" };
      const updateField = jest.fn();

      await act(async () => {
        await result.current.handleGenerateTemplate(form, updateField);
      });

      expect(generateTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy_name: expectedNames[i],
        })
      );
    }
  });
});
