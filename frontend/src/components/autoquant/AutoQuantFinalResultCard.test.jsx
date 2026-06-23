import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import AutoQuantFinalResultCard from "./AutoQuantFinalResultCard";

describe("AutoQuantFinalResultCard", () => {
  const mockReport = {
    validation_status: "export_ready",
    readiness_label: "Export Ready",
    validation_notes: "All checks passed",
    selected_timeframe: "5m",
    timeframe: "5m",
    risk: {
      profit_factor: 2.5,
      expectancy: 0.15,
      max_drawdown_pct: 15.5,
      trade_count: 150,
    },
    stress_test: {
      winning_pairs: ["BTC/USDT", "ETH/USDT", "BNB/USDT"],
    },
    thresholds: {
      min_profit_factor: 1.5,
      max_drawdown: 25,
    },
    sensitivity: {
      robustness_score: 0.85,
    },
    score: 92.5,
    exchange: "binance",
    trading_style: "swing",
    risk_profile: "balanced",
    files: {
      optimized_strategy: "strategy_optimized.py",
      config: "config.json",
    },
  };

  it("should render export ready status", () => {
    render(<AutoQuantFinalResultCard report={mockReport} onDownload={() => {}} />);
    expect(screen.getByText("Export Ready")).toBeInTheDocument();
  });

  it("should render needs repair status", () => {
    const report = {...mockReport, validation_status: "needs_repair", readiness_label: "Needs Repair", validation_notes: "Issues found"};
    render(<AutoQuantFinalResultCard report={report} onDownload={() => {}} />);
    expect(screen.getByText("Needs Repair")).toBeInTheDocument();
  });

  it("should render rejected status", () => {
    const report = {...mockReport, validation_status: "rejected", readiness_label: "Rejected", validation_notes: "Did not meet thresholds"};
    render(<AutoQuantFinalResultCard report={report} onDownload={() => {}} />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("should render data issues status", () => {
    const report = {...mockReport, validation_status: "data_issues", readiness_label: "Data Issues", validation_notes: "Data quality problems"};
    render(<AutoQuantFinalResultCard report={report} onDownload={() => {}} />);
    expect(screen.getByText("Data Issues")).toBeInTheDocument();
  });

  it("should render performance metrics", () => {
    render(<AutoQuantFinalResultCard report={mockReport} onDownload={() => {}} />);
    expect(screen.getByText("Performance Metrics")).toBeInTheDocument();
    expect(screen.getByText(/Timeframe/)).toBeInTheDocument();
    expect(screen.getByText(/Best Pairs/)).toBeInTheDocument();
    expect(screen.getByText(/Profit Factor/)).toBeInTheDocument();
    expect(screen.getByText(/Expectancy/)).toBeInTheDocument();
    expect(screen.getByText(/Max Drawdown/)).toBeInTheDocument();
    expect(screen.getByText(/Trade Count/)).toBeInTheDocument();
    expect(screen.getByText(/Robustness/)).toBeInTheDocument();
    expect(screen.getByText(/Confidence Score/)).toBeInTheDocument();
  });

  it("should render metric values correctly", () => {
    render(<AutoQuantFinalResultCard report={mockReport} onDownload={() => {}} />);
    expect(screen.getByText("5m")).toBeInTheDocument();
    expect(screen.getByText("3 pairs")).toBeInTheDocument();
    expect(screen.getByText("2.50")).toBeInTheDocument();
    expect(screen.getByText("0.150")).toBeInTheDocument();
    expect(screen.getByText("15.5%")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("0.85")).toBeInTheDocument();
    expect(screen.getByText("92.5%")).toBeInTheDocument();
  });

  it("should render selected pairs", () => {
    render(<AutoQuantFinalResultCard report={mockReport} onDownload={() => {}} />);
    expect(screen.getByText("Selected Pairs")).toBeInTheDocument();
    expect(screen.getByText("BTC/USDT")).toBeInTheDocument();
    expect(screen.getByText("ETH/USDT")).toBeInTheDocument();
    expect(screen.getByText("BNB/USDT")).toBeInTheDocument();
  });

  it("should render configuration summary", () => {
    render(<AutoQuantFinalResultCard report={mockReport} onDownload={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("binance")).toBeInTheDocument();
    expect(screen.getByText("swing")).toBeInTheDocument();
    expect(screen.getByText("balanced")).toBeInTheDocument();
  });

  it("should render exported files", () => {
    render(<AutoQuantFinalResultCard report={mockReport} onDownload={() => {}} />);
    expect(screen.getByText("Exported Files")).toBeInTheDocument();
    expect(screen.getByText("strategy_optimized.py")).toBeInTheDocument();
    expect(screen.getByText("config.json")).toBeInTheDocument();
  });

  it("should call download handler when file is clicked", () => {
    const handleDownload = jest.fn();
    render(<AutoQuantFinalResultCard report={mockReport} onDownload={handleDownload} />);
    
    const strategyButton = screen.getByText("strategy_optimized.py").closest("button");
    strategyButton.click();
    
    expect(handleDownload).toHaveBeenCalledWith("strategy_optimized.py");
  });

  it("should handle null report gracefully", () => {
    render(<AutoQuantFinalResultCard report={null} onDownload={() => {}} />);
    expect(screen.getByText("Data Issues")).toBeInTheDocument();
    expect(screen.getByText("Report data not available")).toBeInTheDocument();
  });

  it("should display Not available for missing metrics", () => {
    const incompleteReport = {
      ...mockReport,
      risk: {},
      stress_test: {},
      sensitivity: null,
      score: null,
    };
    render(<AutoQuantFinalResultCard report={incompleteReport} onDownload={() => {}} />);
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
  });

  it("should display no files generated when files are empty", () => {
    const noFilesReport = {...mockReport, files: {}};
    render(<AutoQuantFinalResultCard report={noFilesReport} onDownload={() => {}} />);
    expect(screen.getByText("No files generated")).toBeInTheDocument();
  });

  it("should handle large pair lists with truncation", () => {
    const manyPairsReport = {
      ...mockReport,
      stress_test: {
        winning_pairs: Array.from({length: 15}, (_, i) => `PAIR${i}/USDT`),
      },
    };
    render(<AutoQuantFinalResultCard report={manyPairsReport} onDownload={() => {}} />);
    expect(screen.getByText(/\+5 more/)).toBeInTheDocument();
  });
});
