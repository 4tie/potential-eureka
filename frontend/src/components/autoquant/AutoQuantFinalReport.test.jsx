import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import AutoQuantFinalReport from "./AutoQuantFinalReport";

describe("AutoQuantFinalReport", () => {
  const mockReport = {
    risk: {
      profit_factor: 2.5,
      max_drawdown_pct: 15.5,
      win_rate_pct: 55.0,
    },
    oos_validation: {
      profit_total: 0.12,
    },
    sanity_backtest: {
      profit_total_abs: 1250.50,
    },
    stress_test: {
      winning_pairs: ["BTC/USDT", "ETH/USDT"],
      failing_pairs: [],
      per_pair: [],
    },
    thresholds: {
      max_drawdown: 30,
      min_win_rate: 40,
      min_profit_factor: 1.0,
      min_sharpe: 0.5,
      min_oos_profit: 0,
      monte_carlo_threshold: 0.35,
    },
    monte_carlo: {
      p95_loss_pct: 0.25,
    },
    files: {
      optimized_strategy: "strategy_optimized.py",
      config: "config.json",
    },
    selected_pair_universe: ["BTC/USDT", "ETH/USDT"],
    timeframe: "5m",
    selected_timeframe: "5m",
    exchange: "binance",
  };

  it("should render retry history with flat AutoQuant pipeline shape", () => {
    const reportWithFlatRetry = {
      ...mockReport,
      retry_history: [
        {
          attempt: 1,
          label: "Initial",
          loss: "OnlyProfitHyperOptLoss",
          spaces: ["buy", "stoploss", "roi"],
          epochs: 200,
          profit: 1250.50,
          drawdown: 15.5,
          trades: 150,
          reason: "Baseline optimization",
          passed: true,
        },
        {
          attempt: 2,
          label: "Retry 1",
          loss: "OnlyProfitHyperOptLoss",
          spaces: ["buy", "stoploss"],
          epochs: 150,
          profit: 980.25,
          drawdown: 18.2,
          trades: 120,
          reason: "Reduced parameter space",
          passed: false,
        },
      ],
    };

    render(<AutoQuantFinalReport report={reportWithFlatRetry} runId="test-run" expectedPairs={["BTC/USDT", "ETH/USDT"]} expectedTimeframe="5m" />);

    expect(screen.getByText("Retry History (2)")).toBeInTheDocument();
    expect(screen.getByText("1 / Initial")).toBeInTheDocument();
    expect(screen.getByText("2 / Retry 1")).toBeInTheDocument();
    expect(screen.getByText("Baseline optimization")).toBeInTheDocument();
    expect(screen.getByText("Reduced parameter space")).toBeInTheDocument();
    expect(screen.getByText("OnlyProfitHyperOptLoss")).toBeInTheDocument();
    expect(screen.getByText(/buy, stoploss, roi/)).toBeInTheDocument();
    expect(screen.getByText(/buy, stoploss/)).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("1250.5")).toBeInTheDocument();
    expect(screen.getByText("980.25")).toBeInTheDocument();
  });

  it("should render retry history with nested RetryAttempt shape (fallback)", () => {
    const reportWithNestedRetry = {
      ...mockReport,
      retry_history: [
        {
          attempt: 1,
          error_code: "optimization_failed",
          action: "adjust_parameters",
          before: {
            loss: "OnlyProfitHyperOptLoss",
            spaces: ["buy", "stoploss", "roi"],
            epochs: 200,
          },
          after: {
            loss: "OnlyProfitHyperOptLoss",
            spaces: ["buy", "stoploss"],
            epochs: 150,
          },
          status: "improved",
          metrics_before: {
            profit: 980.25,
          },
          metrics_after: {
            profit: 1250.50,
          },
          accepted: true,
          reason: "Parameter adjustment improved results",
        },
      ],
    };

    render(<AutoQuantFinalReport report={reportWithNestedRetry} runId="test-run" expectedPairs={["BTC/USDT", "ETH/USDT"]} expectedTimeframe="5m" />);

    expect(screen.getByText("Retry History (1)")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Parameter adjustment improved results")).toBeInTheDocument();
    expect(screen.getByText("OnlyProfitHyperOptLoss")).toBeInTheDocument();
    expect(screen.getByText(/buy, stoploss, roi/)).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("1250.5")).toBeInTheDocument();
  });

  it("should handle missing retry history gracefully", () => {
    const reportWithoutRetry = {
      ...mockReport,
      retry_history: [],
    };

    render(<AutoQuantFinalReport report={reportWithoutRetry} runId="test-run" expectedPairs={["BTC/USDT", "ETH/USDT"]} expectedTimeframe="5m" />);

    expect(screen.queryByText("Retry History")).not.toBeInTheDocument();
  });
});
