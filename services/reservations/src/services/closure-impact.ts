import { MINUTES_PER_DAY, localDateTimeOf, resolveDay } from "@mbe/availability";
import type {
  AvailabilitySnapshot,
  HoldSlim,
  ReservationSlim,
  ResolvedClosure,
} from "@mbe/availability";
import { BOOKING_ORIGIN_HOSTS } from "@mbe/types";
import type {
  AvailabilityConfig,
  ClosureAlongside,
  ClosureImpact,
  ClosureImpactGroup,
  ClosureImpactKind,
  ClosureImpactReservation,
  DateRule,
} from "@mbe/types";
import { strandReason } from "./availability-config-checks.js";
import { moveTarget } from "./closure-command-plan.js";
import { checkTableConflict } from "./slot-rules.js";

/**
 * The affected-set preview of a closure, special hours or Tonight change
 * (docs/features/venue-availability/architecture.md § Closure command): which
 * future bookings a draft date rule would leave without service, grouped by
 * service date and kind, plus the ones that start before a closure band and
 * run into it. Pure over engine output; the store loads the bookings.
 */

export interface ImpactBooking {
  id: string;
  tableId: string | null;
  /** The service day (ADR-029). */
  date: Date;
  startTime: Date;
  endTime: Date;
  partySize: number;
  guestName: string | null;
  /** The host the guest booked on (#7892); anything but the allowlisted hosts reads as none. */
  originHost?: string | null;
  /** Set for a deposit a cancel owes a refund or void on: live (`pending`/`held`) or captured with a payment intent. `amountCents` is the estimate of what is still owed (the deposit less refunds already recorded; can be 0), not the deposit's amount. */
  heldDeposit: { amountCents: number; currency: string } | null;
}

/** `closed`: the whole day or service goes; anything narrower (a window, new hours) is `shortened`. */
function kindOf(rule: DateRule): ClosureImpactKind {
  return rule.kind === "closure" && !rule.window ? "closed" : "shortened";
}

/** The config as it would be with the draft saved: a rule with the same id is replaced. */
function withDraft(config: AvailabilityConfig, rule: DateRule): AvailabilityConfig {
  return { ...config, dateRules: [...config.dateRules.filter((r) => r.id !== rule.id), rule] };
}

/**
 * The config with a series edit's other row changes applied (rows removed, then upserted by id),
 * before the draft goes in. Shared by the preview and the closure command so both see one config.
 */
export function withAlongside(
  config: AvailabilityConfig,
  alongside: ClosureAlongside | undefined
): AvailabilityConfig {
  if (!alongside) return config;
  const upserted = new Set(alongside.upsert.map((r) => r.id));
  const removed = new Set(alongside.remove);
  const kept = config.dateRules.filter((r) => !removed.has(r.id) && !upserted.has(r.id));
  return { ...config, dateRules: [...kept, ...alongside.upsert] };
}

/** The config as it will be once the closure (and what it replaces) is saved. */
export function withClosure(
  config: AvailabilityConfig,
  rule: DateRule,
  alongside?: ClosureAlongside
): AvailabilityConfig {
  return withDraft(withAlongside(config, alongside), rule);
}

const MS_PER_DAY = 86_400_000;

/** Wall-clock minutes of an instant past the service day's local midnight (ADR-029), as engine times are. */
function wallMinutes(instant: Date, serviceDate: string, tz: string): number {
  const local = localDateTimeOf(instant, tz);
  const days = (Date.parse(local.date) - Date.parse(serviceDate)) / MS_PER_DAY;
  return days * MINUTES_PER_DAY + local.minute;
}

/** Does a closure band of the draft cut into the booking after it has started? */
function runsIntoBand(
  band: ResolvedClosure,
  startMin: number,
  endMin: number,
  servedServiceIds: ReadonlySet<string>
): boolean {
  const applies =
    band.targetKind === "venue" ||
    (band.targetKind === "service" &&
      band.venueServiceId !== undefined &&
      servedServiceIds.has(band.venueServiceId));
  return applies && band.from > startMin && band.from < endMin;
}

