import {
  MINUTES_PER_DAY,
  addDays,
  localDateTimeOf,
  resolveDay,
  serviceDayInstant,
} from "@mbe/availability";
import type { AvailabilitySnapshot } from "@mbe/availability";
import type {
  ClosureAction,
  ClosureDecision,
  ClosureImpact,
  ClosureImpactReservation,
  DateRule,
} from "@mbe/types";

/**
 * The decision half of the closure command, pure
 * (architecture.md § Closure command): check the Manager's choices against the
 * impact groups, find where a `move` goes, and apply the Host emergency limits.
 */

export type DecisionCheck =
  | { kind: "ok"; actions: ReadonlyMap<string, ClosureDecision> }
  | { kind: "decision-required"; groupKeys: string[] }
  | { kind: "invalid-decision"; groupKeys: string[] };

/**
 * Every group needs exactly one decision. `move` is only for a shortened
 * group; `keep_silent` needs the acknowledgement. A decision naming no group
 * (or one twice) is invalid rather than ignored, so a stale client is told.
 */
export function checkDecisions(
  impact: ClosureImpact,
  decisions: readonly ClosureDecision[]
): DecisionCheck {
  const groups = new Map(impact.groups.map((g) => [g.groupKey, g]));
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const d of decisions) {
    const group = groups.get(d.groupKey);
    const bad =
      !group || seen.has(d.groupKey) || (d.action === "move" && group.kind !== "shortened");
    if (bad) invalid.push(d.groupKey);
    seen.add(d.groupKey);
  }
  if (invalid.length > 0) return { kind: "invalid-decision", groupKeys: invalid };

  const answered = new Map(decisions.map((d) => [d.groupKey, d]));
  const missing = impact.groups
    .map((g) => g.groupKey)
    .filter((key) => {
      const d = answered.get(key);
      return !d || (d.action === "keep_silent" && d.acknowledged !== true);
    });
  return missing.length > 0
    ? { kind: "decision-required", groupKeys: missing }
    : { kind: "ok", actions: answered };
}

export function countActions(actions: readonly ClosureAction[]): Record<ClosureAction, number> {
  const counts = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 };
  for (const a of actions) counts[a] += 1;
  return counts;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

function wallMinutes(instant: Date, serviceDate: string, tz: string): number {
  const local = localDateTimeOf(instant, tz);
  return (
    ((Date.parse(local.date) - Date.parse(serviceDate)) / MS_PER_DAY) * MINUTES_PER_DAY +
    local.minute
  );
}

type StartRange = readonly [lo: number, hi: number];

/**
 * The ranges left of `ranges` once starts that hit the band are removed.
 * `span` is how much of the booking the band covers: all of it for a closure,
 * one minute (the start) for a Tonight stop window, which only stops new seatings.
 */
function clearOfBand(
  ranges: readonly StartRange[],
  band: { from: number; to: number },
  span: number
): StartRange[] {
  const lastBefore = band.from - span; // latest start that clears the band
  return ranges.flatMap(([lo, hi]) => [
    ...(lo <= lastBefore ? [[lo, Math.min(hi, lastBefore)] as const] : []),
    ...(hi >= band.to ? [[Math.max(lo, band.to), hi] as const] : []),
  ]);
}

/**
 * The start closest to the booking's own that the changed day still serves
 * with the booking's length: inside one service, no later than its last
 * seating, finishing by its close, not before `now`, and clear of every
 * closure band that covers the service (a windowed closure is a band, not a
 * trimmed service). Null when nothing fits, or the booking already sits there.
 */
export function moveTarget(
  after: AvailabilitySnapshot,
  serviceDate: string,
  booking: Pick<ClosureImpactReservation, "startTime" | "endTime">,
  now: Date
): { startTime: Date; endTime: Date } | null {
  const start = new Date(booking.startTime);
  const durationMin = (Date.parse(booking.endTime) - start.getTime()) / MS_PER_MINUTE;
  const startMin = wallMinutes(start, serviceDate, after.timezone);
  const nowMin = wallMinutes(now, serviceDate, after.timezone);
  const day = resolveDay(after, serviceDate);
  const stopRuleIds = new Set(
    after.config.dateRules.filter((r) => r.kind === "tonight").map((r) => r.id)
  );
  const spanOf = (band: { ruleId: string }): number =>
    stopRuleIds.has(band.ruleId) ? 1 : durationMin;
  const candidates = day.services.flatMap((s) => {
    const bands = day.closures.filter(
      (c) =>
        c.targetKind === "venue" ||
        (c.targetKind === "service" && c.venueServiceId === s.venueServiceId)
    );
    const open: StartRange[] = [
      [Math.max(s.opensAt, nowMin), Math.min(s.lastSeatingAt, s.closesAt - durationMin)],
    ];
    const free = bands
      .reduce((ranges, band) => clearOfBand(ranges, band, spanOf(band)), open)
      .filter(([lo, hi]) => lo <= hi);
    return free.map(([lo, hi]) => Math.min(Math.max(startMin, lo), hi));
  });
  const best = candidates.sort((a, b) => Math.abs(a - startMin) - Math.abs(b - startMin))[0];
  if (best === undefined || best === startMin) return null;
  const startTime = serviceDayInstant(serviceDate, best, after.timezone);
  return startTime
    ? { startTime, endTime: new Date(startTime.getTime() + durationMin * MS_PER_MINUTE) }
    : null;
}

