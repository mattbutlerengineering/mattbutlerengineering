import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProofStrip } from "./ProofStrip.js";
import { REPO_STATS } from "../data/repo-stats.js";
import { formatMeasuredAt } from "../utils/formatters.js";

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

describe("ProofStrip", () => {
  it("renders a level-2 section heading", () => {
    render(<ProofStrip />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent(/by the numbers/i);
  });

  it("frames the figures as measured rather than claimed", () => {
    render(<ProofStrip />);
    expect(screen.getByText("Measured, not claimed")).toBeInTheDocument();
  });

  it("drops the self-congratulatory one-person-team blurb", () => {
    render(<ProofStrip />);
    expect(screen.queryByText(/one-person team/i)).not.toBeInTheDocument();
  });

  it.each([
    ["Agent-authored PRs merged", REPO_STATS.agentPrsMerged],
    ["Pull requests merged", REPO_STATS.totalPrsMerged],
    ["Rialto components", REPO_STATS.rialtoComponents],
    ["Test files", REPO_STATS.testFiles],
  ])("renders the real repo measurement for %s", (label, value) => {
    render(<ProofStrip />);
    const group = screen.getByText(label).closest("div");
    expect(group).not.toBeNull();
    expect(within(group as HTMLElement).getByText(String(value))).toBeInTheDocument();
  });

  it("states when the figures were measured", () => {
    render(<ProofStrip />);
    const provenance = screen.getByText(/measured at last deploy/i);
    expect(provenance).toHaveTextContent(formatMeasuredAt(REPO_STATS.measuredAt));
  });
});
