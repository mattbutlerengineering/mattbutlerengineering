/**
 * useSSESync
 *
 * Single module that owns the EventSource lifecycle, React Query invalidation,
 * connection-status, and event feed. Replaces the former useReservationEvents +
 * useReservationQuerySync + useSSEStatus + useSSEEventFeed split.
 *
 * Usage:
 *   // In DashboardLayout — mount once per app session:
 *   <SSESyncProvider>...</SSESyncProvider>
 *
 *   // Inside the provider — to drive the connection (call once in layout):
 *   useSSESync()
 *
 *   // Anywhere inside the provider — to read status:
 *   const { isConnected, error } = useSSEStatus();
 *
 *   // Anywhere inside the provider — to read the activity feed:
 *   const events = useSSEEventFeed({ maxItems: 5 });
 */

import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { TABLES_QUERY_KEY } from "./useTables.js";
import type { Reservation, Table, ReservationHold, LapsingGuest } from "@mbe/types";

/* ── Types ─────────────────────────────────────────────────────── */

export type ReservationEventType =
  | "reservation:created"
  | "reservation:updated"
  | "reservation:cancelled"
  | "hold:created"
  | "hold:released"
  | "hold:confirmed"
  | "table:updated"
  | "guest:lapsing";

export interface ReservationEvent {
  type: ReservationEventType;
  venueId: string;
  timestamp: string;
  data: Reservation | Table | ReservationHold | LapsingGuest[];
}

interface SSEConnectionState {
  isConnected: boolean;
  error: Error | null;
}

type SSEConnectionAction =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "error"; error: Error };

/* ── Backoff constants ──────────────────────────────────────────── */

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_BACKOFF_ATTEMPTS = 8;

/* ── Toast rate limiter ──────────────────────────────────────────── */

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

/* ── Context ────────────────────────────────────────────────────── */

interface SSESyncContextValue {
  connectionState: SSEConnectionState;
  dispatchConnection: (action: SSEConnectionAction) => void;
  feedListeners: Set<(event: ReservationEvent) => void>;
}

const SSESyncContext = createContext<SSESyncContextValue | null>(null);

function connectionReducer(
  state: SSEConnectionState,
  action: SSEConnectionAction
): SSEConnectionState {
  switch (action.type) {
    case "connected":
      return { isConnected: true, error: null };
    case "disconnected":
      return { isConnected: false, error: state.error };
    case "error":
      return { isConnected: false, error: action.error };
  }
}

/** Mount once above DashboardLayoutInner (alongside VenueProvider). */
export function SSESyncProvider({ children }: { children: ReactNode }) {
  const [connectionState, dispatchConnection] = useReducer(connectionReducer, {
    isConnected: false,
    error: null,
  });

  // Stable Set — useMemo gives a stable reference without touching .current in render
   
  const feedListeners = useMemo(() => new Set<(event: ReservationEvent) => void>(), []);

  return (
    <SSESyncContext.Provider value={{ connectionState, dispatchConnection, feedListeners }}>
      {children}
    </SSESyncContext.Provider>
  );
}

function useSSESyncContext(): SSESyncContextValue {
  const ctx = useContext(SSESyncContext);
  if (!ctx) throw new Error("useSSESyncContext must be used inside SSESyncProvider");
  return ctx;
}

/* ── useSSESync ─────────────────────────────────────────────────── */

/**
 * Owns the EventSource lifecycle. Call once inside DashboardLayoutInner.
 * Returns reconnect() for manual reconnect (e.g. retry button).
 */
