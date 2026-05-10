import { useEffect, useLayoutEffect, useCallback, useRef, useReducer } from "react";
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

/**
 * Initial backoff delay in ms. Doubles on each consecutive failure up to MAX_BACKOFF_MS.
 * After MAX_BACKOFF_ATTEMPTS consecutive failures (likely 429 rate-limiting),
 * a longer cooldown is applied to avoid hammering the server.
 */
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_BACKOFF_ATTEMPTS = 8;

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

  type ConnectionState = { isConnected: boolean; error: Error | null };
  type ConnectionAction =
    | { type: "connected" }
    | { type: "disconnected" }
    | { type: "error"; error: Error };

  const [connectionState, dispatch] = useReducer(
    (state: ConnectionState, action: ConnectionAction): ConnectionState => {
      switch (action.type) {
        case "connected":
          return { isConnected: true, error: null };
        case "disconnected":
          return { isConnected: false, error: state.error };
        case "error":
          return { isConnected: false, error: action.error };
      }
    },
    { isConnected: false, error: null }
  );

  const { isConnected, error } = connectionState;
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

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
    // Always close existing connection first to prevent duplicates.
    // EventSource's built-in auto-reconnect fires immediately after onerror,
    // so we must close() before opening a new one.
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const baseUrl = import.meta.env.VITE_API_URL ?? "";
    const url = new URL(`${baseUrl}/api/v1/events/stream`);
    if (venueId) {
      url.searchParams.set("venueId", venueId);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      dispatch({ type: "connected" });
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = () => {
      // Close the EventSource immediately to prevent the browser's built-in
      // auto-reconnect from racing with our manual backoff reconnect.
      // Without this, both fire and you get 2x connections on every error.
      eventSource.close();
      eventSourceRef.current = null;

      const err = new Error("SSE connection error");
      dispatch({ type: "error", error: err });
      callbacksRef.current.onError?.(err);

      // After many consecutive failures, apply a longer cooldown.
      // This is the likely 429 scenario — the server has rate-limited us.
      const attempts = reconnectAttempts.current;
      const delay =
        attempts >= MAX_BACKOFF_ATTEMPTS
          ? RATE_LIMIT_COOLDOWN_MS
          : Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempts), MAX_BACKOFF_MS);
      reconnectAttempts.current = attempts + 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current?.();
      }, delay);
    };

    // Handle specific event types
    eventSource.addEventListener("connected", () => {
      dispatch({ type: "connected" });
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

  // Keep connectRef in sync so the reconnect timeout can call the latest connect
  useLayoutEffect(() => {
    connectRef.current = connect;
  });

  const closeConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    closeConnection();
    dispatch({ type: "disconnected" });
  }, [closeConnection]);

  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    connect();
  }, [connect, disconnect]);

  // Connect/disconnect based on enabled flag
  useEffect(() => {
    if (!enabled) {
      return closeConnection;
    }

    connect();
    return closeConnection;
  }, [enabled, connect, closeConnection]);

  return {
    isConnected,
    error,
    reconnect,
  };
}
