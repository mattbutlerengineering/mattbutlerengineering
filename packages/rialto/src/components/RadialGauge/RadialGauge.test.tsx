import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { useReducedMotion } from "framer-motion";
import type * as FramerMotion from "framer-motion";
import { RadialGauge } from "./RadialGauge";

// Control reduced-motion per test. The global setup mock forces it to `true`;
// here we make it a spy so we can exercise both the animated and static paths.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof FramerMotion>("framer-motion");
  return { ...actual, useReducedMotion: vi.fn(() => true) };
});

const mockReducedMotion = vi.mocked(useReducedMotion);

describe("RadialGauge", () => {
  beforeEach(() => {
    mockReducedMotion.mockReturnValue(true);
  });

  describe("rendering", () => {
    it("renders with role=meter", () => {
      render(<RadialGauge value={50} label="Utilization" />);
      expect(screen.getByRole("meter")).toBeInTheDocument();
    });

    it("renders an SVG dial", () => {
      const { container } = render(<RadialGauge value={50} label="Score" />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    it("renders the value arc and the track arc", () => {
      const { container } = render(<RadialGauge value={50} label="Score" />);
      expect(container.querySelector("[class*='track']")).toBeInTheDocument();
      expect(container.querySelector("[class*='valueArc']")).toBeInTheDocument();
    });

    it("renders a needle by default", () => {
      const { container } = render(<RadialGauge value={50} label="Score" />);
      expect(container.querySelector("[class*='needle']")).toBeInTheDocument();
    });

    it("omits the needle when needle={false}", () => {
      const { container } = render(<RadialGauge value={50} label="Score" needle={false} />);
      expect(container.querySelector("[class*='needle']")).not.toBeInTheDocument();
    });

    it("renders the label", () => {
      render(<RadialGauge value={50} label="Cabin Pressure" />);
      expect(screen.getByText("Cabin Pressure")).toBeInTheDocument();
    });
  });

  describe("aria attributes", () => {
    it("sets aria-valuenow to the current value", () => {
      render(<RadialGauge value={42} label="Score" />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "42");
    });

    it("defaults aria-valuemin to 0 and aria-valuemax to 100", () => {
      render(<RadialGauge value={42} label="Score" />);
      const meter = screen.getByRole("meter");
      expect(meter).toHaveAttribute("aria-valuemin", "0");
      expect(meter).toHaveAttribute("aria-valuemax", "100");
    });

    it("sets aria-valuemin and aria-valuemax from props", () => {
      render(<RadialGauge value={5} min={-10} max={10} label="Trim" />);
      const meter = screen.getByRole("meter");
      expect(meter).toHaveAttribute("aria-valuemin", "-10");
      expect(meter).toHaveAttribute("aria-valuemax", "10");
    });

    it("sets aria-label from the label prop", () => {
      render(<RadialGauge value={50} label="Fuel" />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-label", "Fuel");
    });

    it("does not set aria-label when label is absent", () => {
      render(<RadialGauge value={50} />);
      expect(screen.getByRole("meter")).not.toHaveAttribute("aria-label");
    });

    it("keeps aria-valuenow as the raw value, not the clamped fraction", () => {
      render(<RadialGauge value={150} min={0} max={100} label="Over" />);
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "150");
    });
  });

  describe("readout (not colour-only status)", () => {
    it("shows the numeric readout by default", () => {
      render(<RadialGauge value={73} label="Score" />);
      expect(screen.getByText("73")).toBeInTheDocument();
    });

    it("appends the unit suffix to the readout", () => {
      render(<RadialGauge value={80} unit="%" label="Load" />);
      expect(screen.getByText("80%")).toBeInTheDocument();
    });

    it("hides the numeric readout when showValue={false}", () => {
      render(<RadialGauge value={73} label="Score" showValue={false} />);
      expect(screen.queryByText("73")).not.toBeInTheDocument();
    });

    it("rounds a fractional value in the readout", () => {
      render(<RadialGauge value={66.7} label="Score" />);
      expect(screen.getByText("67")).toBeInTheDocument();
    });
  });

  describe("arc/needle fill within min/max", () => {
    function fraction(container: HTMLElement): number {
      const arc = container.querySelector("[class*='valueArc']");
      return Number(arc?.getAttribute("data-fill-fraction"));
    }

    it("fills to the mid point for a mid-range value", () => {
      const { container } = render(<RadialGauge value={50} min={0} max={100} label="Score" />);
      expect(fraction(container)).toBeCloseTo(0.5, 5);
    });

    it("clamps the fill to 1 above max", () => {
      const { container } = render(<RadialGauge value={150} min={0} max={100} label="Score" />);
      expect(fraction(container)).toBe(1);
    });

    it("clamps the fill to 0 below min", () => {
      const { container } = render(<RadialGauge value={-10} min={0} max={100} label="Score" />);
      expect(fraction(container)).toBe(0);
    });

    it("maps a custom min/max range", () => {
      const { container } = render(<RadialGauge value={0} min={-10} max={10} label="Trim" />);
      expect(fraction(container)).toBeCloseTo(0.5, 5);
    });

    it("handles a zero range (max=min) without NaN", () => {
      const { container } = render(<RadialGauge value={5} min={5} max={5} label="Flat" />);
      expect(fraction(container)).toBe(0);
    });
  });

  describe("thresholds", () => {
    it("renders one marker per threshold", () => {
      const { container } = render(
        <RadialGauge
          value={50}
          label="Score"
          thresholds={[
            { value: 25, tone: "warning" },
            { value: 75, tone: "error" },
          ]}
        />
      );
      expect(container.querySelectorAll("[class*='threshold']")).toHaveLength(2);
    });

    it("renders no markers when thresholds are absent", () => {
      const { container } = render(<RadialGauge value={50} label="Score" />);
      expect(container.querySelectorAll("[class*='threshold']")).toHaveLength(0);
    });
  });

  describe("size", () => {
    it("renders the md size by default", () => {
      const { container } = render(<RadialGauge value={50} label="Score" />);
      expect(container.querySelector("[class*='sizeMd']")).toBeInTheDocument();
    });

    it("renders the lg size", () => {
      const { container } = render(<RadialGauge value={50} label="Score" size="lg" />);
      expect(container.querySelector("[class*='sizeLg']")).toBeInTheDocument();
    });

    it("renders the sm size", () => {
      const { container } = render(<RadialGauge value={50} label="Score" size="sm" />);
      expect(container.querySelector("[class*='sizeSm']")).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<RadialGauge ref={ref} value={50} label="Score" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("reduced motion", () => {
    it("marks the dial as reduced-motion when useReducedMotion() is true", () => {
      mockReducedMotion.mockReturnValue(true);
      const { container } = render(<RadialGauge value={50} label="Score" />);
      expect(container.firstElementChild).toHaveAttribute("data-reduced-motion", "true");
    });

    it("marks the dial as animated when useReducedMotion() is false", () => {
      mockReducedMotion.mockReturnValue(false);
      const { container } = render(<RadialGauge value={50} label="Score" />);
      expect(container.firstElementChild).toHaveAttribute("data-reduced-motion", "false");
    });

    it("renders the value arc at the final fraction on the animated path", () => {
      mockReducedMotion.mockReturnValue(false);
      const { container } = render(<RadialGauge value={50} min={0} max={100} label="Score" />);
      const arc = container.querySelector("[class*='valueArc']");
      expect(Number(arc?.getAttribute("data-fill-fraction"))).toBeCloseTo(0.5, 5);
    });
  });

  describe("className", () => {
    it("forwards a custom className to the wrapper", () => {
      const { container } = render(<RadialGauge value={50} label="Score" className="my-gauge" />);
      expect(container.firstElementChild?.className).toMatch(/my-gauge/);
    });

    it("does not emit 'undefined' in any className", () => {
      const { container } = render(<RadialGauge value={50} label="Score" />);
      const allClasses = Array.from(container.querySelectorAll("[class]"))
        .map((el) => (typeof el.className === "string" ? el.className : ""))
        .join(" ");
      expect(allClasses).not.toMatch(/undefined/);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations", async () => {
      const { container } = render(
        <RadialGauge
          value={72}
          label="Utilization"
          unit="%"
          thresholds={[{ value: 90, tone: "error" }]}
        />
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});
