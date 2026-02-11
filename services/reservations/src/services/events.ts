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

class ReservationEventEmitter extends EventEmitter {
  emitChange(payload: ReservationEvent): boolean {
    return super.emit("change", payload);
  }

  onChange(listener: (payload: ReservationEvent) => void): this {
    return super.on("change", listener);
  }

  offChange(listener: (payload: ReservationEvent) => void): this {
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
