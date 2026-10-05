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
import { useAuth } from "@mbe/auth/react";
import { useVenue } from "../contexts/VenueContext.js";
import { useApiClient } from "./useApiClient.js";
import { SseClient } from "../lib/sse-client.js";
import { getCachedFloorPlanSnapshot, setCachedFloorPlanSnapshot } from "../lib/offline-cache.js";
import {
  SSE_EVENT_CATALOG,
  SSE_EVENT_NAMES,
  type Reservation,
  type SseEvent,
  type SseEventName,
  type TableStatusDelta,
  type TableDisplayStatus,
} from "@mbe/types";

/* ── Types ─────────────────────────────────────────────────────── */

/** Event names come from the shared catalog in @mbe/types (SSE_EVENT_CATALOG). */
export type ReservationEventType = SseEventName;

/** Wire envelope from the shared catalog in @mbe/types. */
export type ReservationEvent = SseEvent;

interface SSEConnectionState {
  isConnected: boolean;
  error: Error | null;
  /**
   * Bumped on every successful `connected` transition (including the first).
   * `useTableStatuses` compares this against the epoch it last completed a
   * resync for — the only way `isStale` clears is a snapshot fetch that
   * actually landed for the *current* epoch, not merely `isConnected` going
   * true (#3931's false-all-clear bug).
   */
  connectionEpoch: number;
}

/** Public shape of `useSSEStatus()` — deliberately excludes `connectionEpoch`,
 * an internal resync-tracking detail `useTableStatuses` reads directly from
 * context instead. */
export interface SSEStatus {
  isConnected: boolean;
  error: Error | null;
}

type SSEConnectionAction =
  { type: "connected" } | { type: "disconnected" } | { type: "error"; error: Error };

/* ── Toast rate limiter ──────────────────────────────────────────── */

const TOAST_WINDOW_MS = 10_000;
const TOAST_MAX = 3;

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
      return { isConnected: true, error: null, connectionEpoch: state.connectionEpoch + 1 };
    case "disconnected":
      return { ...state, isConnected: false };
    case "error":
      return { ...state, isConnected: false, error: action.error };
  }
}

