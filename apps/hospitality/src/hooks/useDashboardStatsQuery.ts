import { useQuery } from "@tanstack/react-query";
import { toDateString, type Reservation, type WaitlistEntry } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { useApiClient } from "./useApiClient.js";

/* ── Types ───────────────────────────────────────────── */

export interface DashboardStats {
  totalReservations: number;
  expectedCovers: number;
  upcomingCount: number;
  cancellationRate: number;
  cancellationTrend: "up" | "down" | "neutral";
  waitlistCount: number;
  longestWaitMinutes: number;
}

export interface UseDashboardStatsQueryResult {
  reservations: readonly Reservation[];
  stats: DashboardStats;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Stats derived from reservations only — see {@link computeStatsFromReservations}. */
type ReservationStats = Omit<DashboardStats, "waitlistCount" | "longestWaitMinutes">;

/** Stats derived from waitlist entries only — see {@link computeWaitlistStats}. */
type WaitlistStats = Pick<DashboardStats, "waitlistCount" | "longestWaitMinutes">;

/* ── Helpers ─────────────────────────────────────────── */

const WAITLIST_QUERY_KEY = "waitlist" as const;

const FALLBACK_RESERVATION_STATS: ReservationStats = {
  totalReservations: 0,
  expectedCovers: 0,
  upcomingCount: 0,
  cancellationRate: 0,
  cancellationTrend: "neutral",
};

const FALLBACK_WAITLIST_STATS: WaitlistStats = {
  waitlistCount: 0,
  longestWaitMinutes: 0,
};

function getTodayString(): string {
  return toDateString(new Date());
}

function computeUpcoming(reservations: readonly Reservation[]): number {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  return reservations.filter((r) => {
    if (r.status === "CANCELLED" || r.status === "NO_SHOW") return false;
    const start = new Date(r.startTime);
    return start >= now && start <= twoHoursLater;
  }).length;
}

export function computeStatsFromReservations(
  reservations: readonly Reservation[]
): ReservationStats {
  if (reservations.length === 0) return FALLBACK_RESERVATION_STATS;

  const active = reservations.filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW");
  const cancelled = reservations.filter((r) => r.status === "CANCELLED");
  const rate =
    reservations.length > 0 ? Math.round((cancelled.length / reservations.length) * 100) : 0;

  return {
    totalReservations: active.length,
    expectedCovers: active.reduce((sum, r) => sum + r.partySize, 0),
    upcomingCount: computeUpcoming(reservations),
    cancellationRate: rate,
    cancellationTrend: rate > 10 ? "up" : rate < 5 ? "down" : "neutral",
  };
}

export function computeWaitlistStats(entries: readonly WaitlistEntry[]): WaitlistStats {
  if (entries.length === 0) return FALLBACK_WAITLIST_STATS;

  return {
    waitlistCount: entries.length,
    longestWaitMinutes: Math.max(...entries.map((e) => e.estimatedWaitMinutes)),
  };
}

/* ── Hook ────────────────────────────────────────────── */

export function useDashboardStatsQuery(): UseDashboardStatsQueryResult {
  const { selectedVenueId } = useVenue();
  const api = useApiClient();
  const today = getTodayString();

  const reservationsQuery = useQuery({
    queryKey: [RESERVATIONS_QUERY_KEY, { date: today, venueId: selectedVenueId, limit: 100 }],
    queryFn: async () => {
      const response = await api.reservations.list({
        date: today,
        limit: 100,
        ...(selectedVenueId ? { venueId: selectedVenueId } : {}),
      });
      return response.data;
    },
  });

  const waitlistQuery = useQuery({
    queryKey: [WAITLIST_QUERY_KEY, { venueId: selectedVenueId }],
    queryFn: () => api.waitlist.list(selectedVenueId ?? ""),
    enabled: Boolean(selectedVenueId),
  });

  const reservations = reservationsQuery.data ?? [];
  const waitlistEntries = waitlistQuery.data ?? [];

  const stats: DashboardStats = {
    ...computeStatsFromReservations(reservations),
    ...computeWaitlistStats(waitlistEntries),
  };

  return {
    reservations,
    stats,
    isLoading: reservationsQuery.isLoading,
    error: reservationsQuery.error ?? null,
    refetch: reservationsQuery.refetch,
  };
}
