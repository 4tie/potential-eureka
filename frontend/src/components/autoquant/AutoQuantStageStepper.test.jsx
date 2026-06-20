/* global describe, expect, test, jest */
import { render } from "@testing-library/react";
import AutoQuantStageStepper from "./AutoQuantStageStepper";

// Mock the constants and utils
jest.mock("../../features/autoquant/constants", () => ({
  STAGE_ICONS: ["①", "②", "③", "④", "⑤", "⑥", "⑦"],
}));

jest.mock("../../features/autoquant/utils", () => ({
  fmtMmSs: (secs) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, "0")}`,
}));

describe("AutoQuantStageStepper", () => {
  const mockStages = [
    { index: 0, name: "Pre-selection", status: "pending" },
    { index: 1, name: "Pair Screening", status: "pending" },
    { index: 2, name: "Optimization", status: "pending" },
  ];

  test("renders stages with pending status", () => {
    const { getByText } = render(
      <AutoQuantStageStepper stages={mockStages} nowMs={null} />
    );

    expect(getByText(/Pre-selection/)).toBeInTheDocument();
    expect(getByText(/Pair Screening/)).toBeInTheDocument();
    expect(getByText(/Optimization/)).toBeInTheDocument();
  });

  test("renders running stage with spinner and live badge", () => {
    const runningStages = [
      { index: 0, name: "Pre-selection", status: "passed" },
      { index: 1, name: "Pair Screening", status: "running", started_at: new Date().toISOString() },
      { index: 2, name: "Optimization", status: "pending" },
    ];

    const { getByText } = render(
      <AutoQuantStageStepper stages={runningStages} nowMs={Date.now()} />
    );

    expect(getByText("live")).toBeInTheDocument();
  });

  test("renders passed stage with checkmark", () => {
    const passedStages = [
      { index: 0, name: "Pre-selection", status: "passed", duration_s: 45 },
      { index: 1, name: "Pair Screening", status: "pending" },
      { index: 2, name: "Optimization", status: "pending" },
    ];

    const { getByText } = render(
      <AutoQuantStageStepper stages={passedStages} nowMs={null} />
    );

    expect(getByText("✓")).toBeInTheDocument();
    expect(getByText("45s")).toBeInTheDocument();
  });

  test("renders failed stage with X and error details", () => {
    const failedStages = [
      { index: 0, name: "Pre-selection", status: "failed", message: "Insufficient data" },
      { index: 1, name: "Pair Screening", status: "pending" },
      { index: 2, name: "Optimization", status: "pending" },
    ];

    const { getByText } = render(
      <AutoQuantStageStepper stages={failedStages} nowMs={null} />
    );

    expect(getByText("✗")).toBeInTheDocument();
    expect(getByText("Error details")).toBeInTheDocument();
    expect(getByText("Insufficient data")).toBeInTheDocument();
  });

  test("displays stage data when passed", () => {
    const dataStages = [
      {
        index: 0,
        name: "Pre-selection",
        status: "passed",
        data: {
          profit_total_abs: 150.5,
          max_drawdown_account: 0.15,
          trade_count: 42,
        },
      },
      { index: 1, name: "Pair Screening", status: "pending" },
      { index: 2, name: "Optimization", status: "pending" },
    ];

    const { getByText } = render(
      <AutoQuantStageStepper stages={dataStages} nowMs={null} />
    );

    expect(getByText(/P: \+150\.500/)).toBeInTheDocument();
    expect(getByText("DD: 15.0%")).toBeInTheDocument();
    expect(getByText("T: 42")).toBeInTheDocument();
  });

  test("displays negative profit correctly", () => {
    const dataStages = [
      {
        index: 0,
        name: "Pre-selection",
        status: "passed",
        data: {
          profit_total_abs: -25.3,
        },
      },
      { index: 1, name: "Pair Screening", status: "pending" },
      { index: 2, name: "Optimization", status: "pending" },
    ];

    const { getByText } = render(
      <AutoQuantStageStepper stages={dataStages} nowMs={null} />
    );

    expect(getByText(/P: -25\.300/)).toBeInTheDocument();
  });

  test("displays elapsed time for running stage", () => {
    const runningStages = [
      { index: 0, name: "Pre-selection", status: "passed" },
      {
        index: 1,
        name: "Pair Screening",
        status: "running",
        started_at: new Date(Date.now() - 65000).toISOString(),
      },
      { index: 2, name: "Optimization", status: "pending" },
    ];

    const { getByText } = render(
      <AutoQuantStageStepper stages={runningStages} nowMs={Date.now()} />
    );

    expect(getByText(/1:0\d/)).toBeInTheDocument(); // Should show ~1:05
  });

  test("displays stage message when passed", () => {
    const messageStages = [
      {
        index: 0,
        name: "Pre-selection",
        status: "passed",
        message: "5 pairs passed filtering",
      },
      { index: 1, name: "Pair Screening", status: "pending" },
      { index: 2, name: "Optimization", status: "pending" },
    ];

    const { getByText } = render(
      <AutoQuantStageStepper stages={messageStages} nowMs={null} />
    );

    expect(getByText("5 pairs passed filtering")).toBeInTheDocument();
  });

  test("applies correct color classes for each status", () => {
    const mixedStages = [
      { index: 0, name: "Pre-selection", status: "passed" },
      { index: 1, name: "Pair Screening", status: "running", started_at: new Date().toISOString() },
      { index: 2, name: "Optimization", status: "failed", message: "Error" },
    ];

    const { container } = render(
      <AutoQuantStageStepper stages={mixedStages} nowMs={Date.now()} />
    );

    expect(container.querySelector(".bg-success\\/15")).toBeInTheDocument();
    expect(container.querySelector(".bg-primary\\/20")).toBeInTheDocument();
    expect(container.querySelector(".bg-error\\/15")).toBeInTheDocument();
  });

  test("renders connector lines between stages", () => {
    const { container } = render(
      <AutoQuantStageStepper stages={mockStages} nowMs={null} />
    );

    const connectors = container.querySelectorAll(".w-px");
    expect(connectors.length).toBeGreaterThan(0);
  });
});