export function useSSESync(): { reconnect: () => void } {
  const { dispatchConnection, feedListeners } = useSSESyncContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedVenueId } = useVenue();

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  // Keep refs to avoid reconnecting on closure changes
  const queryClientRef = useRef(queryClient);
  const toastRef = useRef(toast);
  const dispatchRef = useRef(dispatchConnection);

  useEffect(() => {
    queryClientRef.current = queryClient;
    toastRef.current = toast;
    dispatchRef.current = dispatchConnection;
  });

  // feedListeners is a stable Set (useMemo in provider) — safe to close over directly
  const broadcastEvent = useCallback(
    (event: ReservationEvent) => {
      for (const listener of feedListeners) {
        listener(event);
      }
    },
    [feedListeners]
  );

  const makeEvent = useCallback(
    (type: ReservationEvent["type"], data: ReservationEvent["data"]): ReservationEvent => ({
      type,
      venueId: selectedVenueId ?? "",
      timestamp: new Date().toISOString(),
      data,
    }),
    [selectedVenueId]
  );

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

  const connect = useCallback(() => {
    // Close any existing connection first to prevent duplicates
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const baseUrl = import.meta.env.VITE_API_URL ?? "";
    const url = new URL(`${baseUrl}/api/v1/events/stream`);
    if (selectedVenueId) {
      url.searchParams.set("venueId", selectedVenueId);
    }

    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      dispatchRef.current({ type: "connected" });
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = () => {
      // Close immediately to prevent browser auto-reconnect racing with our backoff
      eventSource.close();
      eventSourceRef.current = null;

      const err = new Error("SSE connection error");
      dispatchRef.current({ type: "error", error: err });

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

    eventSource.addEventListener("connected", () => {
      dispatchRef.current({ type: "connected" });
    });

    eventSource.addEventListener("reservation:created", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      const reservation = payload.data as Reservation;
      queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
      broadcastEvent(makeEvent("reservation:created", reservation));
      if (canShowToast()) {
        toastRef.current({
          title: "New reservation",
          description: `${reservation.guestName ?? "Guest"} — ${new Date(reservation.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          variant: "accent",
          duration: 5000,
        });
      }
    });

    eventSource.addEventListener("reservation:updated", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
      broadcastEvent(makeEvent("reservation:updated", payload.data as Reservation));
    });

    eventSource.addEventListener("reservation:cancelled", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      const reservation = payload.data as Reservation;
      queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
      broadcastEvent(makeEvent("reservation:cancelled", reservation));
      if (canShowToast()) {
        toastRef.current({
          title: "Reservation cancelled",
          description: `${reservation.guestName ?? "Guest"}'s reservation was cancelled`,
          variant: "error",
          duration: 5000,
        });
      }
    });

    eventSource.addEventListener("hold:created", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      broadcastEvent(makeEvent("hold:created", payload.data as ReservationHold));
    });

    eventSource.addEventListener("hold:released", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      broadcastEvent(makeEvent("hold:released", payload.data as ReservationHold));
    });

    eventSource.addEventListener("hold:confirmed", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
      broadcastEvent(makeEvent("hold:confirmed", payload.data as Reservation));
    });

    eventSource.addEventListener("table:updated", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      queryClientRef.current.invalidateQueries({ queryKey: [TABLES_QUERY_KEY] });
      broadcastEvent(makeEvent("table:updated", payload.data as Table));
    });

    eventSource.addEventListener("guest:lapsing", (event) => {
      const payload = JSON.parse(event.data) as ReservationEvent;
      broadcastEvent(makeEvent("guest:lapsing", payload.data as LapsingGuest[]));
    });
  }, [selectedVenueId, broadcastEvent, makeEvent]);

  // Keep connectRef in sync so the backoff timeout calls the latest connect
  useLayoutEffect(() => {
    connectRef.current = connect;
  });

  useEffect(() => {
    connect();
    return closeConnection;
  }, [connect, closeConnection]);

  const reconnect = useCallback(() => {
    closeConnection();
    reconnectAttempts.current = 0;
    connect();
  }, [connect, closeConnection]);

  return { reconnect };
}

/* ── useSSEStatus ───────────────────────────────────────────────── */

/** Read the current SSE connection status from context. */
export function useSSEStatus(): SSEConnectionState {
  const { connectionState } = useSSESyncContext();
  return connectionState;
}

/* ── useSSEEventFeed ────────────────────────────────────────────── */

export interface UseSSEEventFeedOptions {
  maxItems?: number;
}

/** Subscribe to the live SSE event feed from context. */
export function useSSEEventFeed(options: UseSSEEventFeedOptions = {}): readonly ReservationEvent[] {
  const { maxItems = 5 } = options;
  const { feedListeners } = useSSESyncContext();
  const [events, setEvents] = useState<readonly ReservationEvent[]>([]);

  useEffect(() => {
    const listener = (event: ReservationEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, maxItems));
    };
    feedListeners.add(listener);
    return () => {
      feedListeners.delete(listener);
    };
  }, [feedListeners, maxItems]);

  return events;
}
