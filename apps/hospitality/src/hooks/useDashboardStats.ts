import { useState, useEffect, useMemo, useCallback } from "react";
import { createApiClient } from "@mbe/api-client";
import { useAuth } from "@mbe/auth/react";
import { useVenue } from "../contexts/VenueContext.js";
import { toDateString, type Reservation } from "@mbe/types";

export interface DashboardStats {
  totalReservations: number;
  expectedCovers: number;
  upcomingCount: number;
  cancellationRate: number;
  cancellationTrend: "up" | "down" | "neutral";
}

export interface UseDashboardStatsResult {
  reservations: readonly Reservation[];
  stats: DashboardStats;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

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

export function computeStats(reservations: readonly Reservation[]): DashboardStats {
  if (reservations.length === 0) return FALLBACK_STATS;

  const active = reservations.filter(
    (r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW"
  );
  const cancelled = reservations.filter((r) => r.status === "CANCELLED");
  const rate =
    reservations.length > 0
      ? Math.round((cancelled.length / reservations.length) * 100)
      : 0;

  return {
    totalReservations: active.length,
    expectedCovers: active.reduce((sum, r) => sum + r.partySize, 0),
    upcomingCount: computeUpcoming(reservations),
    cancellationRate: rate,
    cancellationTrend: rate > 10 ? "up" : rate < 5 ? "down" : "neutral",
  };
}

export function useDashboardStats(): UseDashboardStatsResult {
  const { accessToken } = useAuth();
  const { selectedVenueId } = useVenue();
  const [reservations, setReservations] = useState<readonly Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const fetchReservations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.reservations.list({
        date: getTodayString(),
        limit: 100,
        ...(selectedVenueId ? { venueId: selectedVenueId } : {}),
      });
      setReservations(response.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load reservations"
      );
      setReservations([]);
    } finally {
      setIsLoading(false);
    }
  }, [api, selectedVenueId]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const stats = useMemo(() => computeStats(reservations), [reservations]);

  return { reservations, stats, isLoading, error, refetch: fetchReservations };
}
