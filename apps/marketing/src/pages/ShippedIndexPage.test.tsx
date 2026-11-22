import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

const mockData = vi.hoisted(() => ({ features: [] as unknown[] }));
vi.mock("../data/shipped-features.js", () => ({
  get SHIPPED_FEATURES() {
    return mockData.features;
  },
}));

const videoData = vi.hoisted(() => ({ video: undefined as unknown }));
vi.mock("../data/shipped-videos.js", () => ({
  latestShippedVideo: () => videoData.video,
}));
vi.mock("../components/ShippedVideo.js", () => ({
  ShippedVideo: () => <div data-testid="promo-video" />,
}));

import { ShippedIndexPage } from "./ShippedIndexPage.js";

function feature(slug: string, over: Partial<ShippedFeature> = {}): ShippedFeature {
  return {
    slug,
    title: `Feature ${slug}`,
    trackingIssue: 1,
    proposalIssue: null,
    proposalEvidence: null,
    proposedAt: null,
    firstMergedAt: "2026-10-01T00:00:00Z",
    lastMergedAt: "2026-10-03T00:00:00Z",
    wallClockHours: 48,
    liveUrl: null,
    children: [
      {
        issue: 2,
        title: "child",
        prs: [
          {
            number: 3,
            title: "pr",
            mergedAt: "2026-10-03T00:00:00Z",
            mergeCommit: "abc",
            reviewVerdict: "pass",
            ciGate: "success",
          },
        ],
      },
    ],
    ...over,
  };
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ShippedIndexPage />
    </MemoryRouter>
  );

describe("ShippedIndexPage", () => {
  beforeEach(() => {
    mockData.features = [];
    videoData.video = undefined;
  });

  it("renders an explicit empty state", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Shipped by the factory");
    expect(screen.getByText(/nothing has shipped yet/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("renders one linked card per feature in snapshot order", () => {
    mockData.features = [feature("b", { liveUrl: "/b/" }), feature("a")];
    renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const h2s = screen.getAllByRole("heading", { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(["Feature b", "Feature a"]);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/shipped/b", "/shipped/a"]);
    expect(screen.getAllByText("Live")).toHaveLength(1);
    expect(screen.getAllByText(/built in 2 days/)).toHaveLength(2);
    expect(screen.getAllByText(/1 child issue\b/)).toHaveLength(2);
    expect(screen.getAllByText(/1 merged PR\b/)).toHaveLength(2);
  });

  it("dates the list by its newest story (a quiet week is not a stale feed), not as live", () => {
    const { container } = renderPage();
    expect(container.querySelector("time[datetime]")).not.toBeNull();
    expect(screen.getByText(/newest story from/i)).toBeInTheDocument();
    expect(screen.queryByText(/^as of/i)).toBeNull();
  });

  it("features the latest video above the list, linking to its story", () => {
    mockData.features = [feature("a")];
    videoData.video = { slug: "a", title: "A tour" };
    renderPage();
    expect(screen.getByTestId("promo-video")).toBeInTheDocument();
    const h2s = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(["Latest release", "Feature a"]);
    expect(screen.getByRole("link", { name: /a tour/i })).toHaveAttribute("href", "/shipped/a");
  });

  it("omits the latest-release section when there is no video", () => {
    mockData.features = [feature("a")];
    renderPage();
    expect(screen.queryByTestId("promo-video")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Latest release" })).toBeNull();
  });
});
