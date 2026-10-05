import type { ReservationEventEmitter } from "../../services/events.js";
import type { EventsPort } from "../ports.js";

/**
 * Production events adapter: stamps the timestamp and emits on the single live
 * `ReservationEventEmitter` — the instance `routes/events.ts` subscribes to,
 * so its table-status derivation sees every published event.
 */
export function createEmitterEvents(emitter: ReservationEventEmitter): EventsPort {
  return {
    publish(event) {
      emitter.emitChange({ ...event, timestamp: new Date().toISOString() });
    },
  };
}
