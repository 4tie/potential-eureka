import api from "../../services/api";

export function loadAutoQuantOptions() {
  return api.autoquant.loadOptions();
}

export function saveAutoQuantOptions(options) {
  return api.autoquant.saveOptions(options);
}

export function loadTimeframeThresholds(timeframe) {
  return api.autoquant.loadTimeframeThresholds(timeframe);
}

export function generateTemplate(payload) {
  return api.autoquant.generateTemplate(payload);
}

export function screenPairs(payload) {
  return api.autoquant.screenPairs(payload);
}

export function startRun(payload) {
  return api.autoquant.startRun(payload);
}

export function cancelRun(runId) {
  return api.autoquant.cancelRun(runId);
}

export function getReport(runId) {
  return api.autoquant.getReport(runId);
}

export function listRuns() {
  return api.autoquant.listRuns();
}
