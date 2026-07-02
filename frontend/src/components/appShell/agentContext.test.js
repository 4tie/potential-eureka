import { buildAgentContext } from "./agentContext.js";

describe("buildAgentContext", () => {
  test("returns neutral context for tabs without scoped agent context", () => {
    expect(buildAgentContext({
      activeTab: "backtest",
      activeResult: null,
      agentTabContext: {
        active_panel: "ignored",
        strategy_name: "IgnoredStrategy",
        auto_quant_run_id: "auto-1",
        optimizer_session_id: "optimizer-1",
        optimizer_trial_number: 4,
        backtest_run_id: "backtest-1",
        api_session_id: "api-1",
      },
    })).toEqual({
      active_tab: "backtest",
      active_panel: null,
      strategy_name: null,
      auto_quant_run_id: null,
      optimizer_session_id: null,
      optimizer_trial_number: null,
      backtest_run_id: null,
      api_session_id: null,
    });
  });

  test("keeps AutoQuant run context only on the AutoQuant tab", () => {
    expect(buildAgentContext({
      activeTab: "auto-quant",
      agentTabContext: {
        active_panel: "stage-2",
        strategy_name: "AutoQuantStrategy",
        auto_quant_run_id: "auto-run-1",
        optimizer_session_id: "optimizer-session-1",
      },
    })).toEqual({
      active_tab: "auto-quant",
      active_panel: "stage-2",
      strategy_name: "AutoQuantStrategy",
      auto_quant_run_id: "auto-run-1",
      optimizer_session_id: null,
      optimizer_trial_number: null,
      backtest_run_id: null,
      api_session_id: null,
    });
  });

  test("keeps optimizer session context only on the optimizer tab", () => {
    expect(buildAgentContext({
      activeTab: "optimizer",
      agentTabContext: {
        active_panel: "live",
        strategy_name: "OptimizerStrategy",
        auto_quant_run_id: "auto-run-1",
        optimizer_session_id: "optimizer-session-1",
        optimizer_trial_number: 7,
        api_session_id: "api-session-1",
      },
    })).toEqual({
      active_tab: "optimizer",
      active_panel: "live",
      strategy_name: "OptimizerStrategy",
      auto_quant_run_id: null,
      optimizer_session_id: "optimizer-session-1",
      optimizer_trial_number: 7,
      backtest_run_id: null,
      api_session_id: "api-session-1",
    });
  });

  test("uses active result as the results tab backtest run id", () => {
    expect(buildAgentContext({
      activeTab: "results",
      activeResult: { run_id: "result-run-1" },
      agentTabContext: {
        backtest_run_id: "stale-run",
        strategy_name: "IgnoredStrategy",
      },
    })).toEqual({
      active_tab: "results",
      active_panel: null,
      strategy_name: null,
      auto_quant_run_id: null,
      optimizer_session_id: null,
      optimizer_trial_number: null,
      backtest_run_id: "result-run-1",
      api_session_id: null,
    });
  });

  test("keeps generic scoped context for strategy editor and performance tabs", () => {
    expect(buildAgentContext({
      activeTab: "performance",
      agentTabContext: {
        active_panel: "details",
        strategy_name: "PerformanceStrategy",
        backtest_run_id: "backtest-run-1",
        api_session_id: "api-session-1",
      },
    })).toEqual({
      active_tab: "performance",
      active_panel: "details",
      strategy_name: "PerformanceStrategy",
      auto_quant_run_id: null,
      optimizer_session_id: null,
      optimizer_trial_number: null,
      backtest_run_id: "backtest-run-1",
      api_session_id: "api-session-1",
    });
  });
});
