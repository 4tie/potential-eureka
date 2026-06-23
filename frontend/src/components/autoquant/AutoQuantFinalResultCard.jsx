import { useState } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  DocumentArrowDownIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { translateError } from "../../features/autoquant/errorTranslator";

function StatusBanner({ status, reason, rawReason }) {
  const [showTechnical, setShowTechnical] = useState(false);

  const statusConfig = {
    export_ready: {
      icon: CheckCircleIcon,
      bgColor: "success/10",
      borderColor: "success/30",
      textColor: "success",
      label: "Export Ready",
      description: "Strategy has passed all validation checks and is ready for production use.",
    },
    needs_repair: {
      icon: ExclamationTriangleIcon,
      bgColor: "warning/10",
      borderColor: "warning/30",
      textColor: "warning",
      label: "Needs Repair",
      description: "Strategy has issues that should be addressed before deployment.",
    },
    rejected: {
      icon: XCircleIcon,
      bgColor: "error/10",
      borderColor: "error/30",
      textColor: "error",
      label: "Rejected",
      description: "Strategy did not meet minimum quality thresholds.",
    },
    data_issues: {
      icon: InformationCircleIcon,
      bgColor: "info/10",
      borderColor: "info/30",
      textColor: "info",
      label: "Data Issues",
      description: "Pipeline was blocked by data quality or availability problems.",
    },
  };

  const config = statusConfig[status] || statusConfig.data_issues;
  const Icon = config.icon;

  return (
    <div
      className={`rounded-lg border p-4 mb-4`}
      style={{
        backgroundColor: `var(--${config.bgColor.replace("/", "-")})`,
        borderColor: `var(--${config.borderColor.replace("/", "-")})`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg`}
          style={{
            backgroundColor: `var(--${config.bgColor.replace("/", "-").replace("10", "20")})`,
          }}
        >
          <Icon className={`h-5 w-5`} style={{ color: `var(--${config.textColor})` }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold" style={{ color: `var(--${config.textColor})` }}>
            {config.label}
          </h3>
          <p className="text-xs text-base-content/70 mt-1">{config.description}</p>
          {reason && (
            <p className="text-xs text-base-content/60 mt-2 font-medium">Reason: {reason}</p>
          )}
          {rawReason && rawReason !== reason && (
            <button
              type="button"
              onClick={() => setShowTechnical(!showTechnical)}
              className="flex items-center gap-1 text-[10px] text-base-content/40 hover:text-base-content/60 mt-2 transition-colors"
            >
              {showTechnical ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
              <span>Technical details</span>
            </button>
          )}
          {showTechnical && rawReason && (
            <div className="mt-2 p-2 bg-base-200/50 rounded text-[10px] text-base-content/50 font-mono break-words">
              {rawReason}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricGrid({ metrics }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {metrics.map((metric, idx) => (
        <div key={idx} className="bg-base-200/50 rounded-lg p-3 border border-base-200">
          <div className="flex items-center gap-2 mb-1">
            {metric.icon && <metric.icon className="h-3.5 w-3.5 text-primary/60" />}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50">
              {metric.label}
            </span>
          </div>
          <div className="text-sm font-mono font-bold text-base-content">
            {metric.value != null ? metric.value : "Not available"}
            {metric.unit && <span className="text-xs font-normal text-base-content/60 ml-1">{metric.unit}</span>}
          </div>
          {metric.threshold && (
            <div className="text-[10px] text-base-content/40 mt-0.5">Target: {metric.threshold}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function FileList({ files, onDownload }) {
  if (!files || Object.keys(files).length === 0) {
    return (
      <div className="text-center py-4">
        <DocumentArrowDownIcon className="h-6 w-6 text-base-content/30 mx-auto mb-2" />
        <p className="text-xs text-base-content/40">No files generated</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(files).map(([key, filename]) => (
        <button
          key={key}
          onClick={() => onDownload(filename)}
          className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-base-200 hover:border-primary/30 hover:bg-base-200/50 transition-colors text-left"
        >
          <DocumentArrowDownIcon className="h-4 w-4 text-primary/60" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-base-content truncate">{filename}</div>
            <div className="text-[10px] text-base-content/50 capitalize">{key.replace(/_/g, " ")}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function AutoQuantFinalResultCard({ report, onDownload }) {
  // Determine final status based on report data
  const determineStatus = () => {
    if (!report) return { status: "data_issues", reason: "Report data not available", rawReason: null };

    // Priority 1: Use backend-provided validation status
    const backendStatus = report.validation_status || report.readiness_label;
    
    // Normalize score: if > 1, treat as 0-100 scale and divide by 100
    const rawScore = typeof report.score === "number" ? report.score : null;
    const normalizedScore = rawScore == null ? null : rawScore > 1 ? rawScore / 100 : rawScore;
    
    const scoreExplanation = report.score_explanation || [];
    const rawReason = scoreExplanation[0] || null;

    // Map backend status to UI status
    if (backendStatus === "Production Ready" || backendStatus === "Elite" || (normalizedScore != null && normalizedScore >= 0.75)) {
      return {
        status: "export_ready",
        reason: rawReason || "Strategy meets all validation criteria",
        rawReason: null
      };
    }
    if (backendStatus === "Candidate" || backendStatus === "Qualified" || (normalizedScore != null && normalizedScore >= 0.5 && normalizedScore < 0.75)) {
      // Translate the reason if it looks technical
      const translated = rawReason ? translateError(rawReason) : null;
      return {
        status: "needs_repair",
        reason: translated?.userMessage || rawReason || "Strategy has potential but needs improvement",
        rawReason: translated?.userMessage !== rawReason ? rawReason : null
      };
    }
    if (backendStatus === "Rejected" || (normalizedScore != null && normalizedScore < 0.5)) {
      // Translate the reason if it looks technical
      const translated = rawReason ? translateError(rawReason) : null;
      return {
        status: "rejected",
        reason: translated?.userMessage || rawReason || "Strategy did not meet validation criteria",
        rawReason: translated?.userMessage !== rawReason ? rawReason : null
      };
    }

    // Priority 2: Check if computation failed (missing thresholds or risk data)
    if (!report.thresholds || !report.risk) {
      const translated = rawReason ? translateError(rawReason) : null;
      return {
        status: "data_issues",
        reason: translated?.userMessage || "Insufficient data to determine readiness status",
        rawReason: translated?.userMessage !== rawReason ? rawReason : null
      };
    }

    // Fallback: if no backend status and data is present, assume needs repair
    const translated = rawReason ? translateError(rawReason) : null;
    return {
      status: "needs_repair",
      reason: translated?.userMessage || "Status could not be determined from backend",
      rawReason: translated?.userMessage !== rawReason ? rawReason : null
    };
  };

  const { status, reason, rawReason } = determineStatus();

  // Extract report data — use backend thresholds when available
  const risk = report?.risk || {};
  const stressTest = report?.stress_test || {};
  const thresholds = report?.thresholds || {};
  const files = report?.files || {};
  const sensitivity = report?.sensitivity || null;

  // Use backend thresholds if available, fallback to safe defaults
  // Thresholds are used inline in metrics display below

  // Build metrics array
  const metrics = [
    {
      label: "Timeframe",
      value: report?.selected_timeframe || report?.timeframe || "Not available",
      icon: ClockIcon,
    },
    {
      label: "Best Pairs",
      value: stressTest?.winning_pairs?.length || 0,
      unit: "pairs",
      icon: TrendingUpIcon,
    },
    {
      label: "Profit Factor",
      value: risk?.profit_factor != null ? risk.profit_factor.toFixed(2) : null,
      icon: ChartBarIcon,
      threshold: `>= ${thresholds.min_profit_factor || 1.0}`,
    },
    {
      label: "Expectancy",
      value: risk?.expectancy != null ? risk.expectancy.toFixed(3) : null,
      icon: CurrencyDollarIcon,
    },
    {
      label: "Max Drawdown",
      value: risk?.max_drawdown_pct != null ? risk.max_drawdown_pct.toFixed(1) : null,
      unit: "%",
      icon: ChartBarIcon,
      threshold: `< ${thresholds.max_drawdown || 30}%`,
    },
    {
      label: "Trade Count",
      value: risk?.trade_count != null ? risk.trade_count : null,
      icon: ChartBarIcon,
    },
    {
      label: "Robustness",
      value: sensitivity?.robustness_score != null ? sensitivity.robustness_score.toFixed(2) : null,
      icon: ShieldCheckIcon,
    },
    {
      label: "Confidence Score",
      value: report?.score != null ? report.score.toFixed(1) : null,
      unit: "%",
      icon: CheckCircleIcon,
    },
  ];

  return (
    <div className="card bg-base-100 border border-base-200">
      <div className="card-body p-5">
        <div className="flex items-center gap-2 mb-4">
          <ChartBarIcon className="h-5 w-5 text-primary/60" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Final Result</h2>
        </div>

        {/* Status Banner */}
        <StatusBanner status={status} reason={reason} rawReason={rawReason} />

        {/* Metrics Grid */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider mb-3">
            Performance Metrics
          </h3>
          <MetricGrid metrics={metrics} />
        </div>

        {/* Additional Details */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Selected Pairs */}
          {stressTest?.winning_pairs?.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
                Selected Pairs
              </h4>
              <div className="flex flex-wrap gap-1">
                {stressTest.winning_pairs.slice(0, 10).map((pair, idx) => (
                  <span key={idx} className="badge badge-xs badge-success badge-outline">
                    {pair}
                  </span>
                ))}
                {stressTest.winning_pairs.length > 10 && (
                  <span className="badge badge-xs badge-ghost">
                    +{stressTest.winning_pairs.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Configuration Summary */}
          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
              Configuration
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-base-content/60">Exchange:</span>
                <span className="font-mono">{report?.exchange || "Not available"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Trading Style:</span>
                <span className="font-mono capitalize">{report?.trading_style || "Not available"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/60">Risk Profile:</span>
                <span className="font-mono capitalize">{report?.risk_profile || "Not available"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Exported Files */}
        <div>
          <h3 className="text-xs font-semibold text-base-content/70 uppercase tracking-wider mb-3">
            Exported Files
          </h3>
          <FileList files={files} onDownload={onDownload} />
        </div>
      </div>
    </div>
  );
}
