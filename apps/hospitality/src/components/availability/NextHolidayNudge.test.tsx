import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AvailabilityConfig, DateRule, HolidayDecision } from "@mbe/types";

const read = vi.hoisted(() => ({
  decisions: [] as HolidayDecision[] | undefined,
  error: null as Error | null,
  params: undefined as unknown,
}));

vi.mock("../../hooks/useHolidayDecisions.js", () => ({
  useHolidayDecisions: (params: unknown) => {
    read.params = params;
    return {
      data: read.decisions,
      isLoading: read.decisions === undefined && read.error === null,
      error: read.error,
      refetch: vi.fn(),
    };
  },
}));

import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { NextHolidayNudge } from "./NextHolidayNudge.js";

const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;

const config = (...dateRules: DateRule[]): AvailabilityConfig => ({
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules,
});

const decision = (serviceDate: string): HolidayDecision => ({
  serviceDate,
  decision: "open_as_usual",
  createdAt: "2026-11-01T00:00:00Z",
});

const closure = (startsOn: string, endsOn = startsOn) =>
  ({ id: `c-${startsOn}`, kind: "closure", targetKind: "venue", startsOn, endsOn }) as DateRule;

function renderNudge(rules: DateRule[] = [], today = "2026-11-08") {
  const onPlan = vi.fn();
  render(
    <VenueContext value={VENUE}>
      <NextHolidayNudge venueId="venue-1" config={config(...rules)} today={today} onPlan={onPlan} />
    </VenueContext>
  );
  return onPlan;
}

describe("NextHolidayNudge", () => {
  beforeEach(() => {
    read.decisions = [];
    read.error = null;
  });

  it("names the next holiday within a month that nothing has decided, and goes to Special dates", () => {
    const onPlan = renderNudge();
    expect(screen.getByText("Thanksgiving is Thu, Nov 26 and isn't planned yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Plan holidays" }));
    expect(onPlan).toHaveBeenCalledTimes(1);
    // The decisions are read for the same twelve months Special dates reads.
    expect(read.params).toEqual({ venueId: "venue-1", from: "2026-11-08", to: "2027-11-08" });
  });

  it("counts an Open as usual decision as decided, and moves on to nothing within the month", () => {
    read.decisions = [decision("2026-11-26")];
    renderNudge();
    expect(screen.queryByText(/Thanksgiving is/)).toBeNull();
    expect(screen.queryByText(/isn't planned yet/)).toBeNull();
  });

  it("counts a closure as decided", () => {
    renderNudge([closure("2026-11-26")]);
    expect(screen.queryByText(/isn't planned yet/)).toBeNull();
  });

  it("counts a rule this flow does not own, a range over the date, as decided", () => {
    renderNudge([closure("2026-11-20", "2026-11-30")]);
    expect(screen.queryByText(/isn't planned yet/)).toBeNull();
  });

  it("names the next undecided one when the nearest is decided", () => {
    read.decisions = [decision("2026-12-24")];
    renderNudge([], "2026-12-20");
    expect(screen.getByText("Christmas Day is Fri, Dec 25 and isn't planned yet.")).toBeTruthy();
  });

  it("says nothing while the decisions load, and nothing if they failed to load", () => {
    read.decisions = undefined;
    const { unmount } = render(
      <VenueContext value={VENUE}>
        <NextHolidayNudge venueId="venue-1" config={config()} today="2026-11-08" onPlan={vi.fn()} />
      </VenueContext>
    );
    expect(screen.queryByText(/isn't planned yet/)).toBeNull();
    unmount();

    read.error = new Error("down");
    renderNudge();
    expect(screen.queryByText(/isn't planned yet/)).toBeNull();
  });

  it("says nothing when no holiday falls within thirty days", () => {
    renderNudge([], "2026-07-05");
    expect(screen.queryByText(/isn't planned yet/)).toBeNull();
  });
});
