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

/**
 * Whether a Tonight change leaves no seating minute bookable, from `now`, on
 * the services it targets (other Tonight changes stripped): a close-early at
 * or before the open or already past, or a stop window over what is left of
 * the service, closes the night in effect whatever the payload kind. Only
 * venue and service targets have seatings; a target with no service tonight
 * removes nothing.
 */
export function leavesNothingBookable(
  snapshot: AvailabilitySnapshot,
  rule: DateRule,
  now: Date
): boolean {
  if (rule.kind !== "tonight") return false;
  if (rule.targetKind !== "venue" && rule.targetKind !== "service") return false;
  const rules = snapshot.config.dateRules.filter((r) => r.kind !== "tonight");
  const withRules = (dateRules: DateRule[]): AvailabilitySnapshot => ({
    ...snapshot,
    config: { ...snapshot.config, dateRules },
  });
  const targeted = resolveDay(withRules(rules), rule.startsOn).services.filter(
    (s) => rule.targetKind === "venue" || s.venueServiceId === rule.venueServiceId
  );
  const after = resolveDay(withRules([...rules, rule]), rule.startsOn);
  const nowMin = wallMinutes(now, rule.startsOn, snapshot.timezone);
  return (
    targeted.length > 0 &&
    targeted.every((planned) => {
      const s = after.services.find((d) => d.venueServiceId === planned.venueServiceId);
      if (!s) return true;
      const bands = after.closures.filter(
        (c) =>
          c.targetKind === "venue" ||
          (c.targetKind === "service" && c.venueServiceId === s.venueServiceId)
      );
      const open: StartRange[] = [[Math.max(s.opensAt, nowMin), s.lastSeatingAt]];
      return bands
        .reduce((ranges, band) => clearOfBand(ranges, band, 1), open)
        .every(([lo, hi]) => lo > hi);
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
