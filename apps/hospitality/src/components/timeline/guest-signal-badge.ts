import type { GuestSignalEventData, Reservation, SseEvent } from "@mbe/types";

/**
 * "On My Way" staff badge (docs/plans/2026-10-18-on-my-way.md § 3): derived, never stored, from
 * the latest guest signal the live feed delivered for a reservation. Signals never mutate the
 * booking, so the reservation list does not carry them; the client holds the latest one per
 * reservation (see `useGuestSignals`) and this module decides what, if anything, it shows.
 */

export interface GuestSignalBadge {
  /** How late the guest said they would be. */
  minutes: number;
  /** The expected arrival: the reservation start + `minutes`, as a UTC ISO instant. */
  eta: string;
  /**
   * The table is held for the party: true until the ETA. A late signal can be sent up to 45
   * minutes after the start, so its ETA may already be past on arrival; the plan does not define
   * that case, so it is handled as "held = false": the guest told us they are coming (the badge
   * stays, announced as past ETA) but nothing says the table is still reserved for them.
   */
  held: boolean;
}

export type GuestSignals = ReadonlyMap<string, GuestSignalEventData>;

const CLEARING_EVENTS: ReadonlySet<SseEvent["type"]> = new Set([
  "reservation:updated",
  "reservation:cancelled",
  "hold:confirmed",
]);

/**
 * Folds one feed event into the latest-signal-per-reservation map. A later signal replaces an
 * earlier one; any event that changes the reservation drops its signal. Returns the same map
 * when the event changes nothing.
 */
export function reduceGuestSignals(signals: GuestSignals, event: SseEvent): GuestSignals {
  if (event.type === "reservation:guest-signal") {
    const next = new Map(signals);
    next.set(event.data.reservationId, event.data);
    return next;
  }
  if (CLEARING_EVENTS.has(event.type)) {
    const id = (event.data as Partial<Pick<Reservation, "id">> | null)?.id;
    if (id === undefined || !signals.has(id)) return signals;
    const next = new Map(signals);
    next.delete(id);
    return next;
  }
  return signals;
}

export interface GuestSignalBadgeInput {
  signal: GuestSignalEventData | undefined;
  reservation: Pick<Reservation, "status" | "startTime">;
  /** The party is on its table now. */
  seated: boolean;
  now: Date;
}

/**
 * The badge for a reservation, or null. Only a late signal shows one ("arrived" is the chime's
 * job). It clears when the party is seated, the booking is no longer CONFIRMED, or the start no
 * longer equals the ETA minus the signalled minutes (the reservation moved after the signal, which
 * covers a change the live feed missed).
 */
export function deriveGuestSignalBadge({
  signal,
  reservation,
  seated,
  now,
}: GuestSignalBadgeInput): GuestSignalBadge | null {
  if (!signal || signal.kind !== "running-late" || seated) return null;
  if (reservation.status !== "CONFIRMED") return null;
  const { minutes, eta } = signal;
  if (minutes === undefined || eta === undefined) return null;
  const etaMs = new Date(eta).getTime();
  const startMs = new Date(reservation.startTime).getTime();
  if (Number.isNaN(etaMs) || Number.isNaN(startMs)) return null;
  if (startMs + minutes * 60_000 !== etaMs) return null;
  return { minutes, eta, held: now.getTime() < etaMs };
}

/**
 * Badges keyed by table, for the floor plan. A table with two badged reservations shows the one
 * expected first.
 */
export function badgesByTableId(
  reservations: readonly Pick<Reservation, "id" | "tableId">[],
  badges: ReadonlyMap<string, GuestSignalBadge>
): ReadonlyMap<string, GuestSignalBadge> {
  const byTable = new Map<string, GuestSignalBadge>();
  for (const reservation of reservations) {
    const badge = badges.get(reservation.id);
    if (!badge) continue;
    const existing = byTable.get(reservation.tableId);
    if (!existing || badge.eta < existing.eta) byTable.set(reservation.tableId, badge);
  }
  return byTable;
}
