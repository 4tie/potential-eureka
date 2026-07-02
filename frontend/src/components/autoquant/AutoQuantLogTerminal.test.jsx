import { render } from "@testing-library/react";
import AutoQuantLogTerminal from "./AutoQuantLogTerminal";

describe("AutoQuantLogTerminal", () => {
  test("renders empty state when no lines", () => {
    const { getByText } = render(
      <AutoQuantLogTerminal lines={[]} filter="" />
    );

    expect(getByText("Waiting for pipeline output...")).toBeInTheDocument();
  });

  test("renders log lines", () => {
    const lines = [
      "[INFO] Starting pipeline",
      "[INFO] Loading data",
      "[INFO] Processing complete",
    ];

    const { getByText } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    expect(getByText("[INFO] Starting pipeline")).toBeInTheDocument();
    expect(getByText("[INFO] Loading data")).toBeInTheDocument();
    expect(getByText("[INFO] Processing complete")).toBeInTheDocument();
  });

  test("filters lines based on filter text", () => {
    const lines = [
      "[INFO] Starting pipeline",
      "[ERROR] Data load failed",
      "[INFO] Retrying...",
      "[ERROR] Still failing",
    ];

    const { getByText, queryByText } = render(
      <AutoQuantLogTerminal lines={lines} filter="error" />
    );

    expect(getByText("[ERROR] Data load failed")).toBeInTheDocument();
    expect(getByText("[ERROR] Still failing")).toBeInTheDocument();
    expect(queryByText("[INFO] Starting pipeline")).not.toBeInTheDocument();
    expect(queryByText("[INFO] Retrying...")).not.toBeInTheDocument();
  });

  test("shows no match message when filter excludes all lines", () => {
    const lines = [
      "[INFO] Starting pipeline",
      "[INFO] Loading data",
    ];

    const { getByText } = render(
      <AutoQuantLogTerminal lines={lines} filter="error" />
    );

    expect(getByText("No lines match filter.")).toBeInTheDocument();
  });

  test("applies error color to error lines", () => {
    const lines = ["[ERROR] Something went wrong"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const errorLine = container.querySelector(".text-error");
    expect(errorLine).toBeInTheDocument();
    expect(errorLine).toHaveTextContent("[ERROR] Something went wrong");
  });

  test("applies error color to lines with 'error' (case insensitive)", () => {
    const lines = ["An error occurred during processing"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const errorLine = container.querySelector(".text-error");
    expect(errorLine).toBeInTheDocument();
  });

  test("applies error color to lines with ✗", () => {
    const lines = ["Stage failed ✗"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const errorLine = container.querySelector(".text-error");
    expect(errorLine).toBeInTheDocument();
  });

  test("applies success color to lines with ✓", () => {
    const lines = ["Stage passed ✓"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const successLine = container.querySelector(".text-success");
    expect(successLine).toBeInTheDocument();
  });

  test("applies success color to lines with 'passed'", () => {
    const lines = ["Validation passed"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const successLine = container.querySelector(".text-success");
    expect(successLine).toBeInTheDocument();
  });

  test("applies success color to lines with 'complete'", () => {
    const lines = ["Pipeline complete"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const successLine = container.querySelector(".text-success");
    expect(successLine).toBeInTheDocument();
  });

  test("applies warning color to WARNING lines", () => {
    const lines = ["WARNING: Low data quality"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const warningLine = container.querySelector(".text-warning");
    expect(warningLine).toBeInTheDocument();
  });

  test("applies warning color to lines with 'warning'", () => {
    const lines = ["This is a warning message"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const warningLine = container.querySelector(".text-warning");
    expect(warningLine).toBeInTheDocument();
  });

  test("applies default color to regular lines", () => {
    const lines = ["[INFO] Starting pipeline"];

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const regularLine = container.querySelector(".text-base-content\\/70");
    expect(regularLine).toBeInTheDocument();
  });

  test("limits displayed lines to last 1000", () => {
    const lines = Array.from({ length: 1500 }, (_, i) => `[INFO] Line ${i}`);

    const { container } = render(
      <AutoQuantLogTerminal lines={lines} filter="" />
    );

    const displayedLines = container.querySelectorAll("div");
    // Should limit to approximately 1000 lines (implementation may vary slightly)
    expect(displayedLines.length).toBeGreaterThanOrEqual(1000);
    expect(displayedLines.length).toBeLessThanOrEqual(1002);
  });

  test("case-insensitive filtering", () => {
    const lines = [
      "[INFO] Starting pipeline",
      "[ERROR] Data load failed",
    ];

    const { getByText, queryByText } = render(
      <AutoQuantLogTerminal lines={lines} filter="ERROR" />
    );

    expect(getByText("[ERROR] Data load failed")).toBeInTheDocument();
    expect(queryByText("[INFO] Starting pipeline")).not.toBeInTheDocument();
  });
});
