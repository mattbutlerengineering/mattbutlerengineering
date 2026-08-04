import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FactorySection, OPERATING_MANUAL_URL } from "./FactorySection.js";
import { PIPELINE_STAGES } from "./pipeline-stages.js";
import { REPO_STATS } from "../../data/repo-stats.js";

type MockProps = { children?: ReactNode; className?: string; "data-testid"?: string };
type HeadingMockProps = MockProps & { level?: number };
type TextMockProps = MockProps & { as?: "p" | "span" };

const motionState = vi.hoisted(() => ({ reduced: false }));

/**
 * Records whether anything pulled three into the module graph. The scene is
 * behind a dynamic import fired by an IntersectionObserver that never
 * intersects in jsdom, so a load here means the lazy boundary has broken and
 * the landing route is shipping a 3D engine it may never use.
 */
const threeLoads = vi.hoisted(() => ({ count: 0 }));
vi.mock("three", () => {
  threeLoads.count += 1;
  return {};
});

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        const MotionComponent = ({ children, className }: MockProps) => (
          <div className={className}>{children}</div>
        );
        return MotionComponent;
      },
    }
  ),
  useReducedMotion: () => motionState.reduced,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children, level = 2, className }: HeadingMockProps) => {
    const Tag = `h${level}` as "h1" | "h2" | "h3";
    return <Tag className={className}>{children}</Tag>;
  },
  Text: ({ children, className, as: Tag = "p", "data-testid": testId }: TextMockProps) => (
    <Tag className={className} data-testid={testId}>
      {children}
    </Tag>
  ),
  Card: ({ children, className }: MockProps) => <div className={className}>{children}</div>,
  Stack: ({ children, className }: MockProps) => <div className={className}>{children}</div>,
  Badge: ({ children, className }: MockProps) => <span className={className}>{children}</span>,
  useScrollReveal: () => ({
    ref: vi.fn(),
    controls: { start: vi.fn(), set: vi.fn(), subscribe: vi.fn(), stop: vi.fn(), mount: vi.fn() },
  }),
  staggerReveal: { container: {}, item: {} },
}));

beforeEach(() => {
  motionState.reduced = false;
});

describe("FactorySection", () => {
  it("frames the section as the machinery behind the site", () => {
    render(<FactorySection />);
    expect(screen.getByText("The machinery")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "How this site ships itself"
    );
  });

  it("explains the loop in prose, not just in the diagram", () => {
    render(<FactorySection />);
    expect(screen.getByTestId("factory-body")).toHaveTextContent(/agents claim them/i);
  });

  it.each(PIPELINE_STAGES.map((stage) => [stage.name] as const))(
    "names the %s stage",
    (name: string) => {
      render(<FactorySection />);
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  );

  it("keeps the stages numbered so the order survives a single-column layout", () => {
    render(<FactorySection />);
    for (const stage of PIPELINE_STAGES) {
      expect(screen.getByText(stage.step)).toBeInTheDocument();
    }
  });

  it.each([
    ["agent PRs merged", REPO_STATS.agentPrsMerged],
    ["test files", REPO_STATS.testFiles],
    ["pull requests merged", REPO_STATS.totalPrsMerged],
    ["components shipped", REPO_STATS.rialtoComponents],
  ])("shows the measured %s figure", (label, value) => {
    render(<FactorySection />);
    expect(screen.getByText(`${value} ${label}`)).toBeInTheDocument();
  });

  it("labels the feedback arc that closes the loop", () => {
    render(<FactorySection />);
    expect(screen.getByTestId("factory-feedback")).toHaveTextContent(/audits/i);
  });

  it("links to the operating manual, opening safely in a new tab", () => {
    render(<FactorySection />);
    const link = screen.getByRole("link", { name: /read the operating manual/i });
    expect(link).toHaveAttribute("href", OPERATING_MANUAL_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(link.getAttribute("aria-label")).toMatch(/opens in new tab/i);
  });

  it("points the manual link at the repository's own AGENTS.md", () => {
    expect(OPERATING_MANUAL_URL).toBe(
      "https://github.com/mattbutlerengineering/mattbutlerengineering/blob/main/AGENTS.md"
    );
  });

  it("hides the decorative layer from assistive technology", () => {
    const { container } = render(<FactorySection />);
    expect(container.querySelector("[data-factory-stage-layer]")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("reserves the scene's space up front, so mounting it shifts no layout", () => {
    const { container } = render(<FactorySection />);
    expect(container.querySelector("[data-factory-stage-layer]")?.className).toMatch(/stageLayer/);
  });

  it("keeps three.js out of the landing route's payload", () => {
    render(<FactorySection />);
    expect(threeLoads.count).toBe(0);
  });
});

describe("FactorySection under prefers-reduced-motion", () => {
  beforeEach(() => {
    motionState.reduced = true;
  });

  it("replaces the running scene with a still diagram", () => {
    const { container } = render(<FactorySection />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-factory-still]")).toBeInTheDocument();
  });

  it("still names every stage", () => {
    render(<FactorySection />);
    for (const stage of PIPELINE_STAGES) {
      expect(screen.getByText(stage.name)).toBeInTheDocument();
    }
  });

  it("still shows every measured figure", () => {
    render(<FactorySection />);
    for (const stage of PIPELINE_STAGES) {
      if (!stage.metric) continue;
      expect(screen.getByText(`${stage.metric.value} ${stage.metric.label}`)).toBeInTheDocument();
    }
  });

  it("still labels the feedback arc and links the manual", () => {
    render(<FactorySection />);
    expect(screen.getByTestId("factory-feedback")).toHaveTextContent(/audits/i);
    expect(screen.getByRole("link", { name: /read the operating manual/i })).toBeInTheDocument();
  });

  it("never loads three when motion is off", () => {
    render(<FactorySection />);
    expect(threeLoads.count).toBe(0);
  });
});
