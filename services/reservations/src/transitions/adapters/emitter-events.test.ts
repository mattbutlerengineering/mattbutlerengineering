import { describe, it, expect, vi } from "vitest";
import type { Reservation } from "@mbe/types";
import { ReservationEventEmitter, type ReservationEvent } from "../../services/events.js";
import { createEmitterEvents } from "./emitter-events.js";

describe("emitter events adapter", () => {
  it("stamps a timestamp and emits on the live emitter's change channel", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2030-06-01T12:00:00.000Z") });
    try {
      const emitter = new ReservationEventEmitter();
      const seen: ReservationEvent[] = [];
      emitter.on("change", (e: ReservationEvent) => seen.push(e));
      const reservation = { id: "res-1", venueId: "venue-1" } as Reservation;

      createEmitterEvents(emitter).publish({
        type: "reservation:updated",
        venueId: "venue-1",
        data: reservation,
      });

      expect(seen).toEqual([
        {
          type: "reservation:updated",
          venueId: "venue-1",
          data: reservation,
          timestamp: "2030-06-01T12:00:00.000Z",
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
