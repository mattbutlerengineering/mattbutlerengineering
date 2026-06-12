import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@mattbutlerengineering/rialto";
import { useReservationEvents, type ReservationEvent } from "./useReservationEvents.js";
import { useVenue } from "../contexts/VenueContext.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { TABLES_QUERY_KEY } from "./useTables.js";
import { notifySSEStatus } from "./useSSEStatus.js";
import { broadcastSSEEvent } from "./useSSEEventFeed.js";
import type { Reservation } from "@mbe/types";

/* ── Toast rate limiter ────────────────────────────── */

const TOAST_WINDOW_MS = 10_000;
const TOAST_MAX = 3;

let _toastTimestamps: number[] = [];

function canShowToast(): boolean {
  const now = Date.now();
  _toastTimestamps = _toastTimestamps.filter((t) => now - t < TOAST_WINDOW_MS);
  if (_toastTimestamps.length >= TOAST_MAX) return false;
  _toastTimestamps.push(now);
  return true;
}

export function useReservationQuerySync() {
  const queryClient = useQueryClient();
  const { selectedVenueId } = useVenue();
  const { toast } = useToast();

  const makeEvent = (
    type: ReservationEvent["type"],
    data: ReservationEvent["data"]
  ): ReservationEvent => ({
    type,
    venueId: selectedVenueId ?? "",
    timestamp: new Date().toISOString(),
    data,
  });

  const invalidateReservations = () => {
    queryClient.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
  };

  const invalidateTables = () => {
    queryClient.invalidateQueries({ queryKey: [TABLES_QUERY_KEY] });
  };

  const result = useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    onReservationCreated: (reservation: Reservation) => {
      invalidateReservations();
      broadcastSSEEvent(makeEvent("reservation:created", reservation));
      if (canShowToast()) {
        toast({
          title: "New reservation",
          description: `${reservation.guestName ?? "Guest"} — ${new Date(reservation.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          variant: "accent",
          duration: 5000,
        });
      }
    },
    onReservationUpdated: (reservation: Reservation) => {
      invalidateReservations();
      broadcastSSEEvent(makeEvent("reservation:updated", reservation));
    },
    onReservationCancelled: (reservation: Reservation) => {
      invalidateReservations();
      broadcastSSEEvent(makeEvent("reservation:cancelled", reservation));
      if (canShowToast()) {
        toast({
          title: "Reservation cancelled",
          description: `${reservation.guestName ?? "Guest"}'s reservation was cancelled`,
          variant: "error",
          duration: 5000,
        });
      }
    },
    onHoldCreated: (hold) => {
      broadcastSSEEvent(makeEvent("hold:created", hold));
    },
    onHoldReleased: (hold) => {
      broadcastSSEEvent(makeEvent("hold:released", hold));
    },
    onHoldConfirmed: (reservation: Reservation) => {
      invalidateReservations();
      broadcastSSEEvent(makeEvent("hold:confirmed", reservation));
    },
    onTableUpdated: (table) => {
      invalidateTables();
      broadcastSSEEvent(makeEvent("table:updated", table));
    },
  });

  // Broadcast connection status changes to any subscribers (e.g. ActivityFeed, HomePage)
  useEffect(() => {
    notifySSEStatus(result.isConnected, result.error);
  }, [result.isConnected, result.error]);

  return result;
}
