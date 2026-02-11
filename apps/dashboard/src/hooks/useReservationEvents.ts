import { useEffect, useCallback, useRef, useState } from "react";
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

export interface UseReservationEventsOptions {
  venueId?: string;
  onReservationCreated?: (reservation: Reservation) => void;
  onReservationUpdated?: (reservation: Reservation) => void;
  onReservationCancelled?: (reservation: Reservation) => void;
  onHoldCreated?: (hold: ReservationHold) => void;
  onHoldReleased?: (hold: ReservationHold) => void;
  onHoldConfirmed?: (reservation: Reservation) => void;
  onTableUpdated?: (table: Table) => void;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export interface UseReservationEventsResult {
  isConnected: boolean;
  error: Error | null;
  reconnect: () => void;
}

export function useReservationEvents(
  options: UseReservationEventsOptions = {}
): UseReservationEventsResult {
  const {
    venueId,
    onReservationCreated,
    onReservationUpdated,
    onReservationCancelled,
    onHoldCreated,
    onHoldReleased,
    onHoldConfirmed,
    onTableUpdated,
    onError,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  // Store callbacks in refs to avoid reconnecting on callback changes
  const callbacksRef = useRef({
    onReservationCreated,
    onReservationUpdated,
    onReservationCancelled,
    onHoldCreated,
    onHoldReleased,
    onHoldConfirmed,
    onTableUpdated,
    onError,
  });

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onReservationCreated,
      onReservationUpdated,
      onReservationCancelled,
      onHoldCreated,
      onHoldReleased,
      onHoldConfirmed,
      onTableUpdated,
      onError,
    };
  });

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const baseUrl = import.meta.env.VITE_API_URL ?? "";
    const url = new URL(`${baseUrl}/api/v1/events/stream`);
    if (venueId) {
      url.searchParams.set("venueId", venueId);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      const err = new Error("SSE connection error");
      setError(err);
      callbacksRef.current.onError?.(err);

      // Exponential backoff reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    // Handle specific event types
    eventSource.addEventListener("connected", () => {
      setIsConnected(true);
    });

    eventSource.addEventListener("reservation:created", (event) => {
      const data = JSON.parse(event.data) as ReservationEvent;
      callbacksRef.current.onReservationCreated?.(data.data as Reservation);
    });

    eventSource.addEventListener("reservation:updated", (event) => {
      const data = JSON.parse(event.data) as ReservationEvent;
      callbacksRef.current.onReservationUpdated?.(data.data as Reservation);
    });

    eventSource.addEventListener("reservation:cancelled", (event) => {
      const data = JSON.parse(event.data) as ReservationEvent;
      callbacksRef.current.onReservationCancelled?.(data.data as Reservation);
    });

    eventSource.addEventListener("hold:created", (event) => {
      const data = JSON.parse(event.data) as ReservationEvent;
      callbacksRef.current.onHoldCreated?.(data.data as ReservationHold);
    });

    eventSource.addEventListener("hold:released", (event) => {
      const data = JSON.parse(event.data) as ReservationEvent;
      callbacksRef.current.onHoldReleased?.(data.data as ReservationHold);
    });

    eventSource.addEventListener("hold:confirmed", (event) => {
      const data = JSON.parse(event.data) as ReservationEvent;
      callbacksRef.current.onHoldConfirmed?.(data.data as Reservation);
    });

    eventSource.addEventListener("table:updated", (event) => {
      const data = JSON.parse(event.data) as ReservationEvent;
      callbacksRef.current.onTableUpdated?.(data.data as Table);
    });
  }, [venueId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    connect();
  }, [connect, disconnect]);

  // Connect/disconnect based on enabled flag
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected,
    error,
    reconnect,
  };
}
