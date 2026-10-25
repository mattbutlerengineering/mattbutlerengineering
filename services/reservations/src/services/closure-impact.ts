import { resolveDay, serviceDayInstant } from "@mbe/availability";
import type { AvailabilitySnapshot, ResolvedClosure } from "@mbe/availability";
import type {
  AvailabilityConfig,
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
  /** Set only for a deposit in the `held` state. */
  heldDeposit: { amountCents: number; currency: string } | null;
}

const MS_PER_MINUTE = 60_000;

/** `closed`: the whole day or service goes; anything narrower (a window, new hours) is `shortened`. */
function kindOf(rule: DateRule): ClosureImpactKind {
  return rule.kind === "closure" && !rule.window ? "closed" : "shortened";
}

/** The config as it would be with the draft saved: a rule with the same id is replaced. */
function withDraft(config: AvailabilityConfig, rule: DateRule): AvailabilityConfig {
  return { ...config, dateRules: [...config.dateRules.filter((r) => r.id !== rule.id), rule] };
}

const minutesBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / MS_PER_MINUTE;

/** Does a band of the draft cut into the booking after it has started? */
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
  strandedAfter: boolean;
  runsInto: boolean;
}

function assess(
  before: AvailabilitySnapshot,
  after: AvailabilitySnapshot,
  rule: DateRule,
  booking: ImpactBooking
): Verdicts | null {
  if (strandReason(before, booking) !== null) return null; // already unserved: not this change's doing
  if (strandReason(after, booking) !== null) return { strandedAfter: true, runsInto: false };

  const date = booking.date.toISOString().slice(0, 10);
  const midnight = serviceDayInstant(date, 0, after.timezone);
  if (!midnight) return null;
  const startMin = minutesBetween(midnight, booking.startTime);
  const endMin = minutesBetween(midnight, booking.endTime);
  const served = new Set(
    resolveDay(before, date)
      .services.filter((s) => s.opensAt <= startMin && startMin < s.closesAt)
      .map((s) => s.venueServiceId)
  );
  const runsInto = resolveDay(after, date).closures.some(
    (band) => band.ruleId === rule.id && runsIntoBand(band, startMin, endMin, served)
  );
  return runsInto ? { strandedAfter: false, runsInto: true } : null;
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
  bookings: readonly ImpactBooking[];
}): ClosureImpact {
  const { timezone, config, rule, bookings } = input;
  const before = { timezone, config };
  const after = { timezone, config: withDraft(config, rule) };
  const kind = kindOf(rule);

  const byDate = new Map<string, ClosureImpactReservation[]>();
  for (const booking of bookings) {
    const verdict = assess(before, after, rule, booking);
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
