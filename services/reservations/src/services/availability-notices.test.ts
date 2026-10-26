import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import { listSlots, type BookingSnapshot } from "@mbe/availability";
import {
  DEFAULT_CLOSURE_MESSAGE,
  PAUSED_CALL_MESSAGE,
  PAUSED_MESSAGE,
  dayNotices as noticesFor,
} from "./availability-notices.js";

const DATE = "2026-11-05"; // a Thursday
const NOW = new Date("2026-11-01T12:00:00Z");

/** The way the listing calls it: with the seatings `listSlots` found. */
const dayNotices = (s: BookingSnapshot, date: string, phone: string | null) =>
  noticesFor(s, date, phone, listSlots(s, date, 2, "online", NOW).length);

function snapshot(
  dateRules: DateRule[],
  bookingTypes: ("online" | "phone")[] = ["online", "phone"]
) {
  const value: BookingSnapshot = {
    timezone: "America/New_York",
    config: {
      schedules: [{ id: "s1", name: "Regular week", kind: "regular", isRegular: true }],
      venueServices: [{ id: "vs1", name: "Dinner", position: 0 }],
      scheduleServices: [
        {
          id: "ss1",
          scheduleId: "s1",
          venueServiceId: "vs1",
          opensAt: 1020,
          lastSeatingAt: 1230,
          closesAt: 1320,
          seating: { version: 1, interval: 30 },
          bookingTypes,
        },
      ],
      assignments: [{ id: "a1", scheduleId: "s1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 }],
      dateRules,
    },
    tables: [],
    reservations: [],
    holds: [],
    settings: null,
  };
  return value;
}

const closure = (over: Partial<DateRule> = {}): DateRule =>
  ({
    kind: "closure",
    id: "r1",
    targetKind: "venue",
    startsOn: DATE,
    endsOn: DATE,
    ...over,
  }) as DateRule;

const pause = (over: Partial<DateRule> = {}): DateRule =>
  closure({ id: "p1", targetKind: "booking", bookingTypes: ["online"], endsOn: null, ...over });

describe("dayNotices", () => {
  it("says nothing on an ordinary open day", () => {
    expect(dayNotices(snapshot([]), DATE, null)).toEqual({});
  });

  it("reports a weekday the regular week does not cover as closed", () => {
    const s = snapshot([]);
    const closedThursday = {
      ...s,
      config: { ...s.config, assignments: [{ ...s.config.assignments[0]!, weekdays: [0] }] },
    };
    expect(dayNotices(closedThursday, DATE, null)).toEqual({
      closure: { message: DEFAULT_CLOSURE_MESSAGE },
    });
  });

  it("says nothing for a venue that never set hours (staff may take phone bookings)", () => {
    const s = snapshot([]);
    const empty = {
      ...s,
      config: { ...s.config, scheduleServices: [], assignments: [] },
    };
    expect(noticesFor(empty, DATE, null, 0, true)).toEqual({});
  });

  it("keeps a closed weekday selectable when a special-hours date opens it", () => {
    const s = snapshot([
      {
        kind: "special_hours",
        id: "sh1",
        targetKind: "venue",
        startsOn: DATE,
        endsOn: DATE,
        payload: {
          version: 1,
          services: [
            {
              venueServiceId: "vs1",
              opensAt: 1020,
              lastSeatingAt: 1230,
              closesAt: 1320,
              seating: { version: 1, interval: 30 },
              bookingTypes: ["online", "phone"],
            },
          ],
        },
      } as DateRule,
    ]);
    const closedThursday = {
      ...s,
      config: { ...s.config, assignments: [{ ...s.config.assignments[0]!, weekdays: [0] }] },
    };
    expect(dayNotices(closedThursday, DATE, null)).toEqual({});
  });

  it("carries the closure's guest message on a closed date", () => {
    const notices = dayNotices(
      snapshot([closure({ guestMessage: "Closed for a private event" })]),
      DATE,
      null
    );
    expect(notices).toEqual({ closure: { message: "Closed for a private event" } });
  });

  it("falls back to a default message when the closure has none", () => {
    expect(dayNotices(snapshot([closure()]), DATE, null)).toEqual({
      closure: { message: DEFAULT_CLOSURE_MESSAGE },
    });
  });

  it("is not a closure when a windowed closure leaves seatings open", () => {
    const partial = closure({ window: { version: 1, from: 1200, to: 1260 } } as Partial<DateRule>);
    expect(dayNotices(snapshot([partial]), DATE, null)).toEqual({});
  });

  it("reports an open-ended online pause with the phone while phone booking is open", () => {
    expect(dayNotices(snapshot([pause()]), DATE, "555-0100")).toEqual({
      bookingPaused: { message: PAUSED_CALL_MESSAGE, phone: "555-0100" },
    });
  });

  it("shows the pause's guest message, and no phone when phone booking is closed too", () => {
    const both = pause({ bookingTypes: ["online", "phone"], guestMessage: "Back in spring" });
    expect(dayNotices(snapshot([both]), DATE, "555-0100")).toEqual({
      bookingPaused: { message: "Back in spring" },
    });
  });

  it("uses the no-phone default when the venue has no phone", () => {
    expect(dayNotices(snapshot([pause()]), DATE, null)).toEqual({
      bookingPaused: { message: PAUSED_MESSAGE },
    });
  });

  it("treats a dated online-only closure as a closure, not a pause", () => {
    const dated = pause({ endsOn: DATE, guestMessage: "Phone only today" });
    expect(dayNotices(snapshot([dated]), DATE, "555-0100")).toEqual({
      closure: { message: "Phone only today" },
    });
  });
});
