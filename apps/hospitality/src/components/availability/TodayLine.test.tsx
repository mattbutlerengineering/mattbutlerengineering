import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { axe } from "vitest-axe";
import type { TodayItem, TodayLineModel } from "./today-line.js";
import type { TodayLineState } from "../../hooks/useTodayLine.js";

const hook = vi.hoisted(() => ({ state: {} as unknown }));
vi.mock("../../hooks/useTodayLine.js", () => ({ useTodayLine: () => hook.state }));

import { TodayLine } from "./TodayLine.js";

const HOURS = [
  { name: "Lunch", opensAt: 690, closesAt: 900 },
  { name: "Dinner", opensAt: 1020, closesAt: 1320 },
];

function model(items: readonly TodayItem[] = [], over: Partial<TodayLineModel> = {}) {
  return { serviceDate: "2026-11-08", closed: false, hours: HOURS, items, ...over };
}

function setState(state: Partial<TodayLineState>) {
  hook.state = { status: "ready", model: model(), retry: vi.fn(), ...state };
}

function renderLine(bannerShowsOnline = false) {
  return render(
    <MemoryRouter>
      <TodayLine venueId="venue-1" bannerShowsOnline={bannerShowsOnline} />
    </MemoryRouter>
  );
}

function itemTexts(): string[] {
  const list = screen.queryByRole("list", { name: "In force tonight" });
  return list
    ? within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent ?? "")
    : [];
}

describe("TodayLine", () => {
  beforeEach(() => {
    setState({});
  });

  it("names the day and its hours, with the link and nothing in force", () => {
    renderLine();
    const section = screen.getByRole("region", { name: "Today" });
    expect(section).toHaveTextContent("Sun, Nov 8");
    expect(section).toHaveTextContent("Lunch 11:30 AM–3:00 PM · Dinner 5:00 PM–10:00 PM");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByRole("link", { name: "Change tonight" })).toHaveAttribute(
      "href",
      "/timeline?tonight=open"
    );
  });

  it("reads a closed day as Closed, with the link", () => {
    setState({ model: model([], { closed: true, hours: [] }) });
    renderLine();
    expect(screen.getByRole("region", { name: "Today" })).toHaveTextContent("Closed");
    expect(screen.getByRole("link", { name: "Change tonight" })).toBeInTheDocument();
  });

  it("words every kind of item as the UX table does", () => {
    setState({
      model: model([
        { kind: "serviceClosed", name: "Lunch" },
        { kind: "serviceClosed", name: "Patio" },
        { kind: "closingEarly", at: 1290, name: null },
        { kind: "closingEarly", at: 1290, name: "Dinner" },
        { kind: "closedBetween", name: null, from: 900, to: 960 },
        { kind: "closedBetween", name: "Lunch", from: 720, to: 780 },
        { kind: "paused", channels: ["online"], from: null },
        { kind: "paused", channels: ["phone"], from: null },
        { kind: "paused", channels: ["online", "phone"], from: null },
        { kind: "paused", channels: ["phone"], from: 1110 },
        { kind: "pausedBetween", channels: ["online", "waitlist"], from: 1080, to: 1140 },
        { kind: "tonight", change: { ruleId: "a", kind: "close_early", closeAt: 1290 } },
        { kind: "tonight", change: { ruleId: "b", kind: "stop_window", from: 1170, to: 1200 } },
        {
          kind: "tonight",
          change: { ruleId: "c", kind: "block_tables", tableCount: 2, from: 0, to: 2880 },
        },
        { kind: "tonight", change: { ruleId: "d", kind: "pacing", covers: 8 } },
        { kind: "tonight", change: { ruleId: "e", kind: "pause_online" } },
      ]),
    });
    renderLine();
    expect(itemTexts()).toEqual([
      "Lunch closed",
      "Patio closed",
      "Closing early · 9:30 PM",
      "Dinner closing early · 9:30 PM",
      "Closed 3:00 PM–4:00 PM",
      "Lunch closed 12:00 PM–1:00 PM",
      "Online paused",
      "Phone paused",
      "Online and phone paused",
      "Phone paused from 6:30 PM",
      "Online and waitlist paused 6:00 PM–7:00 PM",
      "No bookings 7:30 PM–8:00 PM",
      "2 tables blocked · rest of tonight",
      "Pacing 8 covers",
      "Online paused · rest of tonight",
    ]);
  });

  it("shows two items with the same words once", () => {
    setState({
      model: model([
        { kind: "closingEarly", at: 1290, name: null },
        { kind: "tonight", change: { ruleId: "a", kind: "close_early", closeAt: 1290 } },
      ]),
    });
    renderLine();
    expect(itemTexts()).toEqual(["Closing early · 9:30 PM"]);
  });

  it("keeps the page's static description in the slot while loading: no region, spinner or link", () => {
    setState({ status: "loading", model: null });
    renderLine();
    expect(screen.getByText("Your hours, holidays and one-off changes.")).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("flows label, date, hours, items, then the link, in that order", () => {
    setState({ model: model([{ kind: "serviceClosed", name: "Lunch" }]) });
    renderLine();
    const text = screen.getByRole("region", { name: "Today" }).textContent ?? "";
    const order = [
      "Today",
      "Sun, Nov 8",
      "Lunch 11:30 AM–3:00 PM",
      "Dinner 5:00 PM–10:00 PM",
      "Lunch closed",
      "Change tonight",
    ].map((piece) => text.indexOf(piece));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("leaves the hours out, with no dangling separator, when the day gave none (old API)", () => {
    setState({
      model: model([{ kind: "tonight", change: { ruleId: "a", kind: "pacing", covers: 8 } }], {
        hours: [],
      }),
    });
    renderLine();
    const text = screen.getByRole("region", { name: "Today" }).textContent ?? "";
    expect(text).toMatch(/^Today · Sun, Nov 8 Pacing 8 covers/);
    expect(text).not.toContain("Closed");
  });

  it("says so with Retry when the day failed to load", () => {
    const retry = vi.fn();
    setState({ status: "error", model: null, retry });
    renderLine();
    expect(screen.getByText("Couldn't load today's hours.")).toBeInTheDocument();
    // No live region on first paint (ux.md F1 accessibility).
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations", async () => {
    setState({ model: model([{ kind: "serviceClosed", name: "Lunch" }]) });
    const { container } = renderLine();
    expect(
      (await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations
    ).toEqual([]);
  });
});
