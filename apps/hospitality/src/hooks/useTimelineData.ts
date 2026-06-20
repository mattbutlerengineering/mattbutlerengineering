import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Reservation, Table, TableStatus, UpdateReservationRequest } from "@mbe/types";
import { useReservations, RESERVATIONS_QUERY_KEY } from "./useReservations.js";
import { useTables, TABLES_QUERY_KEY } from "./useTables.js";
import { useApiClient } from "./useApiClient.js";

/* ── Params ─────────────────────────────────────────── */

export interface UseTimelineDataParams {
  venueId: string | undefined;
  date: string;
}

/* ── Cancel args ────────────────────────────────────── */

export interface CancelArgs {
  reason: string;
  note: string;
}

/* ── Stats ──────────────────────────────────────────── */

export interface TimelineStats {
  confirmed: number;
  pending: number;
  totalCovers: number;
  total: number;
}

/* ── Result ─────────────────────────────────────────── */

export interface UseTimelineDataResult {
  reservations: Reservation[];
  tables: Table[];
  isLoading: boolean;
  fetchError: Error | null;
  stats: TimelineStats;
  seatGuest: (reservation: Reservation) => Promise<Reservation>;
  cancelReservation: (id: string, args: CancelArgs) => Promise<void>;
  updateReservation: (id: string, data: UpdateReservationRequest) => Promise<Reservation>;
  createWalkIn: (data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
  }) => Promise<void>;
  updateTableStatus: (tableId: string, status: TableStatus) => Promise<void>;
}

/* ── Hook ───────────────────────────────────────────── */

export function useTimelineData({ venueId, date }: UseTimelineDataParams): UseTimelineDataResult {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const enabled = !!venueId;

  const {
    data: allReservations,
    isLoading: reservationsLoading,
    error: reservationsError,
  } = useReservations({
    venueId,
    date,
    limit: 200,
    enabled,
  });

  const {
    data: rawTables,
    isLoading: tablesLoading,
    error: tablesError,
  } = useTables({
    venueId,
    limit: 100,
    enabled,
  });

  const isLoading = reservationsLoading || tablesLoading;
  const fetchError = reservationsError ?? tablesError;

  const tables = useMemo(() => {
    if (!rawTables) return [];
    return [...rawTables].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return (a.tableNumber || a.name).localeCompare(b.tableNumber || b.name);
    });
  }, [rawTables]);

  const reservations = useMemo(
    () => (allReservations ?? []).filter((r) => r.date === date),
    [allReservations, date]
  );

  const stats = useMemo<TimelineStats>(() => {
    const confirmed = reservations.filter((r) => r.status === "CONFIRMED").length;
    const pending = reservations.filter((r) => r.status === "PENDING").length;
    const totalCovers = reservations
      .filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW")
      .reduce((sum, r) => sum + r.partySize, 0);
    return { confirmed, pending, totalCovers, total: reservations.length };
  }, [reservations]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [RESERVATIONS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [TABLES_QUERY_KEY] });
  };

  const seatGuest = async (reservation: Reservation): Promise<Reservation> => {
    const updated = await api.reservations.update(reservation.id, { status: "CONFIRMED" });
    await api.tables.updateStatus(reservation.tableId, "OCCUPIED");
    invalidateAll();
    return updated;
  };

  const cancelReservation = async (id: string, { reason, note }: CancelArgs): Promise<void> => {
    await api.reservations.cancelWithReason(id, {
      cancellationReason: reason,
      cancellationNote: note,
    });
    invalidateAll();
  };

  const updateReservation = async (
    id: string,
    data: UpdateReservationRequest
  ): Promise<Reservation> => {
    const updated = await api.reservations.update(id, data);
    invalidateAll();
    return updated;
  };

  const createWalkIn = async (data: {
    partySize: number;
    tableId: string;
    venueId: string;
    guestName?: string;
  }): Promise<void> => {
    await api.reservations.walkIn(data);
    invalidateAll();
  };

  const updateTableStatus = async (tableId: string, status: TableStatus): Promise<void> => {
    await api.tables.updateStatus(tableId, status);
    invalidateAll();
  };

  return {
    reservations,
    tables,
    isLoading,
    fetchError,
    stats,
    seatGuest,
    cancelReservation,
    updateReservation,
    createWalkIn,
    updateTableStatus,
  };
}
