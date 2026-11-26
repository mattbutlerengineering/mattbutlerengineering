import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ShippedFeature } from "../data/shipped-features.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ level, children }: { level: number; children: ReactNode }) => {
    const Tag = `h${level}` as "h1";
    return <Tag>{children}</Tag>;
  },
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const mockData = vi.hoisted(() => ({ feature: undefined as unknown }));
vi.mock("../data/shipped-features.js", () => ({
  findShippedFeature: () => mockData.feature,
}));
const videoData = vi.hoisted(() => ({ video: undefined as unknown }));
vi.mock("../data/shipped-videos.js", () => ({
  findShippedVideo: () => videoData.video,
}));
vi.mock("../components/ShippedVideo.js", () => ({
  ShippedVideo: () => <div data-testid="promo-video" />,
}));
vi.mock("./NotFoundPage.js", () => ({ NotFoundPage: () => <h1>404</h1> }));

import { ShippedStoryPage } from "./ShippedStoryPage.js";

function feature(over: Partial<ShippedFeature> = {}): ShippedFeature {
  return {
    slug: "demo",
    title: "Demo feature",
    trackingIssue: 10,
    proposalIssue: 5,
    proposalEvidence: "Guests keep asking for this.",
    proposedAt: "2026-10-01T00:00:00Z",
    firstMergedAt: "2026-10-02T00:00:00Z",
    lastMergedAt: "2026-10-03T00:00:00Z",
    wallClockHours: 48,
    liveUrl: "/hospitality/",
    children: [
      {
        issue: 11,
        title: "first child",
        prs: [
          {
            number: 21,
            title: "pr one",
            mergedAt: "2026-10-02T00:00:00Z",
            mergeCommit: "abc",
            reviewVerdict: "pass",
            ciGate: "success",
          },
        ],
      },
      {
        issue: 12,
        title: "second child",
        prs: [
          {
            number: 22,
            title: "pr two",
            mergedAt: "2026-10-03T00:00:00Z",
            mergeCommit: "def",
            reviewVerdict: null,
            ciGate: null,
          },
        ],
      },
    ],
    ...over,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/shipped/demo"]}>
      <Routes>
        <Route path="/shipped/:slug" element={<ShippedStoryPage />} />
      </Routes>
    </MemoryRouter>
  );

describe("ShippedStoryPage", () => {
  beforeEach(() => {
    mockData.feature = feature();
    videoData.video = undefined;
  });

  it("renders the NotFound page for an unknown slug", () => {
    mockData.feature = undefined;
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("404");
  });

  it("renders title, proposal, children in order and PR badges", () => {
    renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Demo feature");
    expect(screen.getByText(/proposed → shipped in 2 days/i)).toBeInTheDocument();
    expect(screen.getByText("Guests keep asking for this.")).toBeInTheDocument();
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(["Proposal", "Decomposition", "Pull requests", "See it live"]);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items[0]).toContain("first child");
    expect(items[1]).toContain("second child");
    expect(screen.getByText("Review: pass")).toBeInTheDocument();
    expect(screen.getByText("CI Gate: success")).toBeInTheDocument();
    expect(screen.getByText("Review: not recorded")).toBeInTheDocument();
    expect(screen.getByText("CI Gate: not recorded")).toBeInTheDocument();
  });

  it("links to GitHub safely and back to the index", () => {
    renderPage();
    const pr = screen.getByRole("link", { name: /#21/ });
    expect(pr).toHaveAttribute(
      "href",
      "https://github.com/mattbutlerengineering/mattbutlerengineering/pull/21"
    );
    expect(pr).toHaveAttribute("target", "_blank");
    expect(pr).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /back to all shipped features/i })).toHaveAttribute(
      "href",
      "/shipped"
    );
    expect(screen.getByRole("link", { name: /see it live/i })).toHaveAttribute(
      "href",
      "/hospitality/"
    );
  });

  it("omits proposal and live sections when null", () => {
    mockData.feature = feature({
      proposalIssue: null,
      proposalEvidence: null,
      proposedAt: null,
      liveUrl: null,
    });
    renderPage();
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(["Decomposition", "Pull requests"]);
    expect(screen.queryByRole("link", { name: /see it live/i })).toBeNull();
  });

  it("shows a Watch the demo section right after the subtitle when a video exists", () => {
    videoData.video = { slug: "demo" };
    renderPage();
    expect(screen.getByTestId("promo-video")).toBeInTheDocument();
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s[0]).toBe("Watch the demo");
  });

  it("omits the video section when there is no video", () => {
    renderPage();
    expect(screen.queryByTestId("promo-video")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Watch the demo" })).toBeNull();
  });

  it("steps section headings down below 375px so an unbreakable word fits", () => {
    // Heading size 2 is text-3xl (~48px). "Decomposition" is one word and
    // paints ~313px wide, past the 256px content box a 320px viewport leaves
    // once the presenting vibe's 32px padding is subtracted. The step-down
    // has to live under the 375px visual-regression viewport, where text-3xl
    // already stays on screen.
    const css = readFileSync(join(__dirname, "ShippedStoryPage.module.css"), "utf8");
    const narrow = narrowSectionHeadingRule(css);
    expect(narrow, "expected a max-width query under 375px covering .section h2").not.toBe("");
    expect(narrow).toMatch(/font-size:\s*var\(--rialto-text-2xl\)/);
    expect(narrow).toMatch(/overflow-wrap:\s*anywhere/);
    // Wider viewports, including the 375px visual baseline, keep size 2.
    const aboveTheFold = css.replace(
      /@media\s*\([^)]*max-width:\s*(?:3[0-6]\d|37[0-4])px[^)]*\)\s*\{[\s\S]*?\n\}/g,
      ""
    );
    expect(aboveTheFold).not.toMatch(/\.section h2[\s\S]*font-size:\s*var\(--rialto-text-2xl\)/);
  });
});

/** Body of a max-width query at 320–374px that restyles `.section h2`. */
function narrowSectionHeadingRule(css: string): string {
  const blocks = css.matchAll(/@media\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/g);
  for (const [, condition, body] of blocks) {
    const max = condition?.match(/max-width:\s*(\d+)px/);
    if (max === null || max === undefined) continue;
    const width = Number(max[1]);
    if (width < 320 || width > 374) continue;
    if (body?.includes(".section h2")) return body;
  }
  return "";
}