/**
 * The service day "tonight" means right now (ADR-029): today's civil date when
 * one of its services is open, else yesterday's when its service runs past
 * midnight and is still open, else today's. A Fri 22:00-02:00 service at Sat
 * 00:30 is still Friday's.
 */
export function currentServiceDate(snapshot: AvailabilitySnapshot, now: Date): string {
  const today = localDateTimeOf(now, snapshot.timezone).date;
  const isOpen = (date: string): boolean => {
    const minute = wallMinutes(now, date, snapshot.timezone);
    return resolveDay(snapshot, date).services.some(
      (s) => s.opensAt <= minute && minute < s.closesAt
    );
  };
  if (isOpen(today)) return today;
  const yesterday = addDays(today, -1);
  return isOpen(yesterday) ? yesterday : today;
}

/** A service a Tonight change leaves open for less than this is closed in effect (#7687). */
export const MIN_SERVICE_MINUTES = 60;

type DayServices = ReturnType<typeof resolveDay>;

/**
 * The seating starts a service still offers on a resolved day from `fromMin`: its own grid
 * (every interval from the open, or its fixed times), up to the last seating and before close,
 * not inside a stop band that covers it. The engine books these and nothing between them.
 */
function seatingStarts(day: DayServices, venueServiceId: string, fromMin: number): number[] {
  const s = day.services.find((d) => d.venueServiceId === venueServiceId);
  if (!s) return [];
  const grid =
    "interval" in s.seating
      ? Array.from(
          {
            length: Math.max(Math.floor((s.lastSeatingAt - s.opensAt) / s.seating.interval) + 1, 0),
          },
          (_, k) => s.opensAt + k * (s.seating as { interval: number }).interval
        )
      : [...new Set(s.seating.fixed)];
  const bands = day.closures.filter(
    (c) =>
      c.targetKind === "venue" ||
      (c.targetKind === "service" && c.venueServiceId === s.venueServiceId)
  );
  return grid
    .filter((m) => m >= Math.max(s.opensAt, fromMin) && m <= s.lastSeatingAt && m < s.closesAt)
    .filter((m) => !bands.some((band) => band.from <= m && m < band.to))
    .sort((x, y) => x - y);
}

/** First seating to last seating, in minutes: how long the service is still taking bookings. */
const spanOf = (starts: readonly number[]): number =>
  starts.length === 0 ? 0 : starts[starts.length - 1]! - starts[0]!;

/**
 * Whether a Tonight change is the emergency close in effect (#7687): on a
 * targeted service that is still bookable from `now` before the change, the
 * change leaves nothing bookable from `now`, or leaves less than
 * MIN_SERVICE_MINUTES between its first and last seating, counted from the planned open.
 * "Before" keeps the other active Tonight rules, so closing the night in steps
 * is judged on its last step. A service already past its last seating has
 * nothing left to close. Only venue and service targets have seatings.
 */
export function isEmergencyTonightClose(
  snapshot: AvailabilitySnapshot,
  rule: DateRule,
  now: Date
): boolean {
  if (rule.kind !== "tonight") return false;
  if (rule.targetKind !== "venue" && rule.targetKind !== "service") return false;
  const others = snapshot.config.dateRules.filter((r) => r.id !== rule.id);
  const withRules = (dateRules: DateRule[]): AvailabilitySnapshot => ({
    ...snapshot,
    config: { ...snapshot.config, dateRules },
  });
  const planned = resolveDay(withRules(others.filter((r) => r.kind !== "tonight")), rule.startsOn);
  const before = resolveDay(withRules(others), rule.startsOn);
  const after = resolveDay(withRules([...others, rule]), rule.startsOn);
  const nowMin = wallMinutes(now, rule.startsOn, snapshot.timezone);
  const live = before.services
    .filter((s) => rule.targetKind === "venue" || s.venueServiceId === rule.venueServiceId)
    .filter((s) => seatingStarts(before, s.venueServiceId, nowMin).length > 0);
  return (
    live.length > 0 &&
    live.every((s) => {
      if (seatingStarts(after, s.venueServiceId, nowMin).length === 0) return true;
      const plannedOpen = planned.services.find((p) => p.venueServiceId === s.venueServiceId);
      const fromOpen = seatingStarts(after, s.venueServiceId, plannedOpen?.opensAt ?? s.opensAt);
      return spanOf(fromOpen) < MIN_SERVICE_MINUTES;
    })
  );
}

/**
 * The Host's one allowed closure: the whole venue, the whole of the current
 * service day, and nothing narrower or wider (architecture.md § Venue roles).
 */
export function isHostEmergencyClose(rule: DateRule, serviceDate: string): boolean {
  return (
    rule.kind === "closure" &&
    rule.targetKind === "venue" &&
    !rule.window &&
    !rule.repeat &&
    rule.startsOn === serviceDate &&
    rule.endsOn === serviceDate
  );
}
