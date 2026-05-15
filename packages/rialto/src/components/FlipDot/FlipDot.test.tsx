import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FlipDot } from "./FlipDot";

// Mock framer-motion to avoid animation complexity in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

describe("FlipDot", () => {
  const simple3x3: boolean[][] = [
    [true, false, true],
    [false, true, false],
    [true, false, true],
  ];

  it("renders the correct number of dots", () => {
    const { container } = render(<FlipDot matrix={simple3x3} aria-label="test pattern" />);
    // 3x3 = 9 dot wrappers
    const dots = container.querySelectorAll("[class*='dot']");
    // Each dot has wrapper + inner + 2 faces = multiple elements per dot,
    // but the top-level .dot class appears once per cell
    expect(dots.length).toBeGreaterThanOrEqual(9);
  });

  it("renders with role=img and forwards aria-label", () => {
    render(<FlipDot matrix={simple3x3} aria-label="test display" />);
    const panel = screen.getByRole("img");
    expect(panel).toHaveAttribute("aria-label", "test display");
  });

  it("forwards ref to the panel div", () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<FlipDot ref={ref} matrix={simple3x3} aria-label="ref test" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("merges className onto panel", () => {
    render(<FlipDot matrix={simple3x3} className="custom-class" aria-label="class test" />);
    const panel = screen.getByRole("img");
    expect(panel.className).toContain("custom-class");
  });

  it("sets CSS custom properties from dotSize and dotGap", () => {
    render(<FlipDot matrix={simple3x3} dotSize={12} dotGap={4} aria-label="size test" />);
    const panel = screen.getByRole("img");
    expect(panel.style.getPropertyValue("--fd-dot-size")).toBe("12px");
    expect(panel.style.getPropertyValue("--fd-dot-gap")).toBe("4px");
  });

  it("pads matrix when rows/cols exceed matrix dimensions", () => {
    const { container } = render(
      <FlipDot matrix={simple3x3} rows={5} cols={5} aria-label="padded" />
    );
    // 5x5 = 25 dots minimum
    const dots = container.querySelectorAll("[class*='dot']");
    expect(dots.length).toBeGreaterThanOrEqual(25);
  });

  it("renders empty matrix without errors", () => {
    const empty: boolean[][] = [];
    const { container } = render(<FlipDot matrix={empty} rows={0} cols={0} aria-label="empty" />);
    expect(container.querySelector("[class*='panel']")).toBeTruthy();
  });

  describe("stagger directions", () => {
    const directions = ["left-to-right", "top-to-bottom", "center-out", "random"] as const;

    for (const direction of directions) {
      it(`renders with staggerDirection="${direction}"`, () => {
        const { container } = render(
          <FlipDot
            matrix={simple3x3}
            staggerDirection={direction}
            aria-label={`stagger-${direction}`}
          />
        );
        expect(container.querySelector("[class*='panel']")).toBeTruthy();
      });
    }
  });

  describe("sound enabled", () => {
    it("renders when enableSound=true without crash", () => {
      vi.stubGlobal("AudioContext", undefined);
      const { container } = render(
        <FlipDot matrix={simple3x3} enableSound={true} soundVolume={0.5} aria-label="sound test" />
      );
      expect(container.querySelector("[class*='panel']")).toBeTruthy();
      vi.unstubAllGlobals();
    });
  });

  describe("matrix update", () => {
    it("re-renders correctly when matrix changes", () => {
      const m1: boolean[][] = [
        [true, false],
        [false, true],
      ];
      const m2: boolean[][] = [
        [false, true],
        [true, false],
      ];

      const { rerender, container } = render(<FlipDot matrix={m1} aria-label="flip test" />);
      act(() => {
        rerender(<FlipDot matrix={m2} aria-label="flip test" />);
      });
      expect(container.querySelector("[class*='panel']")).toBeTruthy();
    });
  });

  describe("gridTemplateColumns override", () => {
    it("uses cols prop for grid columns", () => {
      render(<FlipDot matrix={simple3x3} cols={6} aria-label="cols-override" />);
      const panel = screen.getByRole("img");
      expect(panel.style.gridTemplateColumns).toContain("6");
    });
  });
});
