import { useState, useCallback, useEffect } from "react";
import { useSharedState } from "./hooks/useSharedState.js";
import { useStrategies } from "./hooks/useStrategies.js";
import { usePairs } from "./hooks/usePairs.js";
import { useTheme } from "./hooks/useTheme.js";
import { useAgentUiState } from "./hooks/useAgentUiState.js";
import NavPanel from "./components/NavPanel.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import AppHeader from "./components/appShell/AppHeader.jsx";
import AssistantDrawer from "./components/appShell/AssistantDrawer.jsx";
import TabContentRenderer from "./components/appShell/TabContentRenderer.jsx";
import UnsavedChangesDialog from "./components/appShell/UnsavedChangesDialog.jsx";
import { buildAgentContext } from "./components/appShell/agentContext.js";

function App() {
  const [activeTab,    setActiveTab]    = useState("backtest");
  const [activeResult, setActiveResult] = useState(null);
  const [editorDirty,  setEditorDirty]  = useState(false);
  const [pendingTab,   setPendingTab]   = useState(null);
  const [backendOnline, setBackendOnline] = useState(true);
  const [agentTabContext, setAgentTabContext] = useState({});
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState({});

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
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { availablePairs, searchPairs } = usePairs();

  const handleLoadResult = (res) => {
    setActiveResult(res);
    setActiveTab("results");
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

  const handleTabChange = useCallback((tab) => {
    if (activeTab === "strategy-editor" && editorDirty && tab !== "strategy-editor") {
      setPendingTab(tab);
      return;
    }
    setAgentTabContext({});
    setActiveTab(tab);
    if (tab !== "results") setActiveResult(null);
    if (tab !== "strategy-editor") {
      setEditorDirty(false);
    }
  }, [activeTab, editorDirty]);

  const confirmLeave = () => {
    const dest = pendingTab;
    setPendingTab(null);
    setEditorDirty(false);
    setAgentTabContext({});
    setActiveTab(dest);
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
          <AppHeader
            activeTab={activeTab}
            backendOnline={backendOnline}
            onAskAi={openAssistant}
          />

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <NavPanel activeItem={activeTab} onChange={handleTabChange} />

            <main className="flex-1 min-w-0 overflow-y-auto bg-base-100">
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
                  onDirtyChange: setEditorDirty,
                }}
              />
            </main>
          </div>

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
