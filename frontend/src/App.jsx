import { useState, useCallback, useEffect } from "react";
import { useSharedState } from "./hooks/useSharedState.js";
import { useStrategies } from "./hooks/useStrategies.js";
import { usePairs } from "./hooks/usePairs.js";
import { useTheme } from "./hooks/useTheme.js";
import { useAgentUiState } from "./hooks/useAgentUiState.js";
import TopNav from "./components/TopNav.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import AssistantDrawer from "./components/appShell/AssistantDrawer.jsx";
import TabContentRenderer from "./components/appShell/TabContentRenderer.jsx";
import UnsavedChangesDialog from "./components/appShell/UnsavedChangesDialog.jsx";
import { buildAgentContext } from "./components/appShell/agentContext.js";

function App() {
  const [activeNavTab, setActiveNavTab] = useState("auto-quant");
  const [activeTab,    setActiveTab]    = useState("auto-quant");
  const [activeResult, setActiveResult] = useState(null);
  const [pendingTab,   setPendingTab]   = useState(null);
  const [backendOnline, setBackendOnline] = useState(true);
  const [agentTabContext, setAgentTabContext] = useState({});
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState({});
  const [strategyEditorDirty, setStrategyEditorDirty] = useState(false);

  useTheme();
  const syncAgentUiState = useAgentUiState();

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch("/health")
        .then(r => { if (!cancelled) setBackendOnline(r.ok); })
        .catch(() => { if (!cancelled) setBackendOnline(false); });
    };
    check();
    const id = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const { state: sharedState, loading: sharedLoading, sync: syncSharedState } = useSharedState();
  const isWorkRunning = sharedState?.isWorkRunning || false;
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { availablePairs, searchPairs } = usePairs();

  const handleLoadResult = (res) => {
    setActiveResult(res);
    setActiveTab("results");
    setActiveNavTab("results"); // With flat navigation, navTab equals tabId
  };

  const clearActiveResult = () => setActiveResult(null);

  const currentAgentOverrides = useCallback(() => (
    buildAgentContext({ activeTab, activeResult, agentTabContext })
  ), [activeResult, activeTab, agentTabContext]);

  const openAssistant = useCallback(() => {
    const overrides = currentAgentOverrides();
    setAssistantContext(overrides);
    setAssistantOpen(true);
    syncAgentUiState(overrides);
  }, [currentAgentOverrides, syncAgentUiState]);

  const handleNavTabChange = useCallback((navTab) => {
    if (navTab !== activeTab && activeTab === "strategy-editor" && strategyEditorDirty) {
      setPendingTab(navTab);
      return;
    }
    setActiveNavTab(navTab);
    // With flat navigation, navTab and activeTab are the same
    setActiveTab(navTab);
  }, [activeTab, strategyEditorDirty]);

  const confirmLeave = () => {
    const dest = pendingTab;
    setPendingTab(null);
    setAgentTabContext({});
    setStrategyEditorDirty(false);
    setActiveTab(dest);
    setActiveNavTab(dest); // With flat navigation, navTab equals tabId
    if (dest !== "results") setActiveResult(null);
  };

  const cancelLeave = () => setPendingTab(null);

  useEffect(() => {
    syncAgentUiState(currentAgentOverrides());
  }, [currentAgentOverrides, syncAgentUiState]);

  return (
    <ToastProvider>
      <ErrorBoundary tabName="App">
        <div className="h-screen flex flex-col bg-base-100 text-base-content overflow-hidden">
          <div className="bg-orbs" />
          <div className="bg-dot-grid" />
          
          <TopNav
            activeTab={activeNavTab}
            onChange={handleNavTabChange}
            backendOnline={backendOnline}
            isWorkRunning={isWorkRunning}
          />

          <main className="flex-1 min-w-0 overflow-y-auto pt-20 px-6 pb-6">
            <TabContentRenderer
              activeTab={activeTab}
              tabProps={{
                strategies,
                strategiesLoading,
                availablePairs,
                searchPairs,
                sharedState,
                sharedLoading,
                syncSharedState,
                activeResult,
                clearActiveResult,
                handleLoadResult,
                onAgentContextChange: setAgentTabContext,
                onDirtyChange: setStrategyEditorDirty,
                onAskAi: openAssistant,
              }}
            />
          </main>

          {assistantOpen && (
            <AssistantDrawer
              context={assistantContext}
              onClose={() => setAssistantOpen(false)}
            />
          )}

          {pendingTab && (
            <UnsavedChangesDialog
              onCancel={cancelLeave}
              onConfirm={confirmLeave}
            />
          )}
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;