interface Verdicts {
  runsInto: boolean;
}

/**
 * How the draft touches a booking the venue served before it, or null. Shortened
 * hours add no closure band, they move a service's `closesAt` / `lastSeatingAt`:
 * a booking that now ends after close runs into it, and one starting after the
 * new last seating can no longer be booked as it is.
 */
function assess(
  before: AvailabilitySnapshot,
  after: AvailabilitySnapshot,
  rule: DateRule,
  booking: ImpactBooking,
  replaced: ReadonlySet<string>
): Verdicts | null {
  if (strandReason(before, booking) !== null) return null; // already unserved: not this change's doing
  if (strandReason(after, booking) !== null) return { runsInto: false };

  const date = booking.date.toISOString().slice(0, 10);
  const startMin = wallMinutes(booking.startTime, date, after.timezone);
  const endMin = wallMinutes(booking.endTime, date, after.timezone);
  const dayAfter = resolveDay(after, date);
  const dayBefore = resolveDay(before, date);
  const servedBefore = dayBefore.services.filter(
    (s) => s.opensAt <= startMin && startMin < s.closesAt
  );

  const servedIds = new Set(servedBefore.map((s) => s.venueServiceId));
  const draftBands = dayAfter.closures.filter(
    (band) => band.ruleId === rule.id && runsIntoBand(band, startMin, endMin, servedIds)
  );
  // Only the series being replaced counts as already decided: its band, no later than the
  // draft's, cut into this booking before and the Manager chose then. Any other closure is news.
  const bandRunsInto = draftBands.some(
    (draft) =>
      !dayBefore.closures.some(
        (band) =>
          replaced.has(band.ruleId) &&
          band.from <= draft.from &&
          runsIntoBand(band, startMin, endMin, servedIds)
      )
  );
  const hours = servedBefore.map((was) => ({
    was,
    now: dayAfter.services.find((s) => s.venueServiceId === was.venueServiceId),
  }));
  // The close moved earlier and the booking now runs past it — including one
  // that already ran past the old close (a late seating near last seating).
  const endsAfterClose = hours.some(
    ({ was, now }) =>
      now !== undefined &&
      now.closesAt < endMin &&
      (was.closesAt >= endMin || now.closesAt < was.closesAt)
  );
  const pastLastSeating = hours.some(
    ({ was, now }) =>
      now !== undefined && now.lastSeatingAt < startMin && was.lastSeatingAt >= startMin
  );

  if (bandRunsInto || endsAfterClose) return { runsInto: true };
  return pastLastSeating ? { runsInto: false } : null;
}

function toReservation(booking: ImpactBooking, runsInto: boolean): ClosureImpactReservation {
  return {
    id: booking.id,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    partySize: booking.partySize,
    guestName: booking.guestName,
    deposit: booking.heldDeposit,
    runsIntoClosure: runsInto,
    originHost: BOOKING_ORIGIN_HOSTS.find((h) => h === booking.originHost) ?? null,
  };
}

/** The bookings and active holds on the tables a move may land on, as the save would find them. */
export interface Occupancy {
  reservations: readonly ReservationSlim[];
  holds: readonly HoldSlim[];
}

/**
 * Where "Move to the nearest open time" would put each booking, so the preview never promises a
 * move the save would refuse. The start comes from `moveTarget`, the function the closure command
 * moves with; whether the table is then free is `checkTableConflict`, the engine's form of the
 * `overlapWindow` check `closure-apply`'s `targetTaken` queries with (bookings and unexpired holds).
 * Moves are replayed in the order `applyTransitions` applies them (the group's bookings by start),
 * and a booking that lands is where the next one finds it, so two bookings that would both take a
 * table's 6:00 PM slot get one proposal and one `null`. A booking with no table is not checked.
 * Bookings other groups cancel are assumed kept: a cancel is a choice not yet made.
 */
