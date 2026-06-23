import { describe, it, expect } from "@jest/globals";
import { getPipelineStep, mapStageStatus, PIPELINE_STEPS, LEGACY_STAGE_MAP } from "./pipelineSteps";

describe("pipelineSteps", () => {
  describe("PIPELINE_STEPS", () => {
    it("should have all required pipeline steps", () => {
      expect(PIPELINE_STEPS).toHaveLength(7);
      expect(PIPELINE_STEPS[0].id).toBe("preflight");
      expect(PIPELINE_STEPS[1].id).toBe("screening");
      expect(PIPELINE_STEPS[2].id).toBe("baseline");
      expect(PIPELINE_STEPS[3].id).toBe("hyperopt");
      expect(PIPELINE_STEPS[4].id).toBe("robustness");
      expect(PIPELINE_STEPS[5].id).toBe("competition");
      expect(PIPELINE_STEPS[6].id).toBe("delivery");
    });

    it("should have required metadata for each step", () => {
      PIPELINE_STEPS.forEach((step) => {
        expect(step).toHaveProperty("id");
        expect(step).toHaveProperty("name");
        expect(step).toHaveProperty("icon");
        expect(step).toHaveProperty("description");
        expect(step).toHaveProperty("whyItMatters");
        expect(step).toHaveProperty("inputs");
        expect(step).toHaveProperty("checks");
        expect(step).toHaveProperty("metrics");
        expect(step).toHaveProperty("statusMap");
      });
    });

    it("should have non-empty arrays for inputs, checks, and metrics", () => {
      PIPELINE_STEPS.forEach((step) => {
        expect(Array.isArray(step.inputs)).toBe(true);
        expect(step.inputs.length).toBeGreaterThan(0);
        expect(Array.isArray(step.checks)).toBe(true);
        expect(step.checks.length).toBeGreaterThan(0);
        expect(Array.isArray(step.metrics)).toBe(true);
        expect(step.metrics.length).toBeGreaterThan(0);
      });
    });
  });

  describe("LEGACY_STAGE_MAP", () => {
    it("should map legacy stage names to new step IDs", () => {
      expect(LEGACY_STAGE_MAP["Sanity Backtest"]).toBe("baseline");
      expect(LEGACY_STAGE_MAP["Hyperopt Execution"]).toBe("hyperopt");
      expect(LEGACY_STAGE_MAP["Auto-Patching"]).toBe("robustness");
      expect(LEGACY_STAGE_MAP["Out-of-Sample Validation"]).toBe("robustness");
      expect(LEGACY_STAGE_MAP["Multi-Pair Stress Test"]).toBe("competition");
      expect(LEGACY_STAGE_MAP["Risk Assessment"]).toBe("robustness");
      expect(LEGACY_STAGE_MAP["Delivery"]).toBe("delivery");
    });
  });

  describe("getPipelineStep", () => {
    it("should return step by ID", () => {
      const step = getPipelineStep("baseline");
      expect(step).not.toBeNull();
      expect(step.id).toBe("baseline");
      expect(step.name).toBe("Portfolio Baseline Backtest");
    });

    it("should return step by name", () => {
      const step = getPipelineStep("Portfolio Baseline Backtest");
      expect(step).not.toBeNull();
      expect(step.id).toBe("baseline");
    });

    it("should return step by legacy stage name", () => {
      const step = getPipelineStep("Sanity Backtest");
      expect(step).not.toBeNull();
      expect(step.id).toBe("baseline");
    });

    it("should return null for unknown step", () => {
      const step = getPipelineStep("unknown_step");
      expect(step).toBeNull();
    });
  });

  describe("mapStageStatus", () => {
    it("should map passed status to passed", () => {
      expect(mapStageStatus("passed", "Portfolio Baseline Backtest")).toBe("passed");
    });

    it("should map failed status to failed", () => {
      expect(mapStageStatus("failed", "Portfolio Baseline Backtest")).toBe("failed");
    });

    it("should map running status to running", () => {
      expect(mapStageStatus("running", "Portfolio Baseline Backtest")).toBe("running");
    });

    it("should map pending status to pending", () => {
      expect(mapStageStatus("pending", "Portfolio Baseline Backtest")).toBe("pending");
    });

    it("should map warning status to warning", () => {
      expect(mapStageStatus("warning", "Portfolio Baseline Backtest")).toBe("warning");
    });

    it("should map completed status to passed", () => {
      expect(mapStageStatus("completed", "Portfolio Baseline Backtest")).toBe("passed");
    });

    it("should use step-specific status mapping when available", () => {
      const step = getPipelineStep("baseline");
      if (step?.statusMap) {
        Object.entries(step.statusMap).forEach(([inputStatus, expectedStatus]) => {
          const mapped = mapStageStatus(inputStatus, "Portfolio Baseline Backtest");
          expect(mapped).toBe(expectedStatus);
        });
      }
    });

    it("should default to pending for unknown status", () => {
      expect(mapStageStatus("unknown", "Portfolio Baseline Backtest")).toBe("pending");
    });
  });
});
