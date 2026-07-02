/**
 * Tests for API client methods
 */

import { api } from "./api.js";

// Mock fetch globally
globalThis.fetch = jest.fn();

describe("API Client - AutoQuant", () => {
  beforeEach(() => {
    globalThis.fetch.mockClear();
  });

  describe("generateStrategySpec", () => {
    it("should call POST /api/auto-quant/generate-strategy-spec with correct payload", async () => {
      const mockResponse = {
        spec: {
          name: "TestStrategy",
          trading_style: "momentum",
          direction: "long",
          timeframe: "5m",
        },
        errors: [],
        raw_response: "",
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const payload = {
        trading_style: "momentum",
        direction: "long",
        risk_profile: "balanced",
        timeframe_preference: "5m",
        user_notes: "Test notes",
      };

      const result = await api.autoquant.generateStrategySpec(payload);

      expect(fetch).toHaveBeenCalledWith(
        "/api/auto-quant/generate-strategy-spec",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      expect(result).toEqual(mockResponse);
    });

    it("should handle errors from the API", async () => {
      const mockErrorResponse = {
        detail: "Ollama client not available",
      };

      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse,
      });

      const payload = {
        trading_style: "momentum",
        direction: "long",
        risk_profile: "balanced",
        timeframe_preference: "5m",
        user_notes: "",
      };

      await expect(api.autoquant.generateStrategySpec(payload)).rejects.toThrow(
        "Ollama client not available"
      );
    });

    it("should handle API errors with no detail field", async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
        statusText: "Internal Server Error",
      });

      const payload = {
        trading_style: "momentum",
        direction: "long",
        risk_profile: "balanced",
        timeframe_preference: "5m",
        user_notes: "",
      };

      await expect(api.autoquant.generateStrategySpec(payload)).rejects.toThrow(
        "Failed to generate strategy spec."
      );
    });

    it("should handle network errors", async () => {
      globalThis.fetch.mockRejectedValueOnce(new Error("Network error"));

      const payload = {
        trading_style: "momentum",
        direction: "long",
        risk_profile: "balanced",
        timeframe_preference: "5m",
        user_notes: "",
      };

      await expect(api.autoquant.generateStrategySpec(payload)).rejects.toThrow(
        "Network error"
      );
    });

    it("should return errors array when present in response", async () => {
      const mockResponse = {
        spec: null,
        errors: ["OLLAMA_CLIENT_NOT_AVAILABLE"],
        raw_response: "",
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const payload = {
        trading_style: "momentum",
        direction: "long",
        risk_profile: "balanced",
        timeframe_preference: "5m",
        user_notes: "",
      };

      const result = await api.autoquant.generateStrategySpec(payload);

      expect(result.errors).toEqual(["OLLAMA_CLIENT_NOT_AVAILABLE"]);
      expect(result.spec).toBeNull();
    });
  });
});
