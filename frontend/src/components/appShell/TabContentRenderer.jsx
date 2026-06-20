import BacktestResults from "../BacktestResults.jsx";
import ErrorBoundary from "../ErrorBoundary.jsx";
import ResultsView from "../ResultsView.jsx";
import { getTabConfig } from "../tabs/registry.js";

function ResultsTabContent({ activeResult, clearActiveResult, handleLoadResult }) {
  return (
    <ErrorBoundary tabName="Results">
      {activeResult ? (
        <div className="py-6">
          <div className="mx-auto w-full max-w-5xl px-6 mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Result Details</h2>
            <button className="btn btn-sm btn-ghost" onClick={clearActiveResult}>
              &larr; Back to list
            </button>
          </div>
          <BacktestResults results={activeResult.results} runId={activeResult.run_id} />
        </div>
      ) : (
        <ResultsView onLoadResult={handleLoadResult} />
      )}
    </ErrorBoundary>
  );
}

function BacktestTabContent({ component: TabComponent, tabProps }) {
  const {
    strategies,
    strategiesLoading,
    availablePairs,
    searchPairs,
    sharedState,
    sharedLoading,
    syncSharedState,
  } = tabProps;

  return (
    <ErrorBoundary tabName="Backtest">
      <TabComponent
        strategies={strategies}
        strategiesLoading={strategiesLoading}
        availablePairs={availablePairs}
        searchPairs={searchPairs}
        sharedState={sharedState}
        sharedLoading={sharedLoading}
        syncSharedState={syncSharedState}
      />
    </ErrorBoundary>
  );
}

export default function TabContentRenderer({ activeTab, tabProps }) {
  const tabConfig = getTabConfig(activeTab);
  if (!tabConfig) return null;

  const TabComponent = tabConfig.component;

  if (activeTab === "results") {
    return (
      <ResultsTabContent
        activeResult={tabProps.activeResult}
        clearActiveResult={tabProps.clearActiveResult}
        handleLoadResult={tabProps.handleLoadResult}
      />
    );
  }

  if (activeTab === "backtest") {
    return <BacktestTabContent component={TabComponent} tabProps={tabProps} />;
  }

  return (
    <ErrorBoundary tabName={tabConfig.label}>
      <TabComponent {...tabProps} />
    </ErrorBoundary>
  );
}