/** Mount once above DashboardLayoutInner (alongside VenueProvider). */
export function SSESyncProvider({ children }: { children: ReactNode }) {
  const [connectionState, dispatchConnection] = useReducer(connectionReducer, {
    isConnected: false,
    error: null,
    connectionEpoch: 0,
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
  const { accessToken } = useAuth();

  // Keep refs to avoid recreating SseClient on closure changes
  const queryClientRef = useRef(queryClient);
  const toastRef = useRef(toast);
  const dispatchRef = useRef(dispatchConnection);
  const selectedVenueIdRef = useRef(selectedVenueId);
  const accessTokenRef = useRef(accessToken);

  useEffect(() => {
    queryClientRef.current = queryClient;
    toastRef.current = toast;
    dispatchRef.current = dispatchConnection;
    selectedVenueIdRef.current = selectedVenueId;
    accessTokenRef.current = accessToken;
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
      // SseClient only delivers names in SSE_EVENT_NAMES (its eventTypes filter).
      const eventType = type as ReservationEventType;
      const event = payload as ReservationEvent;

      for (const key of SSE_EVENT_CATALOG[eventType].invalidates) {
        queryClientRef.current.invalidateQueries({ queryKey: [key] });
      }
      for (const listener of feedListeners) {
        listener(makeEvent(eventType, event.data));
      }

      switch (eventType) {
        case "reservation:created": {
          const reservation = event.data as Reservation;
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
        case "reservation:cancelled": {
          const reservation = event.data as Reservation;
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
        // No toast: invalidation and feed-forwarding above are the whole
        // handling. table-status:changed is consumed by useTableStatuses via
        // the feed (changed-tables-only delta, see
        // @mbe/types#deriveTableDisplayStatus).
        case "reservation:updated":
        case "hold:created":
        case "hold:released":
        case "hold:confirmed":
        case "table:updated":
        case "floor-plan:created":
        case "guest:lapsing":
        case "table-status:changed":
          break;
        default: {
          // A catalog name with no case above is a type error here.
          const unhandled: never = eventType;
          return unhandled;
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
      eventTypes: SSE_EVENT_NAMES,
      getAccessToken: () => accessTokenRef.current,
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

/**
 * Read the current SSE connection status from context.
 *
 * `isConnected` is the single source of truth for "live vs. stale" UI —
 * callers that render a staleness indicator (e.g. the floor plan canvas,
 * see `FloorPlanCanvas`'s `isStale` prop) derive it as `!isConnected`.
 * It's set only from `SseClient`'s `onConnected`/`onDisconnected`/`onError`
 * callbacks (event handlers, not a `useEffect` body), so flipping it never
 * re-triggers the effect that created the connection.
 */
export function useSSEStatus(): SSEStatus {
  const { connectionState } = useSSESyncContext();
  return { isConnected: connectionState.isConnected, error: connectionState.error };
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

/* ── useTableStatuses ───────────────────────────────────────────── */

export interface UseTableStatusesResult {
  statuses: ReadonlyMap<string, TableDisplayStatus>;
  /**
   * True whenever displayed statuses might not reflect reality: while
   * disconnected, AND for the window between reconnect and the resync
   * snapshot actually landing. Derived at render time from
   * `connectionEpoch`/`syncedEpoch` — never set from a `useEffect` body —
   * so reconnecting alone can never produce a false all-clear (#3931).
   */
  isStale: boolean;
}

/**
 * Subscribe to the live, cumulative per-table status map from context.
 *
 * Unlike `useSSEEventFeed` (a rolling window of the last N events, for
 * activity displays), this merges every `table-status:changed` delta into
 * a table-id-keyed map that never evicts entries — the floor plan canvas
 * needs the latest known status for every table, not just recent events.
 *
 * `EventSource`/`fetchEventSource` has no `Last-Event-ID` replay, so any
 * deltas that fired while disconnected are lost forever — reconnecting
 * alone leaves stale colors on screen. On every `connected` transition this
 * refetches a full snapshot (`GET /venues/:id/table-statuses`, the same
 * `deriveTableDisplayStatus` derivation the live deltas use) and replaces
 * the map, so a reconnect always ends with statuses that are actually
 * current rather than merely "not visibly stale".
 */
export function useTableStatuses(): UseTableStatusesResult {
  const { feedListeners, connectionState } = useSSESyncContext();
  const { isConnected, connectionEpoch } = connectionState;
  const { selectedVenueId } = useVenue();
  const api = useApiClient();

  const [statuses, setStatuses] = useState<ReadonlyMap<string, TableDisplayStatus>>(
    () => new Map()
  );
  const [syncedEpoch, setSyncedEpoch] = useState(0);

  /**
   * Best-effort offline fallback for a snapshot fetch that failed before any
   * live data landed. Stored alongside the `venueId` it was read for — a
   * render-time key comparison (see `effectiveStatuses` below) is what makes
   * a stale-venue render structurally unrepresentable regardless of how the
   * async cache read races a venue switch, rather than an effect that resets
   * this state on venueId change (the shape of the cross-venue leak #4186
   * fixed for `useReservations`).
   */
  const [cachedFallback, setCachedFallback] = useState<
    { venueId: string; snapshot: TableStatusDelta[] } | undefined
  >(undefined);

  // While a reconnect snapshot fetch is in flight, buffer any live deltas
  // that land for the same tables — otherwise the snapshot's `.then()`
  // (server state captured *before* those deltas existed) would overwrite
  // them with stale data once it resolves (#3948). `null` = no fetch in
  // flight; a Map = accumulating deltas to reapply once the snapshot lands.
  const pendingDuringFetchRef = useRef<Map<string, TableDisplayStatus> | null>(null);

  useEffect(() => {
    const listener = (event: ReservationEvent) => {
      if (event.type !== "table-status:changed") return;
      const deltas = event.data as TableStatusDelta[];
      setStatuses((prev) => {
        const next = new Map(prev);
        for (const delta of deltas) {
          next.set(delta.tableId, delta.status);
        }
        return next;
      });
      for (const delta of deltas) {
        pendingDuringFetchRef.current?.set(delta.tableId, delta.status);
      }
    };
    feedListeners.add(listener);
    return () => {
      feedListeners.delete(listener);
    };
  }, [feedListeners]);

  useEffect(() => {
    if (!isConnected || !selectedVenueId) return;
    let cancelled = false;
    const venueId = selectedVenueId;
    const pendingDuringFetch = new Map<string, TableDisplayStatus>();
    pendingDuringFetchRef.current = pendingDuringFetch;

    const clearIfCurrent = () => {
      if (pendingDuringFetchRef.current === pendingDuringFetch) {
        pendingDuringFetchRef.current = null;
      }
    };

    api.tables
      .getStatuses(venueId)
      .then((deltas) => {
        if (cancelled) return;
        const next = new Map(deltas.map((delta) => [delta.tableId, delta.status]));
        for (const [tableId, status] of pendingDuringFetch) {
          next.set(tableId, status);
        }
        setStatuses(next);
        setSyncedEpoch(connectionEpoch);
        setCachedFallback(undefined);
        // Best-effort write-through — a cache failure (e.g. IndexedDB
        // unavailable) must never block rendering the freshly-fetched data.
        void setCachedFloorPlanSnapshot(venueId, deltas).catch(() => undefined);
      })
      .catch(() => {
        // Already reported to Sentry via useApiClient's onError. Leave the
        // prior statuses and isStale untouched — retrying on the next
        // reconnect cycle beats showing a false all-clear. Best-effort fall
        // back to the last cached snapshot for this venue so the canvas
        // doesn't render blank on a failed initial fetch; `effectiveStatuses`
        // below is what keeps this from leaking across a venue switch.
        if (cancelled) return;
        getCachedFloorPlanSnapshot(venueId)
          .then((cached) => {
            if (cancelled) return;
            setCachedFallback(cached !== null ? { venueId, snapshot: cached } : undefined);
          })
          .catch(() => undefined);
      })
      .finally(clearIfCurrent);

    return () => {
      cancelled = true;
      clearIfCurrent();
    };
  }, [isConnected, connectionEpoch, selectedVenueId, api]);

  const isStale = !isConnected || syncedEpoch !== connectionEpoch;

  // Render-time guard: while no resync has landed for the current connection
  // cycle (`isStale`) and the cached entry was read for the *current*
  // venueId (never a lagging read for a venue the caller has since switched
  // away from — that key comparison is what makes a wrong-venue render
  // structurally unrepresentable, rather than relying on an effect to reset
  // it in time), treat the cache as the base layer and overlay `statuses` on
  // top of it. `statuses` is a delta a live SSE event *updates* the fallback
  // with, not something that wholesale *replaces* it (#4216) — the stream
  // can keep delivering deltas while the snapshot fetch itself is failing,
  // and those deltas are strictly newer than the cached read.
  const effectiveStatuses =
    isStale && cachedFallback !== undefined && cachedFallback.venueId === selectedVenueId
      ? new Map([
          ...cachedFallback.snapshot.map((delta) => [delta.tableId, delta.status] as const),
          ...statuses,
        ])
      : statuses;

  return { statuses: effectiveStatuses, isStale };
}
