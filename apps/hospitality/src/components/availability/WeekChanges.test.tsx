import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type {
  AvailabilityConfig,
  DateRule,
  HolidayDecision,
  Schedule,
  ScheduleAssignment,
} from "@mbe/types";

const read = vi.hoisted(() => ({
  decisions: [] as HolidayDecision[] | undefined,
  error: null as Error | null,
  params: undefined as unknown,
}));
const access = vi.hoisted(() => ({ isManager: true, isPending: false }));
const viewport = vi.hoisted(() => ({ value: "desktop" as "phone" | "tablet" | "desktop" }));
const setDecision = vi.hoisted(() => vi.fn());
const clearDecision = vi.hoisted(() => vi.fn());

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
  useSetHolidayDecision: () => ({ mutateAsync: setDecision, isPending: false }),
  useClearHolidayDecision: () => ({ mutateAsync: clearDecision, isPending: false }),
}));
vi.mock("../../hooks/useIsManager.js", () => ({ useManagerAccess: () => access }));
vi.mock("../../hooks/useViewport.js", () => ({ useViewport: () => viewport.value }));
// Noon on Mon Nov 23 in Los Angeles: the service date is Nov 23, so the window is Nov 24 to 30.
vi.mock("../../hooks/useNow.js", () => ({ useNow: () => new Date("2026-11-23T20:00:00Z") }));

import { VenueContext, type VenueContextValue } from "../../contexts/venue-context-object.js";
import { WeekChanges } from "./WeekChanges.js";

const VENUE = {
  selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
} as VenueContextValue;

const closure = (id: string, startsOn: string, endsOn = startsOn, extra: Partial<DateRule> = {}) =>
  ({
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn,
    endsOn,
    window: null,
    ...extra,
  }) as DateRule;

const specialHours = (id: string, date: string) =>
  ({
    id,
    kind: "special_hours",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    window: null,
    payload: { version: 1, services: [{ name: "Dinner", opensAt: 1020, closesAt: 1320 }] },
  }) as unknown as DateRule;

const schedule = (id: string, fields: Partial<Schedule> = {}): Schedule => ({
  id,
  name: id,
  kind: "alternate",
  isRegular: false,
  archivedAt: null,
  ...fields,
});

const assignment = (
  id: string,
  scheduleId: string,
  fields: Partial<ScheduleAssignment> = {}
): ScheduleAssignment => ({
  id,
  scheduleId,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  startsOn: null,
  endsOn: null,
  precedence: 1,
  ...fields,
});

const config = (fields: Partial<AvailabilityConfig> = {}): AvailabilityConfig => ({
  schedules: [schedule("Regular", { kind: "regular", isRegular: true })],
  venueServices: [],
  scheduleServices: [],
  assignments: [assignment("a-regular", "Regular")],
  dateRules: [],
  ...fields,
});

const decided = (serviceDate: string): HolidayDecision => ({
  serviceDate,
  decision: "open_as_usual",
  createdAt: "2026-11-01T00:00:00Z",
});

function renderWeek(cfg: AvailabilityConfig = config()) {
  const onOpenDay = vi.fn();
  const onPlanHolidays = vi.fn();
  const view = render(
    <VenueContext value={VENUE}>
      <ToastProvider>
        <main>
          <WeekChanges
            venueId="venue-1"
            config={cfg}
            onOpenDay={onOpenDay}
            onPlanHolidays={onPlanHolidays}
          />
        </main>
      </ToastProvider>
    </VenueContext>
  );
  return { onOpenDay, onPlanHolidays, view };
}

const section = () => screen.getByRole("region", { name: "Next 7 days" });

