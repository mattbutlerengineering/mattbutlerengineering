import { render, screen } from "@testing-library/react";
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
});
