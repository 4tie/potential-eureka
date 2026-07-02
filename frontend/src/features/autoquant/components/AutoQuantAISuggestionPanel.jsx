import { useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { approveAISuggestion, rejectAISuggestion } from "../api";

function formatValue(value) {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function proposedRows(suggestion) {
  const original = suggestion?.original_config || {};
  const changes = suggestion?.proposed_changes || {};
  return Object.entries(changes).map(([key, value]) => ({
    key,
    before: original[key],
    after: value,
  }));
}

function ManualNextActions({ actions, onCancel, onReset }) {
  if (!actions?.length) return null;
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-warning">
        <InformationCircleIcon className="h-4 w-4" />
        <h4 className="text-xs font-semibold uppercase tracking-widest">Manual next actions</h4>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {actions.map((action) => (
          <div key={action.id || action.label} className="rounded border border-base-content/10 bg-base-200/70 p-2">
            <p className="text-xs font-semibold text-base-content">{action.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-base-content/60">{action.description}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onCancel && (
          <button type="button" className="btn btn-xs btn-outline btn-warning" onClick={onCancel}>
            Stop run
          </button>
        )}
        {onReset && (
          <button type="button" className="btn btn-xs btn-primary" onClick={onReset}>
            New run
          </button>
        )}
      </div>
    </div>
  );
}

export default function AutoQuantAISuggestionPanel({
  runId,
  pipelineState,
  onCancel,
  onReset,
}) {
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [decision, setDecision] = useState(null);

  const suggestions = useMemo(
    () => pipelineState?.ai_suggestions || pipelineState?.ai_assistance?.suggestions || [],
    [pipelineState?.ai_suggestions, pipelineState?.ai_assistance?.suggestions]
  );
  const pendingId = pipelineState?.pending_ai_suggestion_id || pipelineState?.ai_assistance?.pending_ai_suggestion_id;
  const pendingSuggestion = useMemo(
    () => suggestions.find((item) => item?.id === pendingId) || null,
    [pendingId, suggestions]
  );
  const manualActions =
    decision?.suggestion?.decision?.manual_next_actions ||
    pipelineState?.ai_assistance?.manual_next_actions ||
    [];

  if (!pendingSuggestion && !manualActions.length && !decision) return null;

  const handleApprove = async () => {
    setBusyAction("approve");
    setError("");
    try {
      const response = await approveAISuggestion(runId, pendingSuggestion.id);
      setDecision(response);
    } catch (err) {
      setError(err.message || "Failed to approve AI suggestion.");
    } finally {
      setBusyAction("");
    }
  };

  const handleReject = async () => {
    setBusyAction("reject");
    setError("");
    try {
      const response = await rejectAISuggestion(runId, pendingSuggestion.id);
      setDecision(response);
    } catch (err) {
      setError(err.message || "Failed to reject AI suggestion.");
    } finally {
      setBusyAction("");
    }
  };

  const activeSuggestion = pendingSuggestion || decision?.suggestion;
  const rows = proposedRows(activeSuggestion);
  const isRejected = activeSuggestion?.status === "rejected" || decision?.suggestion?.status === "rejected";
  const isApproved = activeSuggestion?.status === "approved" || decision?.suggestion?.status === "approved";

  return (
    <div className="card border border-warning/40 bg-base-200/70 shadow-sm">
      <div className="card-body p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-warning">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-widest">AI suggestion pending review</span>
            </div>
            <h3 className="text-sm font-semibold text-base-content">{activeSuggestion?.summary || "Review AI suggestion"}</h3>
            <p className="mt-1 text-xs leading-relaxed text-base-content/70">{activeSuggestion?.explanation}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="badge badge-xs badge-outline">source: {activeSuggestion?.source || "deterministic"}</span>
              <span className="badge badge-xs badge-outline">retry: {activeSuggestion?.retry_attempt ?? "-"}</span>
              <span className="badge badge-xs badge-outline">reason: {activeSuggestion?.failure_reason || "-"}</span>
              <span className={`badge badge-xs ${isRejected ? "badge-error" : isApproved ? "badge-success" : "badge-warning"}`}>
                {activeSuggestion?.status || "pending"}
              </span>
            </div>
          </div>
          {pendingSuggestion && !decision && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm btn-success gap-1"
                onClick={handleApprove}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "approve" ? <span className="loading loading-spinner loading-xs" /> : <CheckCircleIcon className="h-4 w-4" />}
                Approve & Retry
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline btn-error gap-1"
                onClick={handleReject}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "reject" ? <span className="loading loading-spinner loading-xs" /> : <XCircleIcon className="h-4 w-4" />}
                Reject Suggestion
              </button>
            </div>
          )}
        </div>

        {error && <div className="alert alert-error py-2 text-xs">{error}</div>}
        {decision?.message && (
          <div className={`alert py-2 text-xs ${isApproved ? "alert-success" : "alert-warning"}`}>
            <ArrowPathIcon className="h-4 w-4" />
            <span>{decision.message}</span>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-base-content/10 bg-base-300/20">
            <table className="table table-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-base-content/50">
                  <th>Config</th>
                  <th>Current</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="font-mono text-primary">{row.key}</td>
                    <td className="max-w-[18rem] whitespace-normal font-mono text-base-content/60">{formatValue(row.before)}</td>
                    <td className="max-w-[18rem] whitespace-normal font-mono text-base-content">{formatValue(row.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSuggestion?.risk_notes?.length > 0 && (
          <div className="rounded-lg border border-base-content/10 bg-base-300/20 p-3">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-base-content/50">Risk notes</h4>
            <ul className="space-y-1 text-xs text-base-content/70">
              {activeSuggestion.risk_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {(isRejected || manualActions.length > 0) && (
          <ManualNextActions actions={manualActions} onCancel={onCancel} onReset={onReset} />
        )}
      </div>
    </div>
  );
}
