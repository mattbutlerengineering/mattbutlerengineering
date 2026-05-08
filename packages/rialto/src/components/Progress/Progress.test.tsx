/**
 * Unit tests for the Progress and Spinner components.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress, Spinner } from "./Progress";

describe("Progress", () => {
  it("renders a progressbar role", () => {
    render(<Progress value={50} label="Uploading" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("sets aria-valuenow for determinate progress", () => {
    render(<Progress value={65} label="Loading" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "65");
  });

  it("sets aria-valuemin=0 and aria-valuemax=100", () => {
    render(<Progress value={50} label="Loading" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("does not set aria-valuenow for indeterminate", () => {
    render(<Progress label="Loading" />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("renders label text", () => {
    render(<Progress value={40} label="Uploading files" />);
    expect(screen.getByText("Uploading files")).toBeInTheDocument();
  });

  it("renders percentage value when showValue is true", () => {
    render(<Progress value={75} label="Progress" showValue />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("does not render percentage when showValue is false (default)", () => {
    render(<Progress value={75} label="Progress" />);
    expect(screen.queryByText("75%")).not.toBeInTheDocument();
  });

  it("clamps value above 100 to 100", () => {
    render(<Progress value={150} label="Overflow" showValue />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps value below 0 to 0", () => {
    render(<Progress value={-10} label="Underflow" showValue />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("aria-label defaults to label text", () => {
    render(<Progress value={50} label="My Task" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-label", "My Task");
  });

  it("aria-label can be overridden via aria-label prop", () => {
    render(<Progress value={50} label="Display Label" aria-label="Custom Aria Label" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-label", "Custom Aria Label");
  });

  it("renders without label (unlabeled progressbar)", () => {
    render(<Progress value={50} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it("does not render label row when no label or showValue", () => {
    render(<Progress value={50} />);
    // No label text or percent visible
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });

  it("supports size=sm", () => {
    render(<Progress value={50} label="Small" size="sm" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("supports size=lg", () => {
    render(<Progress value={50} label="Large" size="lg" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders value=0 correctly", () => {
    render(<Progress value={0} label="Starting" showValue />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("renders value=100 correctly", () => {
    render(<Progress value={100} label="Complete" showValue />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});

describe("Spinner", () => {
  it("renders with status role", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has default aria-label 'Loading'", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("accepts custom label", () => {
    render(<Spinner label="Processing..." />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Processing...");
  });

  it("supports size=sm", () => {
    render(<Spinner size="sm" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("supports size=lg", () => {
    render(<Spinner size="lg" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-live=polite", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
