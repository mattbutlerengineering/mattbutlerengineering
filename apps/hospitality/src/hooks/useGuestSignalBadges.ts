import { useMemo } from "react";
import type { Reservation } from "@mbe/types";
import { useGuestSignals } from "./useSSESync.js";
import {
  deriveGuestSignalBadge,
  type GuestSignalBadge,
} from "../components/timeline/guest-signal-badge.js";

/**
 * The "On My Way" badge per reservation id, from the live feed's latest guest signal. Reservations
 * without a badge are absent. `seatedIds` and `now` are the caller's, so the badge clears on the
 * same clock and the same "seated" fact the rest of the screen uses.
 */
export function useGuestSignalBadges(
  reservations: readonly Pick<Reservation, "id" | "status" | "startTime">[],
  seatedIds: ReadonlySet<string>,
  now: Date
): ReadonlyMap<string, GuestSignalBadge> {
  const signals = useGuestSignals();
  return useMemo(() => {
    const badges = new Map<string, GuestSignalBadge>();
    for (const reservation of reservations) {
      const badge = deriveGuestSignalBadge({
        signal: signals.get(reservation.id),
        reservation,
        seated: seatedIds.has(reservation.id),
        now,
      });
      if (badge) badges.set(reservation.id, badge);
    }
    return badges;
  }, [reservations, signals, seatedIds, now]);
}
