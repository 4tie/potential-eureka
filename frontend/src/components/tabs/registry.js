/**
 * Tab Registry
 * Central registry for all application tabs with their components and metadata
 */

import BacktestForm from "../BacktestForm.jsx";
import ResultsView from "../ResultsView.jsx";
import SettingsTab from "../SettingsTab.jsx";
import StressTestTab from "../StressTestTab.jsx";
import OptimizerTab from "../OptimizerTab.jsx";
import StrategyEditorTab from "../StrategyEditorTab.jsx";
import PerformanceTab from "../PerformanceTab.jsx";
import PairExplorerTab from "../PairExplorerTab.jsx";
import AutoQuantControlCenter from "../AutoQuantControlCenter.jsx";
import StrategyLabTab from "../StrategyLabTab.jsx";
import AssistantTab from "../AssistantTab.jsx";
import QuantTab from "../QuantTab.jsx";
import OverviewTab from "../OverviewTab.jsx";
import AgentsTab from "../AgentsTab.jsx";
import TasksTab from "../TasksTab.jsx";
import ScheduleTab from "../ScheduleTab.jsx";
import ContentTab from "../ContentTab.jsx";

// Navigation tab mapping - maps 5 main nav tabs to sub-tabs
export const NAV_TABS = {
  overview: {
    id: "overview",
    label: "Overview",
    subTabs: ["overview"],
  },
  agents: {
    id: "agents",
    label: "Agents",
    subTabs: ["agents", "ai-assistant", "auto-quant"],
  },
  tasks: {
    id: "tasks",
    label: "Tasks",
    subTabs: ["tasks", "backtest", "optimizer", "stress-test"],
  },
  schedule: {
    id: "schedule",
    label: "Schedule",
    subTabs: ["schedule", "strategy-lab", "strategy-editor"],
  },
  content: {
    id: "content",
    label: "Content",
    subTabs: ["content", "results", "performance", "pair-explorer", "quant", "settings"],
  },
};

// Helper to find which nav tab a sub-tab belongs to
export const getNavTabForSubTab = (subTabId) => {
  for (const [navTabId, navTab] of Object.entries(NAV_TABS)) {
    if (navTab.subTabs.includes(subTabId)) {
      return navTabId;
    }
  }
  return "overview"; // Default
};

export const TAB_REGISTRY = {
  overview: {
    id: "overview",
    label: "Overview",
    component: OverviewTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  agents: {
    id: "agents",
    label: "Agents",
    component: AgentsTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  tasks: {
    id: "tasks",
    label: "Tasks",
    component: TasksTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  schedule: {
    id: "schedule",
    label: "Schedule",
    component: ScheduleTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  content: {
    id: "content",
    label: "Content",
    component: ContentTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  backtest: {
    id: "backtest",
    label: "Backtest",
    component: BacktestForm,
    requiresStrategies: true,
    requiresPairs: true,
    requiresSharedState: true,
    askAiEnabled: false,
  },
  results: {
    id: "results",
    label: "Results",
    component: ResultsView,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: true,
  },
  "stress-test": {
    id: "stress-test",
    label: "Stress Test Lab",
    component: StressTestTab,
    requiresStrategies: true,
    requiresPairs: true,
    requiresSharedState: true,
    askAiEnabled: false,
  },
  optimizer: {
    id: "optimizer",
    label: "Optimizer",
    component: OptimizerTab,
    requiresStrategies: true,
    requiresPairs: false,
    requiresSharedState: true,
    askAiEnabled: true,
    supportsAgentContext: true,
  },
  "pair-explorer": {
    id: "pair-explorer",
    label: "Pair Explorer",
    component: PairExplorerTab,
    requiresStrategies: true,
    requiresPairs: false,
    requiresSharedState: true,
    askAiEnabled: false,
  },
  "auto-quant": {
    id: "auto-quant",
    label: "Auto-Quant Control Center",
    component: AutoQuantControlCenter,
    requiresStrategies: true,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: true,
    supportsAgentContext: true,
  },
  "strategy-editor": {
    id: "strategy-editor",
    label: "Strategy Editor",
    component: StrategyEditorTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: true,
    supportsAgentContext: true,
    dirtyTracking: true,
  },
  performance: {
    id: "performance",
    label: "Performance",
    component: PerformanceTab,
    requiresStrategies: true,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: true,
    supportsAgentContext: true,
  },
  "strategy-lab": {
    id: "strategy-lab",
    label: "Strategy Lab",
    component: StrategyLabTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  "ai-assistant": {
    id: "ai-assistant",
    label: "AI Assistant",
    component: AssistantTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  quant: {
    id: "quant",
    label: "Quant",
    component: QuantTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
  settings: {
    id: "settings",
    label: "Settings",
    component: SettingsTab,
    requiresStrategies: false,
    requiresPairs: false,
    requiresSharedState: false,
    askAiEnabled: false,
  },
};

export const TAB_LABELS = Object.fromEntries(
  Object.values(TAB_REGISTRY).map(tab => [tab.id, tab.label])
);

export const ASK_AI_TABS = new Set(
  Object.values(TAB_REGISTRY)
    .filter(tab => tab.askAiEnabled)
    .map(tab => tab.id)
);

export const getTabComponent = (tabId) => {
  return TAB_REGISTRY[tabId]?.component || null;
};

export const getTabConfig = (tabId) => {
  return TAB_REGISTRY[tabId] || null;
};
