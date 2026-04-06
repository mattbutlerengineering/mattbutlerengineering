import { EventEmitter } from "events";
import type { Reservation, Table, ReservationHold } from "@mbe/types";

export type ReservationEventType =
  | "reservation:created"
  | "reservation:updated"
  | "reservation:cancelled"
  | "hold:created"
  | "hold:released"
  | "hold:confirmed"
  | "table:updated";

export interface ReservationEvent {
  type: ReservationEventType;
  venueId: string;
  timestamp: string;
  data: Reservation | Table | ReservationHold;
}

/** Maximum concurrent SSE connections before Node emits a warning. */
const MAX_SSE_LISTENERS = 100;

/** Threshold (percentage of MAX_SSE_LISTENERS) at which we log a warning. */
const LISTENER_WARNING_THRESHOLD = 0.8;

class ReservationEventEmitter extends EventEmitter {
  private connectionCount = 0;

  constructor() {
    super();
    this.setMaxListeners(MAX_SSE_LISTENERS);
  }

  /** Current number of active SSE connections. */
  getConnectionCount(): number {
    return this.connectionCount;
  }

  emitChange(payload: ReservationEvent): boolean {
    return super.emit("change", payload);
  }

  onChange(listener: (payload: ReservationEvent) => void): this {
    this.connectionCount += 1;

    if (this.connectionCount >= MAX_SSE_LISTENERS * LISTENER_WARNING_THRESHOLD) {
      // Use process.stderr so this surfaces even without a logger instance
      process.stderr.write(
        `[reservationEvents] WARNING: ${this.connectionCount}/${MAX_SSE_LISTENERS} SSE listeners active — approaching limit\n`
      );
    }

    return super.on("change", listener);
  }

  offChange(listener: (payload: ReservationEvent) => void): this {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
    return super.off("change", listener);
  }
}

// Singleton event emitter for the service
export const reservationEvents = new ReservationEventEmitter();

// Helper functions to emit typed events
export function emitReservationCreated(reservation: Reservation): void {
  reservationEvents.emitChange({
    type: "reservation:created",
    venueId: reservation.venueId ?? "",
    timestamp: new Date().toISOString(),
    data: reservation,
  });
}

export function emitReservationUpdated(reservation: Reservation): void {
  reservationEvents.emitChange({
    type: "reservation:updated",
    venueId: reservation.venueId ?? "",
    timestamp: new Date().toISOString(),
    data: reservation,
  });
}

export function emitReservationCancelled(reservation: Reservation): void {
  reservationEvents.emitChange({
    type: "reservation:cancelled",
    venueId: reservation.venueId ?? "",
    timestamp: new Date().toISOString(),
    data: reservation,
  });
}

export function emitHoldCreated(hold: ReservationHold): void {
  reservationEvents.emitChange({
    type: "hold:created",
    venueId: hold.venueId,
    timestamp: new Date().toISOString(),
    data: hold,
  });
}

export function emitHoldReleased(hold: ReservationHold): void {
  reservationEvents.emitChange({
    type: "hold:released",
    venueId: hold.venueId,
    timestamp: new Date().toISOString(),
    data: hold,
  });
}

export function emitHoldConfirmed(reservation: Reservation): void {
  reservationEvents.emitChange({
    type: "hold:confirmed",
    venueId: reservation.venueId ?? "",
    timestamp: new Date().toISOString(),
    data: reservation,
  });
}

export function emitTableUpdated(table: Table): void {
  reservationEvents.emitChange({
    type: "table:updated",
    venueId: table.venueId ?? "",
    timestamp: new Date().toISOString(),
    data: table,
  });
}
