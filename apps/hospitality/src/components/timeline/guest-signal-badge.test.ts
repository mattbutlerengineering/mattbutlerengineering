import { describe, expect, it } from "vitest";
import type { GuestSignalEventData, Reservation, SseEvent } from "@mbe/types";
import {
  badgesByTableId,
  deriveGuestSignalBadge,
  reduceGuestSignals,
  type GuestSignalBadge,
} from "./guest-signal-badge.js";

const START = "2026-11-11T19:30:00.000Z";
const minutesAfter = (iso: string, minutes: number) =>
  new Date(new Date(iso).getTime() + minutes * 60_000);

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    tableId: "t1",
    status: "CONFIRMED",
    startTime: START,
    ...overrides,
  } as Reservation;
}

function late(
  minutes: number,
  overrides: Partial<GuestSignalEventData> = {}
): GuestSignalEventData {
  return {
    reservationId: "r1",
    kind: "running-late",
    minutes,
    eta: minutesAfter(START, minutes).toISOString(),
    ...overrides,
  };
}

const before = new Date("2026-11-11T19:20:00.000Z");

describe("deriveGuestSignalBadge", () => {
  it("shows the badge for a late signal with minutes and the ETA", () => {
    expect(
      deriveGuestSignalBadge({
        signal: late(15),
        reservation: reservation(),
        seated: false,
        now: before,
      })
    ).toEqual({ minutes: 15, eta: "2026-11-11T19:45:00.000Z", held: true });
  });

  it("holds the table through the ETA, then stops holding but keeps the badge", () => {
    const badge = (now: Date) =>
      deriveGuestSignalBadge({ signal: late(15), reservation: reservation(), seated: false, now });
    expect(badge(minutesAfter(START, 14))?.held).toBe(true);
    expect(badge(minutesAfter(START, 15))).toMatchObject({ minutes: 15, held: false });
    expect(badge(minutesAfter(START, 40))).toMatchObject({ minutes: 15, held: false });
  });

  it("treats an ETA already past on arrival (late signal after start) as not held", () => {
    const signal = late(5);
    expect(
      deriveGuestSignalBadge({
        signal,
        reservation: reservation(),
        seated: false,
        now: minutesAfter(START, 30),
      })
    ).toMatchObject({ minutes: 5, held: false });
  });

  it("shows nothing without a signal or for an arrived signal", () => {
    const input = { reservation: reservation(), seated: false, now: before };
    expect(deriveGuestSignalBadge({ ...input, signal: undefined })).toBeNull();
    expect(
      deriveGuestSignalBadge({ ...input, signal: { reservationId: "r1", kind: "arrived" } })
    ).toBeNull();
  });

  it("clears once the party is seated", () => {
    expect(
      deriveGuestSignalBadge({
        signal: late(15),
        reservation: reservation(),
        seated: true,
        now: before,
      })
    ).toBeNull();
  });

  it("clears when the reservation is no longer confirmed", () => {
    for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW", "PENDING"] as const) {
      expect(
        deriveGuestSignalBadge({
          signal: late(15),
          reservation: reservation({ status }),
          seated: false,
          now: before,
        })
      ).toBeNull();
    }
  });

  it("clears when the reservation start moved after the signal (ETA no longer start + minutes)", () => {
    expect(
      deriveGuestSignalBadge({
        signal: late(15),
        reservation: reservation({ startTime: "2026-11-11T20:00:00.000Z" }),
        seated: false,
        now: before,
      })
    ).toBeNull();
  });

  it("clears on a malformed late signal (missing or invalid minutes / ETA)", () => {
    const input = { reservation: reservation(), seated: false, now: before };
    expect(deriveGuestSignalBadge({ ...input, signal: late(15, { eta: undefined }) })).toBeNull();
    expect(deriveGuestSignalBadge({ ...input, signal: late(15, { eta: "nope" }) })).toBeNull();
    expect(
      deriveGuestSignalBadge({ ...input, signal: late(15, { minutes: undefined }) })
    ).toBeNull();
  });
});

function event<K extends SseEvent["type"]>(type: K, data: unknown): SseEvent {
  return { type, venueId: "v1", timestamp: "2026-11-11T19:00:00.000Z", data } as SseEvent;
}

describe("reduceGuestSignals", () => {
  it("keeps only the latest signal per reservation", () => {
    const first = reduceGuestSignals(new Map(), event("reservation:guest-signal", late(5)));
    const second = reduceGuestSignals(first, event("reservation:guest-signal", late(15)));
    expect(second.get("r1")).toEqual(late(15));
    expect(first.get("r1")).toEqual(late(5));
  });

  it("drops the signal when the reservation changes or is cancelled", () => {
    const withSignal = reduceGuestSignals(new Map(), event("reservation:guest-signal", late(15)));
    for (const type of [
      "reservation:updated",
      "reservation:cancelled",
      "hold:confirmed",
    ] as const) {
      expect(reduceGuestSignals(withSignal, event(type, { id: "r1" })).has("r1")).toBe(false);
    }
  });

  it("returns the same map for unrelated events and unrelated reservations", () => {
    const withSignal = reduceGuestSignals(new Map(), event("reservation:guest-signal", late(15)));
    expect(reduceGuestSignals(withSignal, event("table:updated", { id: "t1" }))).toBe(withSignal);
    expect(reduceGuestSignals(withSignal, event("reservation:updated", { id: "other" }))).toBe(
      withSignal
    );
  });
});

describe("badgesByTableId", () => {
  const badge = (eta: string): GuestSignalBadge => ({ minutes: 15, eta, held: true });

  it("keys badges by the reservation's table, earliest ETA first when a table has two", () => {
    const result = badgesByTableId(
      [
        reservation({ id: "a", tableId: "t1" }),
        reservation({ id: "b", tableId: "t1" }),
        reservation({ id: "c", tableId: "t2" }),
      ],
      new Map([
        ["a", badge("2026-11-11T21:00:00.000Z")],
        ["b", badge("2026-11-11T19:45:00.000Z")],
      ])
    );
    expect([...result.keys()]).toEqual(["t1"]);
    expect(result.get("t1")?.eta).toBe("2026-11-11T19:45:00.000Z");
  });
});
