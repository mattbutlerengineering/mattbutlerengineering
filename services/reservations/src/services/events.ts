import { EventEmitter } from "events";
import type { Reservation, Table, ReservationHold, FloorPlan, LapsingGuest } from "@mbe/types";

export type ReservationEventType =
  | "reservation:created"
  | "reservation:updated"
  | "reservation:cancelled"
  | "hold:created"
  | "hold:released"
  | "hold:confirmed"
  | "table:updated"
  | "floor-plan:created"
  | "guest:lapsing";

export interface ReservationEvent {
  type: ReservationEventType;
  venueId: string;
  timestamp: string;
  data: Reservation | Table | ReservationHold | FloorPlan | LapsingGuest[];
}

/** Maximum concurrent SSE connections before Node emits a warning. */
const MAX_SSE_LISTENERS = 100;

/** Threshold (percentage of MAX_SSE_LISTENERS) at which we log a warning. */
const LISTENER_WARNING_THRESHOLD = 0.8;

export class ReservationEventEmitter extends EventEmitter {
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

  emitReservationCreated(reservation: Reservation): void {
    this.emitChange({
      type: "reservation:created",
      venueId: reservation.venueId ?? "",
      timestamp: new Date().toISOString(),
      data: reservation,
    });
  }

  emitReservationUpdated(reservation: Reservation): void {
    this.emitChange({
      type: "reservation:updated",
      venueId: reservation.venueId ?? "",
      timestamp: new Date().toISOString(),
      data: reservation,
    });
  }

  emitReservationCancelled(reservation: Reservation): void {
    this.emitChange({
      type: "reservation:cancelled",
      venueId: reservation.venueId ?? "",
      timestamp: new Date().toISOString(),
      data: reservation,
    });
  }

  emitHoldCreated(hold: ReservationHold): void {
    this.emitChange({
      type: "hold:created",
      venueId: hold.venueId,
      timestamp: new Date().toISOString(),
      data: hold,
    });
  }

  emitHoldReleased(hold: ReservationHold): void {
    this.emitChange({
      type: "hold:released",
      venueId: hold.venueId,
      timestamp: new Date().toISOString(),
      data: hold,
    });
  }

  emitHoldConfirmed(reservation: Reservation): void {
    this.emitChange({
      type: "hold:confirmed",
      venueId: reservation.venueId ?? "",
      timestamp: new Date().toISOString(),
      data: reservation,
    });
  }

  emitTableUpdated(table: Table): void {
    this.emitChange({
      type: "table:updated",
      venueId: table.venueId ?? "",
      timestamp: new Date().toISOString(),
      data: table,
    });
  }

  emitFloorPlanCreated(floorPlan: FloorPlan): void {
    this.emitChange({
      type: "floor-plan:created",
      venueId: floorPlan.venueId,
      timestamp: new Date().toISOString(),
      data: floorPlan,
    });
  }

  emitLapsingGuests(venueId: string, guests: LapsingGuest[]): void {
    this.emitChange({
      type: "guest:lapsing",
      venueId,
      timestamp: new Date().toISOString(),
      data: guests,
    });
  }
}

// Singleton event emitter for the service
export const reservationEvents = new ReservationEventEmitter();

// Singleton-backed helper functions for non-route service consumers
// (confirm-hold, floor-plan, guest, lapsed-guest-cron).
// Route handlers use fastify.reservationEvents.* instead.
export function emitReservationCreated(reservation: Reservation): void {
  reservationEvents.emitReservationCreated(reservation);
}

export function emitReservationUpdated(reservation: Reservation): void {
  reservationEvents.emitReservationUpdated(reservation);
}

export function emitReservationCancelled(reservation: Reservation): void {
  reservationEvents.emitReservationCancelled(reservation);
}

export function emitHoldCreated(hold: ReservationHold): void {
  reservationEvents.emitHoldCreated(hold);
}

export function emitHoldReleased(hold: ReservationHold): void {
  reservationEvents.emitHoldReleased(hold);
}

export function emitHoldConfirmed(reservation: Reservation): void {
  reservationEvents.emitHoldConfirmed(reservation);
}

export function emitTableUpdated(table: Table): void {
  reservationEvents.emitTableUpdated(table);
}

export function emitFloorPlanCreated(floorPlan: FloorPlan): void {
  reservationEvents.emitFloorPlanCreated(floorPlan);
}

export function emitLapsingGuests(venueId: string, guests: LapsingGuest[]): void {
  reservationEvents.emitLapsingGuests(venueId, guests);
}
