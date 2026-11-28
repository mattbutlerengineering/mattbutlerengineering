import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { axe } from "vitest-axe";
import type { DayTraceResult } from "@mbe/types";
import { venue } from "../components/availability/hub/hub-rows-test-helpers.js";
import { resolveFixtureDay } from "../components/availability/resolved-day-fixtures.js";

const trace = vi.hoisted(() => ({
  value: {
    data: undefined as unknown,
    isLoading: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  params: vi.fn(),
}));

vi.mock("../hooks/useDayTrace.js", () => ({
  useDayTrace: (params: unknown) => {
    trace.params(params);
    return trace.value;
  },
}));
vi.mock("../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import type { AvailabilityScope } from "../hooks/useAvailabilityScope.js";
import { AvailabilityExplainPage } from "./AvailabilityExplainPage.js";

const day = resolveFixtureDay();

const time = (minute: number, rest: Record<string, unknown> = {}) => ({
  serviceId: "svc-dinner",
  serviceName: "Dinner",
  minute,
  time: `${Math.floor(minute / 60)}:00`,
  startsAt: null,
  outcome: "bookable" as const,
  ...rest,
});

const RESULT: DayTraceResult = {
  serviceDate: "2026-12-04",
  partySize: 2,
  channel: "online",
  day: { ...day, explanation: day.explanation } as DayTraceResult["day"],
  basis: "current_rules",
  times: [
    time(1020),
    time(1140, {
      outcome: "removed",
      reason: {
        code: "pacing",
        scope: "venue",
        limit: 3,
        windowMinutes: 15,
        covers: 3,
        partySize: 2,
      },
    }),
    time(1200, {
      outcome: "removed",
      reason: { code: "no_free_table", suitableTables: 4 },
    }),
  ],
} as DayTraceResult;

function scopeOf(rest: Partial<AvailabilityScope> = {}): AvailabilityScope {
  return {
    venueId: "venue-1",
    timezone: "America/Los_Angeles",
    today: "2026-11-27",
    state: { config: venue(), version: 1, source: "rows" as const },
    load: "ready",
    loadError: null,
    isManager: true,
    rolePending: false,
    refresh: vi.fn(),
    offerUndo: vi.fn(),
    openClose: vi.fn(),
    openPause: vi.fn(),
    ...rest,
  };
}

function renderPage(
  entry = "/availability/explain?date=2026-12-04&partySize=2",
  scope = scopeOf()
) {
  const router = createMemoryRouter(
    [
      {
        path: "availability",
        element: <Outlet context={scope} />,
        children: [
          { index: true, element: <div>Hub</div> },
          { path: "explain", element: <AvailabilityExplainPage /> },
        ],
      },
    ],
    { initialEntries: [entry] }
  );
  return render(
    <main>
      <RouterProvider router={router} />
    </main>
  );
}

describe("AvailabilityExplainPage", () => {
  beforeEach(() => {
    trace.params.mockClear();
    trace.value = { data: RESULT, isLoading: false, error: null, refetch: vi.fn() };
  });

  it("reads the date and party size from the address, with one h1", () => {
    renderPage("/availability/explain?date=2026-12-04&partySize=6");
    expect(trace.params).toHaveBeenCalledWith({
      venueId: "venue-1",
      date: "2026-12-04",
      partySize: 6,
    });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("defaults to today and a party of 2", () => {
    renderPage("/availability/explain");
    expect(trace.params).toHaveBeenCalledWith({
      venueId: "venue-1",
      date: "2026-11-27",
      partySize: 2,
    });
  });

  it("answers in one line, then shows every time with its outcome and reason", () => {
    renderPage();
    expect(
      screen.getByText(
        "1 time bookable for a party of 2. The most common reason times are missing is pacing."
      )
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").filter((el) => el.hasAttribute("data-outcome"));
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Bookable")).toBeInTheDocument();
    expect(
      within(rows[1]!).getByText(/Pacing: 3 of 3 covers already booked at 7:00 PM/)
    ).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/Every suitable table is booked/)).toBeInTheDocument();
  });

  it("shows the rules that set the hours, from the same layer stack as the day drawer", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: "Rules that set the hours" })
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Why this day" })).toBeVisible();
  });

  it("links each removed time to the screen that edits its rule", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Edit booking rules, for 7:00 PM" })).toHaveAttribute(
      "href",
      "/availability/booking-rules"
    );
    expect(screen.getByRole("link", { name: "Edit the floor plan, for 8:00 PM" })).toHaveAttribute(
      "href",
      "/availability/floor-plans"
    );
  });

  it("gives a Host no link to a screen only a Manager can open, and keeps the ones a Host can", () => {
    trace.value = {
      ...trace.value,
      data: {
        ...RESULT,
        times: [
          ...RESULT.times,
          time(1260, { outcome: "removed", reason: { code: "booking_paused", channel: "online" } }),
          time(1320, { outcome: "removed", reason: { code: "nonexistent_local_time" } }),
        ],
      },
    };
    renderPage(undefined, scopeOf({ isManager: false }));
    const rows = screen.getAllByRole("listitem").filter((el) => el.hasAttribute("data-outcome"));
    expect(rows).toHaveLength(5);
    // Pacing (booking rules) and no free table (floor plan) open Manager-only screens.
    expect(within(rows[1]!).queryByRole("link")).toBeNull();
    expect(within(rows[2]!).queryByRole("link")).toBeNull();
    expect(within(rows[3]!).getByRole("link")).toHaveAttribute("href", "/availability/closures");
    expect(within(rows[4]!).getByRole("link")).toHaveAttribute(
      "href",
      "/availability/calendar?date=2026-12-04"
    );
  });

  it("says when the hours could not be read, with a retry, instead of waiting on them", () => {
    const refresh = vi.fn();
    renderPage(undefined, scopeOf({ state: null, load: "error", loadError: "boom", refresh }));
    expect(screen.getByText("Couldn't load availability")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /./ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("says when the venue is closed all day", () => {
    trace.value = { ...trace.value, data: { ...RESULT, times: [] } };
    renderPage();
    expect(screen.getByText("Closed all day, so there are no times to explain.")).toBeVisible();
  });

  it("shows a loading state", () => {
    trace.value = { ...trace.value, data: undefined, isLoading: true };
    renderPage();
    expect(screen.getByRole("status", { name: "Checking every time on this day" })).toBeVisible();
  });

  it("shows an error with a retry", () => {
    trace.value = { ...trace.value, data: undefined, error: new Error("boom") };
    renderPage();
    expect(screen.getByText("Couldn't explain this day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    renderPage();
    const results = await axe(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