function withProposedStarts(
  after: AvailabilitySnapshot,
  group: ClosureImpactGroup,
  tableOf: ReadonlyMap<string, string | null>,
  occupancy: Occupancy,
  now: Date
): { group: ClosureImpactGroup; standing: readonly ReservationSlim[] } {
  const placed = group.reservations.reduce(
    (acc, r) => {
      const target = moveTarget(after, group.date, r, now);
      const tableId = tableOf.get(r.id) ?? null;
      const taken =
        target !== null &&
        tableId !== null &&
        checkTableConflict(
          tableId,
          target.startTime,
          target.endTime,
          acc.standing.filter((s) => s.id !== r.id),
          occupancy.holds,
          now
        );
      const landed = taken ? null : target;
      const standing = landed
        ? acc.standing.map((s) =>
            s.id === r.id ? { ...s, startTime: landed.startTime, endTime: landed.endTime } : s
          )
        : acc.standing;
      return {
        standing,
        reservations: [
          ...acc.reservations,
          { ...r, proposedStart: landed?.startTime.toISOString() ?? null },
        ],
      };
    },
    { standing: occupancy.reservations, reservations: [] as ClosureImpactReservation[] }
  );
  return { group: { ...group, reservations: placed.reservations }, standing: placed.standing };
}

function toGroup(
  date: string,
  kind: ClosureImpactKind,
  reservations: ClosureImpactReservation[]
): ClosureImpactGroup {
  const sorted = [...reservations].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return {
    groupKey: `${date}:${kind}`,
    date,
    kind,
    covers: sorted.reduce((n, r) => n + r.partySize, 0),
    depositsHeld: sorted.filter((r) => r.deposit !== null).length,
    reservations: sorted,
  };
}

export function computeClosureImpact(input: {
  timezone: string;
  config: AvailabilityConfig;
  rule: DateRule;
  alongside?: ClosureAlongside;
  bookings: readonly ImpactBooking[];
  /** For the proposed move times: a move never lands before now. */
  now: Date;
  /** Who else holds the tables a move lands on; absent, no table is taken. */
  occupancy?: Occupancy;
}): ClosureImpact {
  const { timezone, config, rule, bookings, alongside, now } = input;
  const occupancy = input.occupancy ?? { reservations: [], holds: [] };
  const tableOf = new Map(bookings.map((b) => [b.id, b.tableId] as const));
  const before = { timezone, config };
  const after = { timezone, config: withClosure(config, rule, alongside) };
  const kind = kindOf(rule);
  const replaced = new Set([
    ...(alongside?.remove ?? []),
    ...(alongside?.upsert.map((r) => r.id) ?? []),
  ]);

  const byDate = new Map<string, ClosureImpactReservation[]>();
  for (const booking of bookings) {
    const verdict = assess(before, after, rule, booking, replaced);
    if (!verdict) continue;
    const date = booking.date.toISOString().slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), toReservation(booking, verdict.runsInto)]);
  }

  const unmoved = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, reservations]) => toGroup(date, kind, reservations));
  const groups =
    kind === "shortened"
      ? unmoved.reduce(
          (acc, g) => {
            const next = withProposedStarts(after, g, tableOf, acc.occupancy, now);
            return {
              groups: [...acc.groups, next.group],
              occupancy: { ...acc.occupancy, reservations: next.standing },
            };
          },
          { groups: [] as ClosureImpactGroup[], occupancy }
        ).groups
      : unmoved;
  return {
    reservations: groups.reduce((n, g) => n + g.reservations.length, 0),
    covers: groups.reduce((n, g) => n + g.covers, 0),
    depositsHeld: groups.reduce((n, g) => n + g.depositsHeld, 0),
    groups,
  };
}
