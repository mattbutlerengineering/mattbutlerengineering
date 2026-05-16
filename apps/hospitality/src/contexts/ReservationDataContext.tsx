import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { useToast } from "@mattbutlerengineering/rialto";
import type { Reservation, Table, ReservationHold } from "@mbe/types";
import {
  useReservationEvents,
  type ReservationEvent,
} from "../hooks/useReservationEvents.js";
import { useVenue } from "./VenueContext.js";

/* ── Toast rate limiter ────────────────────────── */

const TOAST_WINDOW_MS = 10_000;
const TOAST_MAX = 3;

interface ToastRateLimiter {
  readonly timestamps: readonly number[];
}

function canShowToast(limiter: ToastRateLimiter): {
  allowed: boolean;
  next: ToastRateLimiter;
} {
  const now = Date.now();
  const recent = limiter.timestamps.filter((t) => now - t < TOAST_WINDOW_MS);
  if (recent.length >= TOAST_MAX) {
    return { allowed: false, next: { timestamps: recent } };
  }
  return { allowed: true, next: { timestamps: [...recent, now] } };
}

/* ── Event subscriber registry ────────────────── */

type EventHandler = (event: ReservationEvent) => void;

/* ── Context shape ─────────────────────────────── */

/** Accepts a plain array or a functional updater, matching React's setState signature. */
type TableSetter = Table[] | ((prev: Table[]) => Table[]);

interface ReservationDataContextValue {
  readonly reservations: readonly Reservation[];
  readonly tables: Table[];
  readonly isConnected: boolean;
  readonly sseError: Error | null;
  readonly addReservation: (reservation: Reservation) => void;
  readonly updateReservation: (reservation: Reservation) => void;
  readonly removeReservation: (id: string) => void;
  readonly setReservations: (reservations: Reservation[]) => void;
  readonly setTables: (next: TableSetter) => void;
  /** Subscribe to raw SSE events. Returns an unsubscribe function. */
  readonly subscribeToEvents: (handler: EventHandler) => () => void;
}

const ReservationDataContext =
  createContext<ReservationDataContextValue | null>(null);

/* ── Provider ──────────────────────────────────── */

interface ReservationDataProviderProps {
  readonly children: ReactNode;
}

