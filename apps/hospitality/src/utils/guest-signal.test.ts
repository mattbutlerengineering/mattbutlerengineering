import { describe, it, expect } from "vitest";
import {
  MAX_ARRIVED_SIGNALS,
  MAX_LATE_SIGNALS,
  guestSignalAvailability,
  type GuestSignalAvailabilityInput,
} from "./guest-signal.js";

// Same boundaries as services/reservations/src/services/can-signal.ts (the server stays authoritative).
const START = "2026-06-15T02:00:00.000Z"; // 19:00 on 2026-06-14 in America/Los_Angeles (PDT)
const MIN = 60_000;
const HOUR = 60 * MIN;

function input(
  overrides: Partial<GuestSignalAvailabilityInput> = {}
): GuestSignalAvailabilityInput {
  return {
    status: "CONFIRMED",
    startTime: START,
    timezone: "America/Los_Angeles",
    now: new Date(Date.parse(START) - HOUR),
    priorSignals: { late: 0, arrived: 0 },
    ...overrides,
  };
}

const at = (offsetMs: number): Date => new Date(Date.parse(START) + offsetMs);

describe("guestSignalAvailability", () => {
  it("pins the server's caps", () => {
    expect(MAX_LATE_SIGNALS).toBe(3);
    expect(MAX_ARRIVED_SIGNALS).toBe(1);
  });

  it("allows both signals inside the window", () => {
    expect(guestSignalAvailability(input())).toEqual({
      lateAllowed: true,
      arrivedAllowed: true,
      reason: null,
    });
  });

  it("opens inclusively at exactly T-3h and not a millisecond earlier", () => {
    expect(guestSignalAvailability(input({ now: at(-3 * HOUR) })).reason).toBeNull();
    expect(guestSignalAvailability(input({ now: at(-3 * HOUR - 1) })).reason).toBe(
      "outside-window"
    );
  });

  it("closes inclusively at exactly T+45m and not a millisecond later", () => {
    expect(guestSignalAvailability(input({ now: at(45 * MIN) })).reason).toBeNull();
    expect(guestSignalAvailability(input({ now: at(45 * MIN + 1) })).reason).toBe("outside-window");
  });

  it("disables both outside the window", () => {
    expect(guestSignalAvailability(input({ now: at(-4 * HOUR) }))).toEqual({
      lateAllowed: false,
      arrivedAllowed: false,
      reason: "outside-window",
    });
  });

  it("refuses a window that spans local midnight when the venue day differs", () => {
    // Start 00:30 on 06-15 Auckland (NZST, +12): 12:30Z on 06-14. At T-1h it is 23:30 on 06-14 there.
    const start = "2026-06-14T12:30:00.000Z";
    const now = new Date(Date.parse(start) - HOUR);
    expect(
      guestSignalAvailability(input({ startTime: start, timezone: "Pacific/Auckland", now })).reason
    ).toBe("outside-window");
    // From 00:00 Auckland on, the same instant-window is on the reservation's local day.
    const after = new Date(Date.parse(start) - 30 * MIN);
    expect(
      guestSignalAvailability(input({ startTime: start, timezone: "Pacific/Auckland", now: after }))
        .reason
    ).toBeNull();
  });

  it("decides the local day in the venue zone, not the runner's", () => {
    // 19:00 PDT on 06-14 is already 06-15 in UTC; the venue day must still match.
    expect(guestSignalAvailability(input({ now: at(MIN) })).reason).toBeNull();
    expect(
      guestSignalAvailability(input({ timezone: "Asia/Tokyo", now: at(MIN) })).reason
    ).toBeNull();
  });

  it("opens at local midnight, not T-3h, when the 3h window would reach into the previous venue day (spring-forward)", () => {
    // 2026-03-08 02:00 PST springs to 03:00 PDT. Start 03:30 PDT = 10:30Z, so T-3h (07:30Z) is 23:30 PST on 03-07.
    const start = "2026-03-08T10:30:00.000Z";
    const args = { startTime: start, timezone: "America/Los_Angeles" };
    const midnight = Date.parse("2026-03-08T08:00:00.000Z"); // 00:00 PST on 03-08
    expect(guestSignalAvailability(input({ ...args, now: new Date(midnight - 1) })).reason).toBe(
      "outside-window"
    );
    expect(guestSignalAvailability(input({ ...args, now: new Date(midnight) })).reason).toBeNull();
  });

  it("holds across the fall-back transition", () => {
    // 2026-11-01 02:00 PDT falls back to 01:00 PST. Start 00:30 PDT = 07:30Z; T-3h is 21:30 PDT the previous day.
    const start = "2026-11-01T07:30:00.000Z";
    const args = { startTime: start, timezone: "America/Los_Angeles" };
    expect(
      guestSignalAvailability(input({ ...args, now: new Date(Date.parse(start) - 3 * HOUR) }))
        .reason
    ).toBe("outside-window");
    expect(
      guestSignalAvailability(input({ ...args, now: new Date(Date.parse(start) - 30 * MIN) }))
        .reason
    ).toBeNull();
    expect(
      guestSignalAvailability(input({ ...args, now: new Date(Date.parse(start) + 45 * MIN) }))
        .reason
    ).toBeNull();
  });

  it("refuses anything but a confirmed booking", () => {
    for (const status of ["PENDING", "CANCELLED", "SEATED", "NO_SHOW", "COMPLETED"]) {
      expect(guestSignalAvailability(input({ status }))).toEqual({
        lateAllowed: false,
        arrivedAllowed: false,
        reason: "not-confirmed",
      });
    }
  });

  it("caps late at 3 and arrived at 1 independently, inclusive of the cap", () => {
    expect(
      guestSignalAvailability(input({ priorSignals: { late: 2, arrived: 0 } })).lateAllowed
    ).toBe(true);
    expect(guestSignalAvailability(input({ priorSignals: { late: 3, arrived: 0 } }))).toEqual({
      lateAllowed: false,
      arrivedAllowed: true,
      reason: null,
    });
    expect(guestSignalAvailability(input({ priorSignals: { late: 0, arrived: 1 } }))).toEqual({
      lateAllowed: true,
      arrivedAllowed: false,
      reason: null,
    });
  });

  it("treats an unparseable start time as outside the window", () => {
    expect(guestSignalAvailability(input({ startTime: "not-a-date" })).reason).toBe(
      "outside-window"
    );
  });
});
