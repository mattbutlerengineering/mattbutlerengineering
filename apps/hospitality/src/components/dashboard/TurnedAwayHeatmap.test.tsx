import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import type { LostDemand } from "@mbe/types";
import { TurnedAwayHeatmap } from "./TurnedAwayHeatmap.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="card">
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
  Text: ({ children, ...props }: { children?: React.ReactNode; color?: string }) => (
    <span {...props}>{children}</span>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
}));

const demand: LostDemand = {
  venueId: "v1",
  from: "2026-10-05",
  to: "2026-11-01",
  total: 17,
  cells: [
    { weekday: 5, hour: 19, searches: 6 },
    { weekday: 6, hour: 21, searches: 4 },
  ],
  anyTime: [{ weekday: 0, searches: 7 }],
};

describe("TurnedAwayHeatmap", () => {
  it("shows the empty state, not a blank grid, when nobody was turned away", () => {
    render(<TurnedAwayHeatmap demand={{ ...demand, total: 0, cells: [], anyTime: [] }} />);

    expect(screen.getByText(/no guests were turned away/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the empty state when the read came back with nothing", () => {
    render(<TurnedAwayHeatmap demand={null} />);

    expect(screen.getByText(/no guests were turned away/i)).toBeInTheDocument();
  });

  // Before the read resolves, "nobody was turned away" would be a false claim.
  it("makes no claim while the read is still loading", () => {
    render(<TurnedAwayHeatmap demand={undefined} />);

    expect(screen.queryByText(/no guests were turned away/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /turned away/i })).toBeInTheDocument();
  });

  it("renders a named table with weekday column headers", () => {
    render(<TurnedAwayHeatmap demand={demand} />);

    const table = screen.getByRole("table", { name: /turned-away searches by weekday and hour/i });
    const columns = within(table).getAllByRole("columnheader");
    expect(columns.map((c) => c.getAttribute("abbr"))).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });

  it("puts each count in its weekday column and hour row, as text", () => {
    render(<TurnedAwayHeatmap demand={demand} />);

    const friday7pm = screen.getByRole("cell", { name: "6", description: "" });
    const row = friday7pm.closest("tr")!;
    expect(within(row).getByRole("rowheader")).toHaveTextContent(/7\s?PM/i);
    const cells = within(row).getAllByRole("cell");
    expect(cells[5]).toBe(friday7pm);
  });

  it("trims to the hours that have counts, and keeps the quiet ones between", () => {
    render(<TurnedAwayHeatmap demand={demand} />);

    const hourHeaders = screen
      .getAllByRole("rowheader")
      .map((h) => h.textContent ?? "")
      .filter((text) => !/no time/i.test(text));
    expect(hourHeaders).toHaveLength(3); // 7 PM, 8 PM, 9 PM
  });

  it("puts searches that named no time in their own row, never in an hour", () => {
    render(<TurnedAwayHeatmap demand={demand} />);

    const anyRow = screen.getByRole("rowheader", { name: /no time given/i }).closest("tr")!;
    const cells = within(anyRow).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("7"); // Sunday
    expect(screen.getByText(/named no time/i)).toBeInTheDocument();
    // The Sunday count appears in no hour row.
    const hourRows = screen
      .getAllByRole("row")
      .filter((r) => r !== anyRow && within(r).queryAllByRole("rowheader").length > 0);
    for (const hourRow of hourRows) {
      expect(within(hourRow).getAllByRole("cell")[0]).toHaveTextContent("0");
    }
  });

  it("renders only the any-time row when no search named a time", () => {
    render(<TurnedAwayHeatmap demand={{ ...demand, total: 7, cells: [] }} />);

    expect(screen.getByRole("rowheader", { name: /no time given/i })).toBeInTheDocument();
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
  });

  it("summarises the total in words", () => {
    render(<TurnedAwayHeatmap demand={demand} />);

    expect(screen.getByText(/17 searches found no table/i)).toBeInTheDocument();
  });

  it("marks heat on cells with a count only, so a number always carries the meaning", () => {
    render(<TurnedAwayHeatmap demand={demand} />);

    const hot = screen.getByRole("cell", { name: "6", description: "" });
    expect(hot.getAttribute("style")).toContain("--heat");
    expect(hot).toHaveTextContent("6");
  });
});
