import { MINUTES_PER_DAY, localDateTimeOf, resolveDay, serviceDayInstant } from "@mbe/availability";
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

/**
 * The start closest to the booking's own that the changed day still serves
 * with the booking's length: inside one service, no later than its last
 * seating, and finishing by its close. Null when no service can hold it.
 */
export function moveTarget(
  after: AvailabilitySnapshot,
  serviceDate: string,
  booking: Pick<ClosureImpactReservation, "startTime" | "endTime">
): { startTime: Date; endTime: Date } | null {
  const start = new Date(booking.startTime);
  const durationMin = (Date.parse(booking.endTime) - start.getTime()) / MS_PER_MINUTE;
  const startMin = wallMinutes(start, serviceDate, after.timezone);
  const candidates = resolveDay(after, serviceDate).services.flatMap((s) => {
    const latest = Math.min(s.lastSeatingAt, s.closesAt - durationMin);
    if (latest < s.opensAt) return [];
    return [Math.min(Math.max(startMin, s.opensAt), latest)];
  });
  const best = candidates.sort((a, b) => Math.abs(a - startMin) - Math.abs(b - startMin))[0];
  if (best === undefined || best === startMin) return null;
  const startTime = serviceDayInstant(serviceDate, best, after.timezone);
  return startTime
    ? { startTime, endTime: new Date(startTime.getTime() + durationMin * MS_PER_MINUTE) }
    : null;
}

/**
 * The Host's one allowed closure: the whole venue, the whole of tonight's
 * service date, and nothing narrower or wider (architecture.md § Venue roles).
 */
export function isHostEmergencyClose(rule: DateRule, today: string): boolean {
  return (
    rule.kind === "closure" &&
    rule.targetKind === "venue" &&
    !rule.window &&
    !rule.repeat &&
    rule.startsOn === today &&
    rule.endsOn === today
  );
}
