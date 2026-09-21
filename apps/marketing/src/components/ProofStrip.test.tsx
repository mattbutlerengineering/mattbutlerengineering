import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProofStrip } from "./ProofStrip.js";
import { REPO_STATS } from "../data/repo-stats.js";
import { formatMeasuredAt } from "../utils/formatters.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type MockProps = { children?: ReactNode };
type HeadingMockProps = MockProps & { level?: number };
type OdometerMockProps = {
  value: number;
  size?: string;
  formatOptions?: Intl.NumberFormatOptions;
};

/** Drives the mocked `useScrollReveal`'s `revealed` flag; revealed by default. */
const { mockRevealed } = vi.hoisted(() => ({ mockRevealed: vi.fn(() => true) }));

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
  Odometer: ({ value, size, formatOptions }: OdometerMockProps) => (
    <span data-size={size} data-min-digits={formatOptions?.minimumIntegerDigits}>
      {value}
    </span>
  ),
  useScrollReveal: () => ({
    ref: vi.fn(),
    controls: { start: vi.fn(), set: vi.fn(), subscribe: vi.fn(), stop: vi.fn(), mount: vi.fn() },
    revealed: mockRevealed(),
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

describe("ProofStrip odometer sizing", () => {
  function stubMatchMedia(matches: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders lg odometers on wide viewports", () => {
    stubMatchMedia(false);
    render(<ProofStrip />);
    const odometer = screen.getByText(String(REPO_STATS.agentPrsMerged));
    expect(odometer).toHaveAttribute("data-size", "lg");
  });

  it("drops to md odometers on phone-narrow viewports, where lg flip-board cells overflow", () => {
    stubMatchMedia(true);
    render(<ProofStrip />);
    const odometer = screen.getByText(String(REPO_STATS.agentPrsMerged));
    expect(odometer).toHaveAttribute("data-size", "md");
  });

  it("falls back to lg when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<ProofStrip />);
    const odometer = screen.getByText(String(REPO_STATS.agentPrsMerged));
    expect(odometer).toHaveAttribute("data-size", "lg");
  });
});

// The reels roll on mount, so an ungated Odometer finishes counting while the
// strip is still below the fold — the visitor scrolls down to figures that
// already landed. Gating on the reveal moves the count to the moment the
// figures are on screen, and the zero it waits on is padded to the counted
// figure's digit count so the swap moves no layout.
describe("ProofStrip odometer trigger", () => {
  const FIGURES = [
    ["Agent-authored PRs merged", REPO_STATS.agentPrsMerged],
    ["Pull requests merged", REPO_STATS.totalPrsMerged],
    ["Rialto components", REPO_STATS.rialtoComponents],
    ["Test files", REPO_STATS.testFiles],
  ] as const;

  /** The odometer sitting in the same metric card as `label`. */
  function figureFor(label: string, text: string): HTMLElement {
    const group = screen.getByText(label).closest("div");
    return within(group as HTMLElement).getByText(text);
  }

  afterEach(() => {
    mockRevealed.mockReturnValue(true);
  });

  it.each(FIGURES)("holds %s at zero until the strip scrolls into view", (label) => {
    mockRevealed.mockReturnValue(false);
    render(<ProofStrip />);
    expect(figureFor(label, "0")).toBeInTheDocument();
  });

  it.each(FIGURES)("reserves %s's counted width while it waits, so nothing shifts", (label, v) => {
    const digits = String(String(v).length);

    mockRevealed.mockReturnValue(false);
    const { unmount } = render(<ProofStrip />);
    expect(figureFor(label, "0")).toHaveAttribute("data-min-digits", digits);
    unmount();

    mockRevealed.mockReturnValue(true);
    render(<ProofStrip />);
    expect(figureFor(label, String(v))).toHaveAttribute("data-min-digits", digits);
  });
});

// A counter's figure is a row of flip-board cells: em-sized boxes that cannot
// wrap or shrink, so a grid column narrower than the rendered figure overflows
// the card instead of reflowing inside it. Measured on the deployed page at
// 1512px (#5459): `Test files` rendered `1,132` 317px wide inside a card whose
// content box was 180px — a 137px spill, with the figures still growing.
describe("ProofStrip metrics grid fits its widest figure", () => {
  /**
   * The Odometer's box model, in CSS pixels at `size="lg"`.
   *
   * Each contiguous digit run is one SplitFlap board — `n` cells of 1.6em at a
   * 2.5rem font (64px), 3px between cells, 8px board padding and a 1px border
   * per side. Grouping separators render as static glyphs between the boards,
   * and `.reels` puts 4px between every token.
   *
   * Pinned to three widths measured on production, which the arithmetic below
   * reproduces exactly: 1 cell = 82px, 2 cells = 149px, `1` + `,` + `132` =
   * 317px.
   */
  const LG_CELL_PX = 64;
  const CELL_GAP_PX = 3;
  const BOARD_CHROME_PX = 15; // 2×8px padding + 2×1px border − the gap counted per cell
  const LG_SEPARATOR_PX = 11;
  const REELS_GAP_PX = 4;

  /** Width the `lg` Odometer occupies to render an already-formatted figure. */
  function odometerWidthPx(formatted: string): number {
    const runs = formatted.match(/\d+|\D+/g) ?? [];
    const boards = runs.filter((run) => /^\d+$/.test(run));
    const cells = boards.reduce((total, run) => total + run.length, 0);
    const separators = runs.length - boards.length;

    return (
      cells * (LG_CELL_PX + CELL_GAP_PX) +
      boards.length * BOARD_CHROME_PX +
      separators * LG_SEPARATOR_PX +
      Math.max(runs.length - 1, 0) * REELS_GAP_PX
    );
  }

  /** Rialto `Card` padding, both sides — the card is what the figure spills out of. */
  const CARD_PADDING_PX = 64;

  /** The `minmax()` floor `.metricsGrid` guarantees every column, in pixels. */
  function columnFloorPx(): number {
    const css = readFileSync(resolve(__dirname, "../pages/HomePage.module.css"), "utf8");
    const declarations = /\.metricsGrid\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(declarations, "HomePage.module.css declares a .metricsGrid rule").toBeDefined();

    const floor = /minmax\(\s*(?:min\([^)]*?,\s*)?(\d+)px/.exec(declarations ?? "")?.[1];
    expect(floor, ".metricsGrid sizes its columns with a minmax() pixel floor").toBeDefined();
    return Number(floor);
  }

  it("guarantees every column enough width for the widest counter's flip-board", () => {
    // en-US grouping is the widest realistic formatting of these figures, and
    // the page formats with the visitor's own locale.
    const format = (value: number) => new Intl.NumberFormat("en-US").format(value);
    const widest = Math.max(
      ...[
        REPO_STATS.agentPrsMerged,
        REPO_STATS.totalPrsMerged,
        REPO_STATS.rialtoComponents,
        REPO_STATS.testFiles,
      ].map((value) => odometerWidthPx(format(value)))
    );

    expect(columnFloorPx()).toBeGreaterThanOrEqual(widest + CARD_PADDING_PX);
  });
});
