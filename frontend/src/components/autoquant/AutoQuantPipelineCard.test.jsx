import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import AutoQuantPipelineCard from "./AutoQuantPipelineCard";

describe("AutoQuantPipelineCard", () => {
  const mockStage = {
    index: 0,
    name: "Sanity Backtest",
    status: "pending",
    message: "",
    data: {},
  };

  it("should render pipeline card for pending stage", () => {
    render(<AutoQuantPipelineCard stage={{...mockStage, status: "pending"}} />);
    expect(screen.getByText("Portfolio Baseline Backtest")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("should render pipeline card for running stage", () => {
    render(<AutoQuantPipelineCard stage={{...mockStage, status: "running", message: "Processing..."}} />);
    expect(screen.getByText("Portfolio Baseline Backtest")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    // Message is shown in expanded section when running
  });

  it("should render pipeline card for passed stage", () => {
    render(<AutoQuantPipelineCard stage={{...mockStage, status: "passed", message: "Completed successfully", duration_s: 45}} />);
    expect(screen.getByText("Portfolio Baseline Backtest")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Completed successfully")).toBeInTheDocument();
    expect(screen.getByText("45s")).toBeInTheDocument();
  });

  it("should render pipeline card for failed stage", () => {
    render(<AutoQuantPipelineCard stage={{...mockStage, status: "failed", message: "Error occurred"}} />);
    expect(screen.getByText("Portfolio Baseline Backtest")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Error occurred")).toBeInTheDocument();
  });

  it("should render pipeline card for warning stage", () => {
    render(<AutoQuantPipelineCard stage={{...mockStage, status: "warning"}} />);
    expect(screen.getByText("Portfolio Baseline Backtest")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("should expand when isExpanded is true", () => {
    render(<AutoQuantPipelineCard stage={mockStage} isExpanded={true} />);
    // Should show technical details when expanded
    expect(screen.getByText("Why this matters")).toBeInTheDocument();
  });

  it("should not show technical details when collapsed", () => {
    render(<AutoQuantPipelineCard stage={mockStage} isExpanded={false} />);
    // Should not show technical details when collapsed
    expect(screen.queryByText("Why this matters")).not.toBeInTheDocument();
  });

  it("should render stage data when available", () => {
    const stageWithData = {
      ...mockStage,
      status: "passed",
      data: {
        profit_total_abs: 150.5,
        max_drawdown_account: 0.15,
        trade_count: 45,
      },
    };
    render(<AutoQuantPipelineCard stage={stageWithData} isExpanded={true} />);
    expect(screen.getByText(/profit/i)).toBeInTheDocument();
    expect(screen.getByText(/drawdown/i)).toBeInTheDocument();
  });

  it("should render warnings when present in data", () => {
    const stageWithWarnings = {
      ...mockStage,
      status: "warning",
      data: {
        warnings: ["High drawdown detected", "Low win rate"],
      },
    };
    render(<AutoQuantPipelineCard stage={stageWithWarnings} isExpanded={true} />);
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    // Warnings are translated by errorTranslator - just verify the section renders
  });

  it("should render errors when present in data", () => {
    const stageWithErrors = {
      ...mockStage,
      status: "failed",
      data: {
        errors: ["Configuration error", "Missing parameter"],
      },
    };
    render(<AutoQuantPipelineCard stage={stageWithErrors} isExpanded={true} />);
    expect(screen.getByText("Errors")).toBeInTheDocument();
    expect(screen.getByText("Configuration error")).toBeInTheDocument();
    expect(screen.getByText("Missing parameter")).toBeInTheDocument();
  });

  it("should handle unknown stage names gracefully", () => {
    render(<AutoQuantPipelineCard stage={{...mockStage, name: "Unknown Step"}} />);
    expect(screen.getByText("Unknown Step")).toBeInTheDocument();
    expect(screen.getByText("Processing pipeline step...")).toBeInTheDocument();
  });

  it("should handle null stage gracefully", () => {
    render(<AutoQuantPipelineCard stage={null} />);
    expect(screen.getByText("Unknown Step")).toBeInTheDocument();
  });
});