export function ReservationDataProvider({
  children,
}: ReservationDataProviderProps) {
  const { selectedVenueId } = useVenue();
  const { toast } = useToast();
  const [reservations, setReservationsState] = useState<Reservation[]>([]);
  const [tables, setTablesState] = useState<Table[]>([]);
  const toastLimiterRef = useRef<ToastRateLimiter>({ timestamps: [] });
  const eventSubscribersRef = useRef<Set<EventHandler>>(new Set());

  const showRateLimitedToast = useCallback(
    (opts: Parameters<typeof toast>[0]) => {
      const { allowed, next } = canShowToast(toastLimiterRef.current);
      toastLimiterRef.current = next;
      if (allowed) {
        toast(opts);
      }
    },
    [toast]
  );

  const addReservation = useCallback((reservation: Reservation) => {
    setReservationsState((prev) => {
      const exists = prev.some((r) => r.id === reservation.id);
      if (exists) {
        return prev.map((r) => (r.id === reservation.id ? reservation : r));
      }
      return [...prev, reservation];
    });
  }, []);

  const updateReservation = useCallback((reservation: Reservation) => {
    setReservationsState((prev) =>
      prev.map((r) => (r.id === reservation.id ? reservation : r))
    );
  }, []);

  const removeReservation = useCallback((id: string) => {
    setReservationsState((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const setReservations = useCallback((next: Reservation[]) => {
    setReservationsState(next);
  }, []);

  const setTables = useCallback((next: TableSetter) => {
    setTablesState(next);
  }, []);

  const subscribeToEvents = useCallback((handler: EventHandler) => {
    eventSubscribersRef.current = new Set(eventSubscribersRef.current);
    eventSubscribersRef.current.add(handler);
    return () => {
      eventSubscribersRef.current = new Set(eventSubscribersRef.current);
      eventSubscribersRef.current.delete(handler);
    };
  }, []);

  /** Broadcast a raw event to all page-level subscribers. */
  const notifySubscribers = useCallback(
    (type: ReservationEvent["type"], data: ReservationEvent["data"]) => {
      const event: ReservationEvent = {
        type,
        venueId: selectedVenueId ?? "",
        timestamp: new Date().toISOString(),
        data,
      };
      for (const handler of eventSubscribersRef.current) {
        handler(event);
      }
    },
    [selectedVenueId]
  );

  /* ── SSE subscription (single connection for the entire app) ── */

  const handleCreated = useCallback(
    (reservation: Reservation) => {
      addReservation(reservation);
      notifySubscribers("reservation:created", reservation);
      showRateLimitedToast({
        title: "New reservation",
        description: `${reservation.guestName ?? "Guest"} — ${new Date(reservation.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        variant: "accent",
        duration: 5000,
      });
    },
    [addReservation, notifySubscribers, showRateLimitedToast]
  );

  const handleUpdated = useCallback(
    (reservation: Reservation) => {
      updateReservation(reservation);
      notifySubscribers("reservation:updated", reservation);
    },
    [updateReservation, notifySubscribers]
  );

  const handleCancelled = useCallback(
    (reservation: Reservation) => {
      updateReservation(reservation);
      notifySubscribers("reservation:cancelled", reservation);
      showRateLimitedToast({
        title: "Reservation cancelled",
        description: `${reservation.guestName ?? "Guest"}’s reservation was cancelled`,
        variant: "error",
        duration: 5000,
      });
    },
    [updateReservation, notifySubscribers, showRateLimitedToast]
  );

  const handleHoldCreated = useCallback(
    (hold: ReservationHold) => {
      notifySubscribers("hold:created", hold);
    },
    [notifySubscribers]
  );

  const handleHoldReleased = useCallback(
    (hold: ReservationHold) => {
      notifySubscribers("hold:released", hold);
    },
    [notifySubscribers]
  );

  const handleHoldConfirmed = useCallback(
    (reservation: Reservation) => {
      addReservation(reservation);
      notifySubscribers("hold:confirmed", reservation);
    },
    [addReservation, notifySubscribers]
  );

  const handleTableUpdated = useCallback(
    (table: Table) => {
      setTablesState((prev) =>
        prev.map((t) => (t.id === table.id ? table : t))
      );
      notifySubscribers("table:updated", table);
    },
    [notifySubscribers]
  );

  const { isConnected, error: sseError } = useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    enabled: !!selectedVenueId,
    onReservationCreated: handleCreated,
    onReservationUpdated: handleUpdated,
    onReservationCancelled: handleCancelled,
    onHoldCreated: handleHoldCreated,
    onHoldReleased: handleHoldReleased,
    onHoldConfirmed: handleHoldConfirmed,
    onTableUpdated: handleTableUpdated,
  });

  const value = useMemo<ReservationDataContextValue>(
    () => ({
      reservations,
      tables,
      isConnected,
      sseError,
      addReservation,
      updateReservation,
      removeReservation,
      setReservations,
      setTables,
      subscribeToEvents,
    }),
    [
      reservations,
      tables,
      isConnected,
      sseError,
      addReservation,
      updateReservation,
      removeReservation,
      setReservations,
      setTables,
      subscribeToEvents,
    ]
  );

  return (
    <ReservationDataContext.Provider value={value}>
      {children}
    </ReservationDataContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────── */

export function useReservationData(): ReservationDataContextValue {
  const context = useContext(ReservationDataContext);
  if (!context) {
    throw new Error(
      "useReservationData must be used within a ReservationDataProvider"
    );
  }
  return context;
}
