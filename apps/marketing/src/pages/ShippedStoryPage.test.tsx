import type { ReactNode } from "react";
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
});
