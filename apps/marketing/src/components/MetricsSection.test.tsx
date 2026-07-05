import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MetricsSection } from "./MetricsSection.js";
import { SITE_STATS } from "../data/stats.js";

type MockProps = { children?: ReactNode };
type HeadingMockProps = MockProps & { level?: number };
type OdometerMockProps = { value: number };

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        const MotionComponent = ({ children }: MockProps) => <div>{children}</div>;
        return MotionComponent;
      },
    }
  ),
  useReducedMotion: () => false,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children, level = 2 }: HeadingMockProps) => {
    const Tag = `h${level}` as "h1" | "h2" | "h3";
    return <Tag>{children}</Tag>;
  },
  Text: ({ children }: MockProps) => <p>{children}</p>,
  Card: ({ children }: MockProps) => <div>{children}</div>,
  Stack: ({ children }: MockProps) => <div>{children}</div>,
  // Render the final numeric value as text — mirrors the Odometer's
  // reduced-motion snap and its aria-live announcement of the whole number.
  Odometer: ({ value }: OdometerMockProps) => <span>{value}</span>,
  useScrollReveal: () => ({
    ref: vi.fn(),
    controls: { start: vi.fn(), set: vi.fn(), subscribe: vi.fn(), stop: vi.fn(), mount: vi.fn() },
  }),
  staggerReveal: { container: {}, item: {} },
}));

describe("MetricsSection", () => {
  it("renders a level-2 section heading", () => {
    render(<MetricsSection />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent(/by the numbers/i);
  });

  it("renders every metric as a final numeric value with a visible label", () => {
    render(<MetricsSection />);
    for (const stat of SITE_STATS) {
      expect(screen.getByText(stat.label)).toBeInTheDocument();
      const label = screen.getByText(stat.label);
      const group = label.closest("div");
      expect(group).not.toBeNull();
      expect(within(group as HTMLElement).getByText(String(stat.value))).toBeInTheDocument();
    }
  });

  it("shows the trailing suffix for at-least figures", () => {
    render(<MetricsSection />);
    const withSuffix = SITE_STATS.filter((stat) => stat.suffix);
    for (const stat of withSuffix) {
      expect(screen.getAllByText(stat.suffix as string).length).toBeGreaterThan(0);
    }
  });
});
