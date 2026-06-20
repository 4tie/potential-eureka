/* global describe, expect, jest, test, beforeEach */
import { render, screen } from "@testing-library/react";
import AutoQuantFinalReport from "./AutoQuantFinalReport";

describe("AutoQuantFinalReport Integration Tests", () => {
  const mockReport = {
    run_id: "test-run-1",
    status: "completed",
    sanity_backtest: {
      profit_total_abs: 150.5,
    },
    oos_validation: {
      profit_total: 0.182,
    },
    risk: {
      max_drawdown_pct: 12,
      win_rate_pct: 65,
      checks: [
        { name: "Profit factor", passed: true, value: 2.1, threshold: 1 },
        { name: "Sharpe", passed: true, value: 1.8, threshold: 0.5 },
      ],
    },
    stress_test: {
      per_pair: [
        { key: "BTC/USDT", profit_total: 0.805 },
        { key: "ETH/USDT", profit_total: 0.7 },
      ],
      winning_pairs: [{ key: "BTC/USDT" }, { key: "ETH/USDT" }],
      failing_pairs: ["SOL/USDT"],
    },
    monte_carlo: {
      p95_max_drawdown: 0.22,
      p5_max_drawdown: 0.08,
      median_return: 0.11,
    },
    sensitivity: {
      verdict: "robust",
      score: 0.86,
    },
    ensemble_enabled: true,
    ensemble_weights: {
      rsi_weight: 0.4,
      macd_weight: 0.3,
      bb_weight: 0.3,
      consensus_threshold: 0.5,
    },
    equity_curves: {
      oos: [
        { timestamp: "2023-01-01", equity: 1000 },
        { timestamp: "2023-01-02", equity: 1050 },
        { timestamp: "2023-01-03", equity: 1150 },
        { timestamp: "2023-01-04", equity: 1180 },
        { timestamp: "2023-01-05", equity: 1210 },
      ],
    },
    files: {
      optimized_strategy: "OptimizedStrategy.py",
      config: "config.json",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders final report with all sections", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that main report sections are rendered
    expect(screen.getByText(/pipeline complete/i)).toBeInTheDocument();
    expect(screen.getAllByText(/profit/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sharpe/i)).toBeInTheDocument();
  });

  test("integrates metric cards with report data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that profit is displayed
    expect(screen.getByText(/150\.50/)).toBeInTheDocument();
    expect(screen.getByText(/18\.20/)).toBeInTheDocument();
  });

  test("integrates stress test pair data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    expect(screen.getByText(/stress test results/i)).toBeInTheDocument();
    expect(screen.getByText(/BTC\/USDT/i)).toBeInTheDocument();
    expect(screen.getByText(/ETH\/USDT/i)).toBeInTheDocument();
  });

  test("integrates Monte Carlo badge with report data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that Monte Carlo data is displayed
    expect(screen.getAllByText(/monte carlo/i).length).toBeGreaterThan(0);
  });

  test("integrates robustness badge with report data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that robustness data is displayed
    expect(screen.getAllByText(/robustness/i).length).toBeGreaterThan(0);
  });

  test("integrates signal strength visualization with report data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that signal strength is displayed
    expect(screen.getByText(/alpha signal composition/i)).toBeInTheDocument();
  });

  test("integrates per-pair profit chart with report data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that per-pair profit data is displayed
    expect(screen.getByText(/BTC\/USDT/i)).toBeInTheDocument();
    expect(screen.getByText(/ETH\/USDT/i)).toBeInTheDocument();
  });

  test("integrates equity curve chart with report data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that equity curve is displayed
    expect(screen.getByText(/equity curve/i)).toBeInTheDocument();
  });

  test("shows active threshold summary", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    expect(screen.getByText(/active thresholds/i)).toBeInTheDocument();
  });

  test("handles missing report data gracefully", () => {
    const incompleteReport = {
      run_id: "test-run-1",
      status: "completed",
      profit: null,
      sharpe: null,
    };

    render(<AutoQuantFinalReport report={incompleteReport} />);

    // Should still render without crashing
    expect(screen.getByText(/pipeline complete/i)).toBeInTheDocument();
  });

  test("displays download buttons for report files", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that download buttons are present
    const downloadButtons = screen.queryAllByText(/download/i);
    expect(downloadButtons.length).toBeGreaterThan(0);
  });

  test("formats profit values correctly", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that profit is formatted with appropriate precision
    expect(screen.getByText(/150\.50/)).toBeInTheDocument();
  });

  test("displays risk checks with report data", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Check that risk checks are displayed
    expect(screen.getByText(/risk checks/i)).toBeInTheDocument();
  });

  test("integrates all extracted components in final report", () => {
    render(<AutoQuantFinalReport report={mockReport} />);

    // Verify that key components are present
    expect(screen.getAllByText(/profit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/drawdown/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/win rate/i)).toBeInTheDocument();
  });
});
