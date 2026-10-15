import { describe, it, expect } from "vitest";
import { SSE_EVENT_CATALOG, SSE_EVENT_NAMES } from "./sse-events.js";
import { SSE_EVENT_CATALOG as FROM_INDEX } from "./index.js";
import type { Reservation } from "./reservation.js";
import type { SseEvent } from "./sse-events.js";

/** The server's declared vocabulary — the names `ReservationEventEmitter` can emit. */
const SERVER_DECLARED_NAMES = [
  "reservation:created",
  "reservation:updated",
  "reservation:cancelled",
  "hold:created",
  "hold:released",
  "hold:confirmed",
  "table:updated",
  "floor-plan:created",
  "guest:lapsing",
  "table-status:changed",
];

describe("SSE event catalog", () => {
  it("contains exactly the server's declared event names", () => {
    expect([...SSE_EVENT_NAMES].sort()).toEqual([...SERVER_DECLARED_NAMES].sort());
  });

  it("does not contain venue:updated, which nothing emits", () => {
    expect(SSE_EVENT_NAMES).not.toContain("venue:updated");
  });

  it("derives SSE_EVENT_NAMES from the catalog rows", () => {
    expect([...SSE_EVENT_NAMES].sort()).toEqual(Object.keys(SSE_EVENT_CATALOG).sort());
  });

  it("is exported from the package index", () => {
    expect(FROM_INDEX).toBe(SSE_EVENT_CATALOG);
  });

  it("declares invalidation keys for every row (possibly empty)", () => {
    for (const name of SSE_EVENT_NAMES) {
      expect(Array.isArray(SSE_EVENT_CATALOG[name].invalidates)).toBe(true);
    }
  });
});

describe("SseEvent type", () => {
  it("correlates type with data (the old uncorrelated union accepted this)", () => {
    const reservation = {} as Reservation;
    // @ts-expect-error guest:lapsing carries LapsingGuest[], not a Reservation
    const bad: SseEvent = {
      type: "guest:lapsing",
      venueId: "v",
      timestamp: "t",
      data: reservation,
    };
    const good: SseEvent<"reservation:created"> = {
      type: "reservation:created",
      venueId: "v",
      timestamp: "t",
      data: reservation,
    };
    expect(bad.type).toBe("guest:lapsing");
    expect(good.data).toBe(reservation);
  });

  it("narrows data when switching on type", () => {
    const count = (e: SseEvent): number => (e.type === "guest:lapsing" ? e.data.length : 0);
    expect(count({ type: "guest:lapsing", venueId: "v", timestamp: "t", data: [] })).toBe(0);
  });

  it("floor-plan:created invalidates only the list query", () => {
    expect(SSE_EVENT_CATALOG["floor-plan:created"].invalidates).toEqual(["floorPlans"]);
  });
});
