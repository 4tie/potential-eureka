/**
 * Central API client for Strategy Lab
 * Handles all HTTP requests to the backend
 */

const API_BASE = "/api";

async function parseJsonResponse(res, fallbackMessage) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || fallbackMessage || res.statusText);
  }
  return data;
}

export const api = {
  /**
   * AutoQuant pipeline endpoints
   */
  autoquant: {
    baseURL: `${API_BASE}/auto-quant`,

    /**
     * Load AutoQuant options
     * @returns {Promise<object>}
     */
    async loadOptions() {
      const res = await fetch(`${this.baseURL}/options`);
      return parseJsonResponse(res, "Failed to load AutoQuant options.");
    },

    /**
     * Save AutoQuant options
     * @param {object} options
     * @returns {Promise<object>}
     */
    async saveOptions(options) {
      const res = await fetch(`${this.baseURL}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      return parseJsonResponse(res, "Failed to save AutoQuant options.");
    },

    /**
     * Load timeframe thresholds
     * @param {string} timeframe
     * @returns {Promise<object>}
     */
    async loadTimeframeThresholds(timeframe) {
      const res = await fetch(`${this.baseURL}/timeframe-thresholds/${timeframe}`);
      return parseJsonResponse(res, "Failed to load timeframe thresholds.");
    },

    /**
     * Generate strategy template
     * @param {object} payload
     * @returns {Promise<object>}
     */
    async generateTemplate(payload) {
      const res = await fetch(`${this.baseURL}/generate-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseJsonResponse(res, "Failed to generate template.");
    },

    /**
     * Screen pairs for trading
     * @param {object} payload
     * @returns {Promise<object>}
     */
    async screenPairs(payload) {
      const res = await fetch(`${this.baseURL}/screen-pairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseJsonResponse(res, "Screening failed.");
    },

    /**
     * Start a new pipeline execution
     * @param {object} payload
     * @returns {Promise<{run_id: string, message: string}>}
     */
    async startRun(payload) {
      const res = await fetch(`${this.baseURL}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseJsonResponse(res, "Failed to start pipeline.");
    },

    /**
     * Cancel a running pipeline
     * @param {string} runId
     * @returns {Promise<object>}
     */
    async cancelRun(runId) {
      const res = await fetch(`${this.baseURL}/cancel/${runId}`, { method: "POST" });
      return parseJsonResponse(res, "Failed to send cancellation request.");
    },

    /**
     * Resume a paused pipeline after review
     * @param {string} runId
     * @param {string[]} approvedPairs
     * @returns {Promise<object>}
     */
    async resumeRun(runId, approvedPairs) {
      const res = await fetch(`${this.baseURL}/resume/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_pairs: approvedPairs }),
      });
      return parseJsonResponse(res, "Failed to resume pipeline.");
    },

    /**
     * Get pipeline run status
     * @param {string} runId
     * @returns {Promise<PipelineRun>}
     */
    async getStatus(runId) {
      const res = await fetch(`${this.baseURL}/status/${runId}`);
      return parseJsonResponse(res, `Failed to load run ${runId}.`);
    },

    /**
     * Get pipeline report
     * @param {string} runId
     * @returns {Promise<object>}
     */
    async getReport(runId) {
      const res = await fetch(`${this.baseURL}/report/${runId}`);
      return parseJsonResponse(res, `Failed to load report for ${runId}.`);
    },

    /**
     * List all pipeline runs
     * @returns {Promise<object>}
     */
    async listRuns() {
      const res = await fetch(`${this.baseURL}/runs`);
      return parseJsonResponse(res, "Failed to load AutoQuant runs.");
    },

    /**
     * Open WebSocket for real-time updates
     * @param {string} runId
     * @returns {WebSocket}
     */
    connectWebSocket(runId) {
      // Use relative path to leverage Vite proxy in dev (ws: true in proxy config)
      // The proxy will upgrade the connection to WebSocket and forward to backend
      const wsUrl = `${this.baseURL}/ws/${runId}`;
      return new WebSocket(wsUrl);
    },
  },

  /**
   * Candidate evaluation endpoints
   */
  candidate: {
    /**
     * Start an async candidate evaluation run
     * @param {StrategySpec} spec
     * @param {CandidateConfig} config
     * @returns {Promise<{run_id: string, status: string, message: string}>}
     */
    async startRun(spec, config) {
      const res = await fetch(`${API_BASE}/candidate/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, config }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    /**
     * Get async candidate run state
     * @param {string} runId
     * @returns {Promise<CandidateRunState>}
     */
    async getRun(runId) {
      const res = await fetch(`${API_BASE}/candidate/runs/${runId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    /**
     * Build WebSocket URL for candidate run progress
     * @param {string} runId
     * @returns {string}
     */
    getWebSocketUrl(runId) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/api/candidate/ws/${runId}`;
    },

    /**
     * Open WebSocket for live candidate progress
     * @param {string} runId
     * @returns {WebSocket}
     */
    connectWebSocket(runId) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return new WebSocket(`${protocol}//${window.location.host}/api/candidate/ws/${runId}`);
    },

    /**
     * Evaluate a candidate strategy
     * @param {StrategySpec} spec
     * @param {CandidateConfig} config
     * @returns {Promise<{verdict: CandidateVerdict}>}
     */
    async evaluate(spec, config) {
      const res = await fetch(`${API_BASE}/candidate/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, config }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },

  /**
   * Settings endpoints
   */
  settings: {
    /**
     * Get application settings
     * @returns {Promise<{settings: object}>}
     */
    async get() {
      const res = await fetch(`${API_BASE}/settings`);
      return parseJsonResponse(res, "Failed to load settings.");
    },

    /**
     * Save application settings
     * @param {object} settings
     * @returns {Promise<{settings: object}>}
     */
    async save(settings) {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      return parseJsonResponse(res, "Failed to save settings.");
    },

    /**
     * Reset settings to defaults
     * @returns {Promise<{settings: object}>}
     */
    async reset() {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      return parseJsonResponse(res, "Failed to reset settings.");
    },
  },

  /**
   * AI/LLM endpoints
   */
  ai: {
    /**
     * Get available AI models
     * @returns {Promise<{reachable: boolean, models: string[], error?: string}>}
     */
    async getModels() {
      const res = await fetch(`${API_BASE}/ai/models`);
      return parseJsonResponse(res, "Failed to fetch AI models.");
    },

    /**
     * Get agent context
     * @param {object} contextOverrides
     * @returns {Promise<object>}
     */
    async getContext(contextOverrides = {}) {
      const query = new URLSearchParams(
        Object.entries(contextOverrides).filter(([, v]) => v !== undefined)
      ).toString();
      const res = await fetch(`${API_BASE}/agent/context${query ? `?${query}` : ""}`);
      return parseJsonResponse(res, "Failed to load agent context.");
    },
  },

  /**
   * Pairs endpoints
   */
  pairs: {
    /**
     * Get all pairs
     * @returns {Promise<object>}
     */
    async getAll() {
      const res = await fetch(`${API_BASE}/pairs`);
      return parseJsonResponse(res, "Failed to load pairs.");
    },

    /**
     * Search pairs
     * @param {string} query
     * @returns {Promise<object>}
     */
    async search(query) {
      const res = await fetch(`${API_BASE}/pairs/search?q=${encodeURIComponent(query)}`);
      return parseJsonResponse(res, "Failed to search pairs.");
    },

    /**
     * Toggle pair favorite
     * @param {string} pair
     * @returns {Promise<object>}
     */
    async toggleFavorite(pair) {
      const res = await fetch(`${API_BASE}/pairs/toggle-favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair }),
      });
      return parseJsonResponse(res, "Failed to toggle favorite.");
    },

    /**
     * Toggle pair lock
     * @param {string} pair
     * @returns {Promise<object>}
     */
    async toggleLock(pair) {
      const res = await fetch(`${API_BASE}/pairs/toggle-lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair }),
      });
      return parseJsonResponse(res, "Failed to toggle lock.");
    },

    /**
     * Toggle pair selection
     * @param {string} pair
     * @param {boolean} selected
     * @returns {Promise<object>}
     */
    async toggleSelect(pair, selected) {
      const res = await fetch(`${API_BASE}/pairs/toggle-select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair, selected }),
      });
      return parseJsonResponse(res, "Failed to toggle selection.");
    },

    /**
     * Randomize pairs
     * @param {boolean} preserveLocked
     * @returns {Promise<object>}
     */
    async randomize(preserveLocked = true) {
      const res = await fetch(`${API_BASE}/pairs/randomize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preserve_locked: preserveLocked }),
      });
      return parseJsonResponse(res, "Failed to randomize pairs.");
    },

    /**
     * Update max trades
     * @param {number} maxOpenTrades
     * @returns {Promise<object>}
     */
    async updateMaxTrades(maxOpenTrades) {
      const res = await fetch(`${API_BASE}/pairs/update-max-trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_open_trades: maxOpenTrades }),
      });
      return parseJsonResponse(res, "Failed to update max trades.");
    },

    /**
     * Clear pairs
     * @returns {Promise<object>}
     */
    async clear() {
      const res = await fetch(`${API_BASE}/pairs/clear`, {
        method: "POST",
      });
      return parseJsonResponse(res, "Failed to clear pairs.");
    },
  },

  /**
   * Backtest endpoints
   */
  backtest: {
    /**
     * Get backtest results
     * @param {string} runId
     * @returns {Promise<object>}
     */
    async getResults(runId) {
      const res = await fetch(`${API_BASE}/backtest/results/${runId}`);
      return parseJsonResponse(res, "Failed to load backtest results.");
    },
  },

  /**
   * Session endpoints
   */
  session: {
    /**
     * Get session status
     * @param {string} sessionId
     * @returns {Promise<object>}
     */
    async getStatus(sessionId) {
      const res = await fetch(`${API_BASE}/session/status/${sessionId}`);
      return parseJsonResponse(res, "Failed to load session status.");
    },
  },

  /**
   * Performance endpoints
   */
  performance: {
    /**
     * Get performance runs
     * @param {string} strategyName
     * @returns {Promise<{runs: object[]}>}
     */
    async getRuns(strategyName) {
      const res = await fetch(`${API_BASE}/performance/runs?strategy=${encodeURIComponent(strategyName)}`);
      return parseJsonResponse(res, "Failed to load performance runs.");
    },

    /**
     * Get performance run details
     * @param {string} runId
     * @returns {Promise<object>}
     */
    async getRun(runId) {
      const res = await fetch(`${API_BASE}/performance/runs/${runId}`);
      return parseJsonResponse(res, "Failed to load run details.");
    },

    /**
     * Apply performance run
     * @param {string} runId
     * @returns {Promise<{message: string}>}
     */
    async applyRun(runId) {
      const res = await fetch(`${API_BASE}/performance/runs/${runId}/apply`, {
        method: "POST",
      });
      return parseJsonResponse(res, "Failed to apply run.");
    },
  },

  /**
   * Strategies endpoints
   */
  strategies: {
    /**
     * Get strategy files
     * @param {string} name
     * @returns {Promise<object>}
     */
    async getFiles(name) {
      const res = await fetch(`${API_BASE}/strategies/files/${encodeURIComponent(name)}`);
      return parseJsonResponse(res, "Failed to load strategy files.");
    },

    /**
     * Get strategy snapshots
     * @param {string} name
     * @returns {Promise<{snapshots: object[]}>}
     */
    async getSnapshots(name) {
      const res = await fetch(`${API_BASE}/strategies/${encodeURIComponent(name)}/snapshots`);
      return parseJsonResponse(res, "Failed to load strategy snapshots.");
    },
  },
};

export default api;
