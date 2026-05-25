import { useQuery } from "@tanstack/react-query";
import { toDateString, type Reservation } from "@mbe/types";
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
}

export interface UseDashboardStatsQueryResult {
  reservations: readonly Reservation[];
  stats: DashboardStats;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/* ── Helpers ─────────────────────────────────────────── */

const FALLBACK_STATS: DashboardStats = {
  totalReservations: 0,
  expectedCovers: 0,
  upcomingCount: 0,
  cancellationRate: 0,
  cancellationTrend: "neutral",
};

function getTodayString(): string {
  return toDateString(new Date());
}

function computeUpcoming(reservations: readonly Reservation[]): number {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const todayStr = getTodayString();

  return reservations.filter((r) => {
    if (r.status === "CANCELLED" || r.status === "NO_SHOW") return false;
    const start = new Date(`${todayStr}T${r.startTime}`);
    return start >= now && start <= twoHoursLater;
  }).length;
}

export function computeStatsFromReservations(
  reservations: readonly Reservation[]
): DashboardStats {
  if (reservations.length === 0) return FALLBACK_STATS;

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

/* ── Hook ────────────────────────────────────────────── */

export function useDashboardStatsQuery(): UseDashboardStatsQueryResult {
  const { selectedVenueId } = useVenue();
  const api = useApiClient();
  const today = getTodayString();

  const query = useQuery({
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

  const reservations = query.data ?? [];
  const stats = computeStatsFromReservations(reservations);

  return {
    reservations,
    stats,
    isLoading: query.isLoading,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
