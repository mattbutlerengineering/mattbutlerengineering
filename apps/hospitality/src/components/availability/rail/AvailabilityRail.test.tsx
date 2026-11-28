import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AvailabilityRail } from "./AvailabilityRail.js";
import type { RailGroup } from "./availability-rail.js";

const GROUPS: RailGroup[] = [
  {
    id: "top",
    nodes: [
      { id: "overview", label: { key: "availabilityHub.rail.overview" }, to: "/availability" },
    ],
  },
  {
    id: "open",
    heading: "availabilityHub.rail.groups.open",
    nodes: [
      {
        id: "hours",
        label: { key: "availabilityHub.routes.regularHours" },
        to: "/availability/hours",
        children: [
          { id: "service:d", label: { text: "Dinner" }, to: "/availability/hours?service=d" },
        ],
      },
    ],
  },
  {
    id: "sit",
    heading: "availabilityHub.rail.groups.sit",
    nodes: [
      { id: "floorPlan:m", label: { text: "Main floor" }, to: "/availability/floor-plans/m" },
    ],
  },
  { id: "views", heading: "availabilityHub.rail.groups.views", nodes: [] },
];

const onPick = vi.fn();

function renderRail(selectedId: string | null = null) {
  return render(
    <MemoryRouter>
      <AvailabilityRail groups={GROUPS} selectedId={selectedId} onPick={onPick} />
    </MemoryRouter>
  );
}

describe("AvailabilityRail", () => {
  it("is one labelled navigation landmark whose nodes are links to their addresses", () => {
    renderRail();
    const nav = screen.getByRole("navigation", { name: "Availability sections" });
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/availability"
    );
    expect(within(nav).getByRole("link", { name: "Dinner" })).toHaveAttribute(
      "href",
      "/availability/hours?service=d"
    );
    expect(within(nav).getByRole("link", { name: "Main floor" })).toHaveAttribute(
      "href",
      "/availability/floor-plans/m"
    );
  });

  it("nests a record under the rule it belongs to, so the hierarchy reads in the markup", () => {
    renderRail();
    const hours = screen.getByRole("link", { name: "Regular hours" }).closest("li")!;
    expect(within(hours).getByRole("link", { name: "Dinner" })).toBeInTheDocument();
  });

  it("heads each group, and leaves out a group with nothing in it", () => {
    renderRail();
    expect(screen.getByText("When you're open")).toBeInTheDocument();
    expect(screen.getByText("Where guests sit")).toBeInTheDocument();
    expect(screen.queryByText("Views")).not.toBeInTheDocument();
  });

  it("marks the selected node as the current page, and only that one", () => {
    renderRail("service:d");
    expect(screen.getByRole("link", { name: "Dinner" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Regular hours" })).not.toHaveAttribute("aria-current");
  });

  it("tells the sidebar about each pick, so the phone's drawer can close", () => {
    onPick.mockClear();
    renderRail();
    fireEvent.click(screen.getByRole("link", { name: "Dinner" }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("scrolls the sidebar to the current node, so the tree shows where the page sits", () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const { rerender } = renderRail("hours");
      expect(scroll.mock.contexts.at(-1)).toBe(screen.getByRole("link", { name: "Regular hours" }));
      rerender(
        <MemoryRouter>
          <AvailabilityRail groups={GROUPS} selectedId="service:d" onPick={onPick} />
        </MemoryRouter>
      );
      expect(scroll.mock.contexts.at(-1)).toBe(screen.getByRole("link", { name: "Dinner" }));
      expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });
});
