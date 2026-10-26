import { MINUTES_PER_DAY, localDateTimeOf, resolveDay } from "@mbe/availability";
import type { AvailabilitySnapshot, ResolvedClosure } from "@mbe/availability";
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
  /** Set for a non-terminal deposit (`pending` or `held`). Named for the common case. */
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
  };
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
}): ClosureImpact {
  const { timezone, config, rule, bookings, alongside } = input;
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

  const groups = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, reservations]) => toGroup(date, kind, reservations));
  return {
    reservations: groups.reduce((n, g) => n + g.reservations.length, 0),
    covers: groups.reduce((n, g) => n + g.covers, 0),
    depositsHeld: groups.reduce((n, g) => n + g.depositsHeld, 0),
    groups,
  };
}
