import { useState } from "react";
import {
  XMarkIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

export default function AutoFixPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  onReject,
  errorCode,
  action,
  beforeParams,
  afterParams,
  metricsBefore,
  metricsAfter,
  description,
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (!isOpen) return null;

  // Calculate improvement percentages
  const calculateImprovement = (before, after) => {
    if (before === null || after === null || before === 0) return null;
    return ((after - before) / Math.abs(before)) * 100;
  };

  const improvements = {};
  if (metricsBefore && metricsAfter) {
    for (const key in metricsBefore) {
      if (metricsAfter[key] !== undefined) {
        improvements[key] = calculateImprovement(
          metricsBefore[key],
          metricsAfter[key]
        );
      }
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-bold text-lg">Auto-Fix Preview</h3>
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost"
            onClick={onClose}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Error and action summary */}
        <div className="space-y-3 mb-4">
          <div className="alert alert-info">
            <InformationCircleIcon className="h-5 w-5" />
            <div>
              <p className="font-semibold">{errorCode}</p>
              <p className="text-sm">{description || `Applying auto-fix: ${action}`}</p>
            </div>
          </div>

          <div className="bg-base-200 rounded-lg p-3">
            <p className="text-sm font-semibold mb-2">Action: {action}</p>
            <p className="text-xs text-base-content/70">
              This will modify strategy parameters. Please review the changes below
              before confirming.
            </p>
          </div>
        </div>

        {/* Parameter changes */}
        {(beforeParams || afterParams) && (
          <div className="mb-4">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-semibold mb-2"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? "Hide" : "Show"} parameter details
            </button>
            {showDetails && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-base-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-base-content/50 mb-2">
                    Before
                  </p>
                  <pre className="text-xs font-mono overflow-x-auto">
                    {JSON.stringify(beforeParams, null, 2)}
                  </pre>
                </div>
                <div className="bg-base-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-base-content/50 mb-2">
                    After
                  </p>
                  <pre className="text-xs font-mono overflow-x-auto">
                    {JSON.stringify(afterParams, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expected impact */}
        {Object.keys(improvements).length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-semibold mb-2">Expected Impact</p>
            <div className="bg-base-200 rounded-lg p-3">
              {Object.entries(improvements).map(([metric, improvement]) => (
                <div key={metric} className="flex justify-between text-sm mb-1">
                  <span className="text-base-content/70">{metric}:</span>
                  <span
                    className={`font-mono ${
                      improvement === null
                        ? "text-base-content/40"
                        : improvement > 0
                        ? "text-success"
                        : improvement < 0
                        ? "text-error"
                        : "text-base-content/60"
                    }`}
                  >
                    {improvement === null
                      ? "N/A"
                      : `${improvement > 0 ? "+" : ""}${improvement.toFixed(2)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="alert alert-warning mb-4">
          <InformationCircleIcon className="h-5 w-5" />
          <div>
            <p className="text-sm">
              This action will modify your strategy parameters. Make sure to review
              the backtest results after applying the fix.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-outline gap-2"
            onClick={() => {
              onReject?.();
              onClose();
            }}
          >
            <XCircleIcon className="h-4 w-4" />
            Reject
          </button>
          <button
            type="button"
            className="btn btn-primary gap-2"
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
          >
            <CheckCircleIcon className="h-4 w-4" />
            Apply Fix
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
