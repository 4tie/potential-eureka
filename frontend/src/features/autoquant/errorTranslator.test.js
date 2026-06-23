import { describe, it, expect } from "@jest/globals";
import { translateError, getSuggestedActions, formatErrorDetails } from "./errorTranslator";

describe("errorTranslator", () => {
  describe("translateError", () => {
    it("should translate syntax errors", () => {
      const result = translateError("SyntaxError: invalid syntax", "Unknown Stage");
      // The pattern matching should work for unknown stages
      expect(result).toBeDefined();
      expect(result.originalMessage).toBe("SyntaxError: invalid syntax");
    });

    it("should translate file not found errors", () => {
      const result = translateError("No such file or directory: strategy.py", "Sanity Backtest");
      expect(result.userMessage).toContain("not found");
      expect(result.severity).toBe("error");
      expect(result.action).toBe("verify_file");
    });

    it("should translate connection errors", () => {
      const result = translateError("Connection refused", "Hyperopt Execution");
      expect(result.userMessage).toContain("connect");
      expect(result.severity).toBe("error");
      expect(result.action).toBe("check_connection");
    });

    it("should translate authentication errors", () => {
      const result = translateError("Authentication failed: invalid API key", "Sanity Backtest");
      expect(result.userMessage).toContain("authentication");
      expect(result.severity).toBe("error");
      expect(result.action).toBe("check_credentials");
    });

    it("should translate rate limit errors as warnings", () => {
      const result = translateError("Rate limit exceeded", "Sanity Backtest");
      expect(result.userMessage).toContain("rate limit");
      expect(result.severity).toBe("warning");
      expect(result.action).toBe("wait_retry");
    });

    it("should translate insufficient data errors", () => {
      const result = translateError("Insufficient data for backtest", "Sanity Backtest");
      expect(result.userMessage).toContain("data");
      expect(result.severity).toBe("warning");
      expect(result.action).toBe("adjust_timerange");
    });

    it("should use stage-specific default errors", () => {
      const result = translateError("Unknown error occurred", "Sanity Backtest");
      expect(result.userMessage).toContain("backtest");
      expect(result.checks).toBeDefined();
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it("should handle null error message", () => {
      const result = translateError(null, "Sanity Backtest");
      expect(result.userMessage).toContain("unknown");
      expect(result.severity).toBe("error");
      expect(result.originalMessage).toBeNull();
    });

    it("should handle undefined error message", () => {
      const result = translateError(undefined, "Sanity Backtest");
      expect(result.userMessage).toContain("unknown");
      expect(result.severity).toBe("error");
    });

    it("should use generic fallback for unknown errors", () => {
      const result = translateError("Some completely unknown error type", "Unknown Stage");
      expect(result.userMessage).toContain("error occurred");
      expect(result.severity).toBe("error");
      expect(result.action).toBe("review_logs");
    });
  });

  describe("getSuggestedActions", () => {
    it("should return suggestions for fix_syntax action", () => {
      const suggestions = getSuggestedActions("fix_syntax");
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes("syntax"))).toBe(true);
    });

    it("should return suggestions for check_connection action", () => {
      const suggestions = getSuggestedActions("check_connection");
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.some(s => s.includes("connection"))).toBe(true);
    });

    it("should return suggestions for verify_file action", () => {
      const suggestions = getSuggestedActions("verify_file");
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.some(s => s.includes("file"))).toBe(true);
    });

    it("should return suggestions for unknown action", () => {
      const suggestions = getSuggestedActions("unknown_action");
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.includes("Review"))).toBe(true);
    });

    it("should return suggestions for contact_support action", () => {
      const suggestions = getSuggestedActions("contact_support");
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.some(s => s.includes("Report"))).toBe(true);
    });
  });

  describe("formatErrorDetails", () => {
    it("should format error details with original message", () => {
      const translation = {
        originalMessage: "Original error message",
        action: "fix_syntax",
        checks: ["Check 1", "Check 2"],
      };
      const details = formatErrorDetails(translation);
      expect(Array.isArray(details)).toBe(true);
      expect(details.some(d => d.label === "Technical Error")).toBe(true);
      expect(details.some(d => d.value.includes("Original error message"))).toBe(true);
    });

    it("should format error details with suggested actions", () => {
      const translation = {
        originalMessage: "Error message",
        action: "fix_syntax",
      };
      const details = formatErrorDetails(translation);
      expect(details.some(d => d.label === "Suggested Actions")).toBe(true);
    });

    it("should format error details with checks", () => {
      const translation = {
        originalMessage: "Error message",
        action: "review_stage",
        checks: ["Check 1", "Check 2"],
      };
      const details = formatErrorDetails(translation);
      expect(details.some(d => d.label === "Checks to Perform")).toBe(true);
    });

    it("should handle error translation without original message", () => {
      const translation = {
        action: "fix_syntax",
      };
      const details = formatErrorDetails(translation);
      expect(Array.isArray(details)).toBe(true);
      // Should not have technical error entry
      expect(details.some(d => d.label === "Technical Error")).toBe(false);
    });

    it("should handle error translation without action", () => {
      const translation = {
        originalMessage: "Error message",
      };
      const details = formatErrorDetails(translation);
      expect(Array.isArray(details)).toBe(true);
      expect(details.some(d => d.label === "Technical Error")).toBe(true);
      expect(details.some(d => d.label === "Suggested Actions")).toBe(false);
    });

    it("should handle empty error translation", () => {
      const translation = {};
      const details = formatErrorDetails(translation);
      expect(Array.isArray(details)).toBe(true);
      expect(details.length).toBe(0);
    });
  });
});
