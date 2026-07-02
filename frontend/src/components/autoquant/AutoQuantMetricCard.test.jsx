import { render } from "@testing-library/react";
import AutoQuantMetricCard from "./AutoQuantMetricCard";

describe("AutoQuantMetricCard", () => {
  test("renders with label and value", () => {
    const { getByText } = render(
      <AutoQuantMetricCard label="Profit" value="10.5" unit="%" />
    );

    expect(getByText("Profit")).toBeInTheDocument();
    expect(getByText("10.5%")).toBeInTheDocument();
  });

  test("renders with null value as dash", () => {
    const { getByText } = render(
      <AutoQuantMetricCard label="Profit" value={null} unit="%" />
    );

    expect(getByText("—")).toBeInTheDocument();
  });

  test("applies success color when good is true", () => {
    const { container } = render(
      <AutoQuantMetricCard label="Profit" value="10.5" unit="%" good={true} />
    );

    const valueElement = container.querySelector(".text-success");
    expect(valueElement).toBeInTheDocument();
  });

  test("applies error color when good is false", () => {
    const { container } = render(
      <AutoQuantMetricCard label="Profit" value="10.5" unit="%" good={false} />
    );

    const valueElement = container.querySelector(".text-error");
    expect(valueElement).toBeInTheDocument();
  });

  test("applies base color when good is null", () => {
    const { container } = render(
      <AutoQuantMetricCard label="Profit" value="10.5" unit="%" good={null} />
    );

    const valueElement = container.querySelector(".text-base-content");
    expect(valueElement).toBeInTheDocument();
  });

  test("renders threshold when provided", () => {
    const { getByText } = render(
      <AutoQuantMetricCard label="Profit" value="10.5" unit="%" threshold="5%" />
    );

    expect(getByText("threshold: 5%")).toBeInTheDocument();
  });

  test("does not render threshold when not provided", () => {
    const { queryByText } = render(
      <AutoQuantMetricCard label="Profit" value="10.5" unit="%" />
    );

    expect(queryByText(/threshold:/i)).not.toBeInTheDocument();
  });

  test("renders without unit when not provided", () => {
    const { getByText } = render(
      <AutoQuantMetricCard label="Count" value="42" />
    );

    expect(getByText("42")).toBeInTheDocument();
  });

  test("renders with zero value", () => {
    const { getByText } = render(
      <AutoQuantMetricCard label="Profit" value={0} unit="%" />
    );

    expect(getByText("0%")).toBeInTheDocument();
  });

  test("renders with negative value", () => {
    const { getByText } = render(
      <AutoQuantMetricCard label="Profit" value="-5.2" unit="%" />
    );

    expect(getByText("-5.2%")).toBeInTheDocument();
  });
});
