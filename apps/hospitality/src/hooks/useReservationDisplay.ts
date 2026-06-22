import { useMemo } from "react";
import type { Reservation, ReservationStatus } from "@mbe/types";
import { useReservations } from "./useReservations.js";

/* ── Types ───────────────────────────────────────────── */

export type StatusFilter = "all" | ReservationStatus;

export interface UseReservationDisplayParams {
  date: string;
  venueId: string | undefined;
  statusFilter: StatusFilter;
  searchQuery: string;
  limit?: number;
}

export interface ReservationDisplayStats {
  total: number;
  confirmed: number;
  pending: number;
  cancelled: number;
}

export interface UseReservationDisplayResult {
  /** Raw data from the API (undefined while loading) */
  data: Reservation[] | undefined;
  /** Aggregate stats computed from the full dataset (not affected by filters) */
  stats: ReservationDisplayStats;
  /** Reservations after applying statusFilter and searchQuery */
  filteredData: Reservation[];
  isLoading: boolean;
  error: Error | null;
}

/* ── Hook ────────────────────────────────────────────── */

/**
 * Orchestration hook that combines data fetching, stats computation, and
 * filtering for the ReservationsPage. Extracts the inline logic that was
 * previously embedded in the page component.
 */
export function useReservationDisplay({
  date,
  venueId,
  statusFilter,
  searchQuery,
  limit = 50,
}: UseReservationDisplayParams): UseReservationDisplayResult {
  const { data, isLoading, error } = useReservations({
    date,
    venueId,
    limit,
  });

  const allReservations = useMemo(() => data ?? [], [data]);

  const stats = useMemo<ReservationDisplayStats>(() => {
    const confirmed = allReservations.filter((r) => r.status === "CONFIRMED").length;
    const pending = allReservations.filter((r) => r.status === "PENDING").length;
    const cancelled = allReservations.filter((r) => r.status === "CANCELLED").length;
    return { total: allReservations.length, confirmed, pending, cancelled };
  }, [allReservations]);

  const filteredData = useMemo<Reservation[]>(() => {
    let result = allReservations;

    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter);
    }

    const trimmed = searchQuery.trim();
    if (trimmed) {
      const q = trimmed.toLowerCase();
      result = result.filter(
        (r) =>
          (r.guestName ?? "").toLowerCase().includes(q) ||
          (r.guestEmail ?? "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [allReservations, statusFilter, searchQuery]);

  return { data, stats, filteredData, isLoading, error };
}
