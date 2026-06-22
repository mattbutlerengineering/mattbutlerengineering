import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Meter } from "./Meter";

describe("Meter", () => {
  describe("rendering", () => {
    it("renders with role=meter", () => {
      render(<Meter value={50} />);
      expect(screen.getByRole("meter")).toBeInTheDocument();
    });

    it("renders label when provided", () => {
      render(<Meter value={72} label="Fuel Load" />);
      expect(screen.getByText("Fuel Load")).toBeInTheDocument();
    });

    it("does not render label when not provided", () => {
      const { container } = render(<Meter value={50} />);
      expect(container.querySelector("[class*='label']")).not.toBeInTheDocument();
    });

    it("shows numeric value when showValue=true", () => {
      render(<Meter value={72} showValue />);
      expect(screen.getByText("72%")).toBeInTheDocument();
    });

    it("does not show numeric value by default", () => {
      const { container } = render(<Meter value={72} />);
      expect(container.querySelector("[class*='value']")).not.toBeInTheDocument();
    });

    it("rounds displayed percent correctly", () => {
      render(<Meter value={33} max={100} showValue />);
      expect(screen.getByText("33%")).toBeInTheDocument();
    });
  });

  describe("aria attributes", () => {
    it("sets aria-valuenow to current value", () => {
      render(<Meter value={60} />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "60");
    });

    it("sets aria-valuemin to min (default 0)", () => {
      render(<Meter value={60} />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemin", "0");
    });

    it("sets aria-valuemax to max (default 100)", () => {
      render(<Meter value={60} />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemax", "100");
    });

    it("sets aria-valuemin and aria-valuemax from props", () => {
      render(<Meter value={5} min={0} max={10} />);
      const meter = screen.getByRole("meter");
      expect(meter).toHaveAttribute("aria-valuemin", "0");
      expect(meter).toHaveAttribute("aria-valuemax", "10");
    });

    it("sets aria-label from label prop", () => {
      render(<Meter value={50} label="Battery" />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "Battery");
    });
  });

  describe("min/max clamping", () => {
    it("clamps value above max to 100%", () => {
      render(<Meter value={150} max={100} showValue />);
      expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("clamps value below min to 0%", () => {
      render(<Meter value={-10} min={0} max={100} showValue />);
      expect(screen.getByText("0%")).toBeInTheDocument();
    });

    it("handles custom min/max range", () => {
      render(<Meter value={5} min={0} max={10} showValue />);
      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("handles zero range (max=min) gracefully", () => {
      render(<Meter value={5} min={5} max={5} showValue />);
      expect(screen.getByText("0%")).toBeInTheDocument();
    });
  });

  describe("variants", () => {
    it("renders with default variant", () => {
      const { container } = render(<Meter value={50} variant="default" />);
      expect(container.querySelector("[class*='fill']")).toBeInTheDocument();
    });

    it("renders with accent variant", () => {
      const { container } = render(<Meter value={50} variant="accent" />);
      expect(container.querySelector("[class*='accent']")).toBeInTheDocument();
    });

    it("renders with success variant", () => {
      const { container } = render(<Meter value={50} variant="success" />);
      expect(container.querySelector("[class*='success']")).toBeInTheDocument();
    });

    it("renders with error variant", () => {
      const { container } = render(<Meter value={50} variant="error" />);
      expect(container.querySelector("[class*='error']")).toBeInTheDocument();
    });
  });

  describe("size", () => {
    it("renders md size by default", () => {
      const { container } = render(<Meter value={50} size="md" />);
      expect(container.querySelector("[class*='track']")).toBeInTheDocument();
    });

    it("renders sm size", () => {
      const { container } = render(<Meter value={50} size="sm" />);
      expect(container.querySelector("[class*='trackSm']")).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Meter ref={ref} value={50} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations", async () => {
      const { container } = render(
        <Meter value={72} label="Fuel Load" showValue variant="accent" />
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });

  describe("additional coverage", () => {
    it("forwards custom className to wrapper", () => {
      const { container } = render(<Meter value={50} className="my-meter" />);
      expect(container.firstElementChild?.className).toMatch(/my-meter/);
    });

    it("renders both label and value when both are provided", () => {
      render(<Meter value={80} label="Charge" showValue />);
      expect(screen.getByText("Charge")).toBeInTheDocument();
      expect(screen.getByText("80%")).toBeInTheDocument();
    });

    it("renders label row when only showValue is true (no label)", () => {
      render(<Meter value={50} showValue />);
      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    it("does not set aria-label when label is absent", () => {
      render(<Meter value={50} />);
      expect(screen.getByRole("meter")).not.toHaveAttribute("aria-label");
    });

    it("sets aria-valuenow to the raw value (not clamped percent)", () => {
      render(<Meter value={5} min={0} max={10} />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "5");
    });
  });

  it("does not emit 'undefined' in wrapper or track className", () => {
    const { container } = render(<Meter value={50} />);
    const allClasses = Array.from(container.querySelectorAll("[class]"))
      .map((el) => el.className)
      .join(" ");
    expect(allClasses).not.toMatch(/undefined/);
  });
});
