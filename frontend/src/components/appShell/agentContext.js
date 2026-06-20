const AGENT_CONTEXT_TABS = new Set([
  "auto-quant",
  "optimizer",
  "strategy-editor",
  "performance",
]);

export function buildAgentContext({ activeTab, activeResult, agentTabContext }) {
  const scoped = AGENT_CONTEXT_TABS.has(activeTab) ? agentTabContext || {} : {};

  return {
    active_tab: activeTab,
    active_panel: scoped.active_panel ?? null,
    strategy_name: scoped.strategy_name ?? null,
    auto_quant_run_id: activeTab === "auto-quant" ? scoped.auto_quant_run_id ?? null : null,
    optimizer_session_id: activeTab === "optimizer" ? scoped.optimizer_session_id ?? null : null,
    optimizer_trial_number: activeTab === "optimizer" ? scoped.optimizer_trial_number ?? null : null,
    backtest_run_id: activeTab === "results" ? activeResult?.run_id ?? null : scoped.backtest_run_id ?? null,
    api_session_id: scoped.api_session_id ?? null,
  };
}
