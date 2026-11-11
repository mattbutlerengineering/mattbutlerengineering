import { useMemo } from "react";
import type { Table } from "@mbe/types";
import { useNow } from "./useNow.js";
import { useReservations } from "./useReservations.js";
import { useStaffTonight } from "./useStaffTonight.js";
import { useGuestSignalBadges } from "./useGuestSignalBadges.js";
import { seatedReservationIds } from "../utils/seated.js";
import { deviceDate } from "../utils/service-day.js";
import {
  badgesByTableId,
  type GuestSignalBadge,
} from "../components/timeline/guest-signal-badge.js";

/**
 * The live floor's "On My Way" badge per table id: tonight's reservations (the list the Timeline
 * reads, refreshed by the same SSE invalidation) joined with the latest guest signals. The floor
 * plan page loads no reservations of its own, so this is its only source for which table a
 * signalled reservation belongs to.
 */
export function useTableGuestSignalBadges(
  venueId: string | undefined,
  tables: readonly Table[]
): ReadonlyMap<string, GuestSignalBadge> {
  const now = useNow();
  const tonight = useStaffTonight(venueId);
  const { data } = useReservations({
    venueId,
    date: tonight.serviceDate ?? deviceDate(now),
    limit: 200,
    enabled: !!venueId,
  });
  const reservations = useMemo(() => data ?? [], [data]);
  const seatedIds = useMemo(
    () => seatedReservationIds(reservations, tables, now),
    [reservations, tables, now]
  );
  const badges = useGuestSignalBadges(reservations, seatedIds, now);
  return useMemo(() => badgesByTableId(reservations, badges), [reservations, badges]);
}
