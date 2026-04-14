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
import type { Reservation } from "@mbe/types";
import { useReservationEvents } from "../hooks/useReservationEvents.js";
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

/* ── Context shape ─────────────────────────────── */

interface ReservationDataContextValue {
  readonly reservations: readonly Reservation[];
  readonly isConnected: boolean;
  readonly addReservation: (reservation: Reservation) => void;
  readonly updateReservation: (reservation: Reservation) => void;
  readonly removeReservation: (id: string) => void;
  readonly setReservations: (reservations: Reservation[]) => void;
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
  const toastLimiterRef = useRef<ToastRateLimiter>({ timestamps: [] });

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

  /* ── SSE subscription ────────────────────────── */

  const handleCreated = useCallback(
    (reservation: Reservation) => {
      addReservation(reservation);
      showRateLimitedToast({
        title: "New reservation",
        description: `${reservation.guestName ?? "Guest"} — ${new Date(reservation.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        variant: "accent",
        duration: 5000,
      });
    },
    [addReservation, showRateLimitedToast]
  );

  const handleUpdated = useCallback(
    (reservation: Reservation) => {
      updateReservation(reservation);
    },
    [updateReservation]
  );

  const handleCancelled = useCallback(
    (reservation: Reservation) => {
      updateReservation(reservation);
      showRateLimitedToast({
        title: "Reservation cancelled",
        description: `${reservation.guestName ?? "Guest"}'s reservation was cancelled`,
        variant: "error",
        duration: 5000,
      });
    },
    [updateReservation, showRateLimitedToast]
  );

  const { isConnected } = useReservationEvents({
    venueId: selectedVenueId ?? undefined,
    enabled: !!selectedVenueId,
    onReservationCreated: handleCreated,
    onReservationUpdated: handleUpdated,
    onReservationCancelled: handleCancelled,
  });

  const value = useMemo<ReservationDataContextValue>(
    () => ({
      reservations,
      isConnected,
      addReservation,
      updateReservation,
      removeReservation,
      setReservations,
    }),
    [
      reservations,
      isConnected,
      addReservation,
      updateReservation,
      removeReservation,
      setReservations,
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
