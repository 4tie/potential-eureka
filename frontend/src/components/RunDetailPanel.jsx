import { useState } from "react";
import {
  ChevronLeftIcon,
} from "@heroicons/react/24/outline";
import RunDetailSummary from "./RunDetailSummary/index";
import RunDetailParameters from "./RunDetailParameters";
import RunDetailPairs from "./RunDetailPairs";
import RunDetailStages from "./RunDetailStages";
import ProfessionalChartsTab from "./ProfessionalChartsTab";

/**
 * RunDetailPanel: Full-screen detail view for a completed run
 * Shows tabbed interface with Summary | Parameters | Pairs | Stages
 * Plus export cards at the bottom
 */
const RunDetailPanel = ({ run, onClose, API_BASE }) => {
  const [activeTab, setActiveTab] = useState("summary");

  if (!run) return null;

  const tabs = [
    { id: "summary", label: "Summary", icon: "📊" },
    { id: "parameters", label: "Parameters", icon: "⚙️" },
    { id: "pairs", label: "Pairs", icon: "💱" },
    { id: "stages", label: "Stages", icon: "📈" },
    { id: "charts", label: "Professional Charts", icon: "📉" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-base-300/80 flex flex-col">
      {/* Header */}
      <div className="bg-base-200 text-base-content px-6 py-4 flex items-center justify-between border-b border-base-300 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition hover:bg-base-300 text-base-content/80 hover:text-base-content"
            title="Close"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{run.strategy}</h2>
            <p className="text-base-content/70 text-sm">
              {run.status === "completed" && "✓ Completed"}
              {run.status === "failed" && "✗ Failed"}
              {run.status === "running" && "⏳ Running"}
              {run.status === "interrupted" && "⚠ Interrupted"}
              {" • "}
              {new Date(run.created_at).toLocaleDateString()}
              {" • "}
              Run ID: {run.run_id.slice(0, 8)}...
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {run.status === "completed" && (
            <span className="badge badge-success badge-outline text-xs font-semibold">
              ✓ Complete
            </span>
          )}
          {run.status === "failed" && (
            <span className="badge badge-error badge-outline text-xs font-semibold">
              ✗ Failed
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-base-100 border-b border-base-300 px-6 shrink-0">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-medium text-sm transition border-b-2 rounded-t-md ${
                activeTab === tab.id
                  ? "border-primary text-primary bg-base-200"
                  : "border-transparent text-base-content/60 hover:text-base-content hover:bg-base-200"
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content - Scrollable */}
      <div className="overflow-y-auto flex-1 min-h-0">
        <div className="p-6 max-w-7xl mx-auto">
          {activeTab === "summary" && (
            <RunDetailSummary run={run} API_BASE={API_BASE} />
          )}
          {activeTab === "parameters" && (
            <RunDetailParameters run={run} />
          )}
          {activeTab === "pairs" && (
            <RunDetailPairs run={run} />
          )}
          {activeTab === "stages" && (
            <RunDetailStages run={run} />
          )}
          {activeTab === "charts" && (
            <ProfessionalChartsTab runId={run.run_id} runType="backtest" />
          )}
        </div>
      </div>
    </div>
  );
};

export default RunDetailPanel;
