/**
 * useSSESync
 *
 * Single module that owns the EventSource lifecycle, React Query invalidation,
 * connection-status, and event feed. Replaces the former useReservationEvents +
 * useReservationQuerySync + useSSEStatus + useSSEEventFeed split.
 *
 * Transport (backoff, resumption, parse-error surfacing) is delegated to SseClient.
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
  useCallback,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@mattbutlerengineering/rialto";
import { useVenue } from "../contexts/VenueContext.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { TABLES_QUERY_KEY } from "./useTables.js";
import { SseClient } from "../lib/sse-client.js";
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

/* ── Toast rate limiter ──────────────────────────────────────────── */

const TOAST_WINDOW_MS = 10_000;
const TOAST_MAX = 3;

const SSE_EVENT_TYPES: readonly ReservationEventType[] = [
  "reservation:created",
  "reservation:updated",
  "reservation:cancelled",
  "hold:created",
  "hold:released",
  "hold:confirmed",
  "table:updated",
  "guest:lapsing",
];

/* ── Context ────────────────────────────────────────────────────── */

interface SSESyncContextValue {
  connectionState: SSEConnectionState;
  dispatchConnection: (action: SSEConnectionAction) => void;
  feedListeners: Set<(event: ReservationEvent) => void>;
  toastTimestampsRef: MutableRefObject<number[]>;
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

  const toastTimestampsRef = useRef<number[]>([]);

  return (
    <SSESyncContext.Provider
      value={{ connectionState, dispatchConnection, feedListeners, toastTimestampsRef }}
    >
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
 * Owns the EventSource lifecycle via SseClient. Call once inside DashboardLayoutInner.
 * Returns reconnect() for manual reconnect (e.g. retry button).
 */
export function useSSESync(): { reconnect: () => void } {
  const { dispatchConnection, feedListeners, toastTimestampsRef } = useSSESyncContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedVenueId } = useVenue();

  // Keep refs to avoid recreating SseClient on closure changes
  const queryClientRef = useRef(queryClient);
  const toastRef = useRef(toast);
  const dispatchRef = useRef(dispatchConnection);
  const selectedVenueIdRef = useRef(selectedVenueId);

  useEffect(() => {
    queryClientRef.current = queryClient;
    toastRef.current = toast;
    dispatchRef.current = dispatchConnection;
    selectedVenueIdRef.current = selectedVenueId;
  });

  const canShowToast = useCallback((): boolean => {
    const now = Date.now();
    toastTimestampsRef.current = toastTimestampsRef.current.filter(
      (t) => now - t < TOAST_WINDOW_MS
    );
    if (toastTimestampsRef.current.length >= TOAST_MAX) return false;
    toastTimestampsRef.current = [...toastTimestampsRef.current, now];
    return true;
  }, [toastTimestampsRef]);

  const canShowToastRef = useRef(canShowToast);
  useEffect(() => {
    canShowToastRef.current = canShowToast;
  });

  const makeEvent = useCallback(
    (type: ReservationEvent["type"], data: ReservationEvent["data"]): ReservationEvent => ({
      type,
      venueId: selectedVenueIdRef.current ?? "",
      timestamp: new Date().toISOString(),
      data,
    }),
    []
  );

  const handleEvent = useCallback(
    (type: string, payload: unknown) => {
      const event = payload as ReservationEvent;
      const eventType = type as ReservationEventType;

      switch (eventType) {
        case "reservation:created": {
          const reservation = event.data as Reservation;
          queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
          for (const listener of feedListeners) {
            listener(makeEvent("reservation:created", reservation));
          }
          if (canShowToastRef.current()) {
            toastRef.current({
              title: "New reservation",
              description: `${reservation.guestName ?? "Guest"} — ${new Date(reservation.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
              variant: "accent",
              duration: 5000,
            });
          }
          break;
        }
        case "reservation:updated": {
          queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
          for (const listener of feedListeners) {
            listener(makeEvent("reservation:updated", event.data as Reservation));
          }
          break;
        }
        case "reservation:cancelled": {
          const reservation = event.data as Reservation;
          queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
          for (const listener of feedListeners) {
            listener(makeEvent("reservation:cancelled", reservation));
          }
          if (canShowToastRef.current()) {
            toastRef.current({
              title: "Reservation cancelled",
              description: `${reservation.guestName ?? "Guest"}&apos;s reservation was cancelled`,
              variant: "error",
              duration: 5000,
            });
          }
          break;
        }
        case "hold:created": {
          for (const listener of feedListeners) {
            listener(makeEvent("hold:created", event.data as ReservationHold));
          }
          break;
        }
        case "hold:released": {
          for (const listener of feedListeners) {
            listener(makeEvent("hold:released", event.data as ReservationHold));
          }
          break;
        }
        case "hold:confirmed": {
          queryClientRef.current.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
          for (const listener of feedListeners) {
            listener(makeEvent("hold:confirmed", event.data as Reservation));
          }
          break;
        }
        case "table:updated": {
          queryClientRef.current.invalidateQueries({ queryKey: [TABLES_QUERY_KEY] });
          for (const listener of feedListeners) {
            listener(makeEvent("table:updated", event.data as Table));
          }
          break;
        }
        case "guest:lapsing": {
          for (const listener of feedListeners) {
            listener(makeEvent("guest:lapsing", event.data as LapsingGuest[]));
          }
          break;
        }
      }
    },
    [feedListeners, makeEvent]
  );

  const handleEventRef = useRef(handleEvent);
  useEffect(() => {
    handleEventRef.current = handleEvent;
  });

  const clientRef = useRef<SseClient | null>(null);

  const buildClient = useCallback((venueId: string | undefined): SseClient => {
    const baseUrl = import.meta.env.VITE_API_URL ?? "";
    const url = new URL(`${baseUrl}/api/v1/events/stream`);
    if (venueId) {
      url.searchParams.set("venueId", venueId);
    }
    return new SseClient({
      url: url.toString(),
      eventTypes: SSE_EVENT_TYPES,
      onEvent: (type, payload) => handleEventRef.current(type, payload),
      onError: (error) => {
        dispatchRef.current({ type: "error", error });
      },
      onConnected: () => {
        dispatchRef.current({ type: "connected" });
      },
      onDisconnected: () => {
        dispatchRef.current({ type: "disconnected" });
      },
    });
  }, []);

  useEffect(() => {
    const client = buildClient(selectedVenueId ?? undefined);
    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [selectedVenueId, buildClient]);

  const reconnect = useCallback(() => {
    clientRef.current?.disconnect();
    dispatchRef.current({ type: "disconnected" });

    const client = buildClient(selectedVenueIdRef.current ?? undefined);
    clientRef.current = client;
    client.connect();
  }, [buildClient]);

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