describe("WeekChanges", () => {
  beforeEach(() => {
    // Thanksgiving (Nov 26) is decided unless a test says otherwise.
    read.decisions = [decided("2026-11-26")];
    read.error = null;
    access.isManager = true;
    access.isPending = false;
    viewport.value = "desktop";
    setDecision.mockReset().mockResolvedValue(decided("2026-11-26"));
    clearDecision.mockReset().mockResolvedValue(undefined);
  });

  it("renders nothing when nothing changes in the next seven days", () => {
    renderWeek();
    expect(screen.queryByRole("region", { name: "Next 7 days" })).toBeNull();
    expect(screen.queryByText("Next 7 days")).toBeNull();
  });

  it("reads holiday decisions with the same params as the holiday nudge", () => {
    renderWeek();
    expect(read.params).toEqual({ venueId: "venue-1", from: "2026-11-23", to: "2027-11-23" });
  });

  it("starts the day after the current service date, and ends six days later", () => {
    renderWeek(
      config({
        dateRules: [
          closure("today", "2026-11-23"),
          closure("last", "2026-11-30"),
          closure("after", "2026-12-01"),
        ],
      })
    );
    const rows = within(section()).getAllByRole("button");
    // Today's closure is TodayLine's; only its reopening tomorrow is news here.
    expect(rows.map((r) => r.textContent)).toEqual([
      "Tue, Nov 24 · Reopens",
      "Mon, Nov 30 · Closed",
    ]);
  });

  it("reads a closure in the venue's format and opens its first date", () => {
    const { onOpenDay } = renderWeek(
      config({ dateRules: [closure("c1", "2026-11-27", "2026-11-28")] })
    );
    fireEvent.click(within(section()).getByRole("button", { name: /Fri, Nov 27 to Sat, Nov 28/ }));
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-27");
    expect(within(section()).getByText("Fri, Nov 27 to Sat, Nov 28 · Closed")).toBeTruthy();
  });

  it("names a closure that ends early by its time, as Special dates does", () => {
    renderWeek(
      config({
        dateRules: [
          closure("c1", "2026-11-25", "2026-11-25", {
            window: { version: 1, from: 1260, to: 2880 },
          }),
        ],
      })
    );
    expect(within(section()).getByText("Wed, Nov 25 · Closing early · 9:00 PM")).toBeTruthy();
  });

  it("shows one reopen row when a chain of closures ends on one date, and opens it", () => {
    const { onOpenDay } = renderWeek(
      config({
        dateRules: [
          closure("c1", "2026-11-24", "2026-11-25"),
          closure("c2", "2026-11-25", "2026-11-26"),
        ],
      })
    );
    const reopen = within(section()).getAllByText("Fri, Nov 27 · Reopens");
    expect(reopen).toHaveLength(1);
    fireEvent.click(reopen[0]!);
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-27");
  });

  it("reads special hours with their range and opens the date", () => {
    const { onOpenDay } = renderWeek(config({ dateRules: [specialHours("s1", "2026-11-25")] }));
    const row = within(section()).getByText(/^Wed, Nov 25 · Special hours · 5:00 PM – 10:00 PM$/);
    fireEvent.click(row);
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-25");
  });

  it("reads seasonal hours starting and ending, and new regular hours, each opening its date", () => {
    const { onOpenDay } = renderWeek(
      config({
        schedules: [
          schedule("Regular", { kind: "regular", isRegular: true }),
          schedule("Winter"),
          schedule("Holiday week", { kind: "regular", isRegular: true }),
        ],
        assignments: [
          assignment("a-regular", "Regular"),
          assignment("a-winter", "Winter", {
            startsOn: "2026-11-25",
            endsOn: "2026-11-27",
            precedence: 2,
          }),
          assignment("a-new", "Holiday week", { startsOn: "2026-11-29" }),
        ],
      })
    );
    const texts = within(section())
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(texts).toEqual([
      "Wed, Nov 25 · Seasonal hours start: Winter",
      "Sat, Nov 28 · Seasonal hours end: Winter",
      "Sun, Nov 29 · New regular hours start",
    ]);
    fireEvent.click(within(section()).getByText("Sun, Nov 29 · New regular hours start"));
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-29");
  });

  it("collapses more than four rows behind Show N more", () => {
    const dates = ["24", "25", "26", "27", "28", "29"].map((d) => `2026-11-${d}`);
    renderWeek(config({ dateRules: dates.map((d) => closure(`c${d}`, d, "2026-11-29")) }));
    expect(within(section()).getAllByRole("button", { name: /open the day$/ })).toHaveLength(4);
    fireEvent.click(within(section()).getByRole("button", { name: /^Show \d+ more$/ }));
    expect(
      within(section()).getAllByRole("button", { name: /open the day$/ }).length
    ).toBeGreaterThan(4);
    expect(within(section()).queryByRole("button", { name: /^Show \d+ more$/ })).toBeNull();
  });

  it("on a phone, collapses to one count line with Show", () => {
    viewport.value = "phone";
    renderWeek(config({ dateRules: [closure("c1", "2026-11-25")] }));
    expect(within(section()).getByText("2 changes in the next 7 days")).toBeTruthy();
    expect(within(section()).queryByText("Wed, Nov 25 · Closed")).toBeNull();
    fireEvent.click(within(section()).getByRole("button", { name: "Show" }));
    expect(within(section()).getByText("Wed, Nov 25 · Closed")).toBeTruthy();
  });

  describe("holidays", () => {
    beforeEach(() => {
      read.decisions = [];
    });

    const holidayRow = () =>
      screen.getByRole("group", { name: "Thu, Nov 26 · Thanksgiving isn't planned yet" });

    it("offers a Manager Open as usual, with a toast whose Undo takes it back", async () => {
      renderWeek();
      fireEvent.click(within(holidayRow()).getByRole("button", { name: "Open as usual" }));
      expect(setDecision).toHaveBeenCalledWith({
        venueId: "venue-1",
        serviceDate: "2026-11-26",
        decision: "open_as_usual",
      });
      expect(await screen.findByText("Thanksgiving: open as usual")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(clearDecision).toHaveBeenCalledWith({ venueId: "venue-1", serviceDate: "2026-11-26" });
    });

    it("says Couldn't save with Retry when Open as usual fails, and Retry saves again", async () => {
      setDecision.mockRejectedValueOnce(new Error("down"));
      renderWeek();
      fireEvent.click(within(holidayRow()).getByRole("button", { name: "Open as usual" }));
      expect(await within(holidayRow()).findByText("Couldn't save.")).toBeTruthy();
      fireEvent.click(within(holidayRow()).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(setDecision).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(within(holidayRow()).queryByText("Couldn't save.")).toBeNull());
    });

    it("sends Plan to the holiday planner", () => {
      const { onPlanHolidays } = renderWeek();
      fireEvent.click(within(holidayRow()).getByRole("button", { name: "Plan holidays" }));
      expect(onPlanHolidays).toHaveBeenCalledTimes(1);
    });

    it("shows a Host no holiday rows, while day rows still work", () => {
      access.isManager = false;
      const { onOpenDay } = renderWeek(config({ dateRules: [closure("c1", "2026-11-24")] }));
      expect(screen.queryByText(/isn't planned yet/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Open as usual" })).toBeNull();
      fireEvent.click(within(section()).getByText("Tue, Nov 24 · Closed"));
      expect(onOpenDay).toHaveBeenCalledWith("2026-11-24");
    });

    it("shows a Manager whose access is still pending no holiday rows", () => {
      access.isPending = true;
      renderWeek();
      expect(screen.queryByText(/isn't planned yet/)).toBeNull();
      expect(screen.queryByRole("region", { name: "Next 7 days" })).toBeNull();
    });

    it("leaves holiday rows out while the decisions load or failed, and still shows rule rows", () => {
      read.decisions = undefined;
      const first = renderWeek(config({ dateRules: [closure("c1", "2026-11-24")] }));
      expect(screen.queryByText(/isn't planned yet/)).toBeNull();
      expect(within(section()).getByText("Tue, Nov 24 · Closed")).toBeTruthy();
      first.view.unmount();

      read.error = new Error("down");
      renderWeek(config({ dateRules: [closure("c1", "2026-11-24")] }));
      expect(screen.queryByText(/isn't planned yet/)).toBeNull();
      expect(within(section()).getByText("Tue, Nov 24 · Closed")).toBeTruthy();
    });
  });
});
