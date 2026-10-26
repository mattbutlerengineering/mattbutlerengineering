import { resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";

/** One Tonight change in force, as a header chip describes it (ux.md F7). */
export type TonightChange =
  | { readonly ruleId: string; readonly kind: "pause_online" }
  | { readonly ruleId: string; readonly kind: "close_early"; readonly closeAt: number }
  | {
      readonly ruleId: string;
      readonly kind: "stop_window";
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly ruleId: string;
      readonly kind: "block_tables";
      readonly tableCount: number;
      readonly from: number;
      readonly to: number;
    }
  | { readonly ruleId: string; readonly kind: "pacing"; readonly covers: number };

type TonightRule = Extract<DateRule, { kind: "tonight" }>;

function describe(rule: TonightRule): TonightChange | null {
  const ruleId = rule.id;
  const { payload } = rule;
  if ("closeAt" in payload) return { ruleId, kind: "close_early", closeAt: payload.closeAt };
  if ("pacing" in payload) return { ruleId, kind: "pacing", covers: payload.pacing.covers };
  if (rule.targetKind === "booking") return { ruleId, kind: "pause_online" };
  if (rule.targetKind === "tables") {
    return {
      ruleId,
      kind: "block_tables",
      tableCount: rule.tableIds?.length ?? 0,
      from: payload.stop.from,
      to: payload.stop.to,
    };
  }
  return { ruleId, kind: "stop_window", from: payload.stop.from, to: payload.stop.to };
}

const STEP_MINUTES = 30;
/** With no service to read, offer the evening up to 11:30 PM. */
const FALLBACK_LAST_MINUTE = 23 * 60 + STEP_MINUTES;
/** `MinuteSchema` allows a service day up to two days of minutes (ADR-029). */
const MAX_MINUTE = 2880;

/**
 * Half-hour minutes on the service day's scale, from its first opening to its last close, so a
 * 5 PM to 2 AM day offers 5:00 PM through 1:00 AM (next day) and nothing before it opens. Tonight
 * changes are left out so applying one does not shrink the choices.
 */
export function tonightTimeMinutes(
  config: AvailabilityConfig,
  timezone: string,
  serviceDate: string
): readonly number[] {
  const { services } = resolveDay(
    {
      timezone,
      config: { ...config, dateRules: config.dateRules.filter((r) => r.kind !== "tonight") },
    },
    serviceDate
  );
  const first = services.length ? Math.min(...services.map((s) => s.opensAt)) : 0;
  const last = services.length
    ? Math.max(...services.map((s) => s.closesAt))
    : FALLBACK_LAST_MINUTE;
  const start = Math.floor(first / STEP_MINUTES) * STEP_MINUTES;
  const end = Math.min(MAX_MINUTE, last);
  return Array.from(
    { length: Math.max(0, Math.floor((end - start) / STEP_MINUTES)) + 1 },
    (_, i) => start + i * STEP_MINUTES
  );
}

const DEFAULT_CLOSE_AT = 22 * 60;
const DEFAULT_STOP_FROM = 19 * 60 + 30;
const DEFAULT_STOP_TO = 20 * 60;

export interface TonightDefaults {
  readonly closeAt: number;
  readonly stopFrom: number;
  readonly stopTo: number;
}

/** The nearest option at or before `target`, else the last option. */
function nearestAtOrBefore(options: readonly number[], target: number): number {
  const before = options.filter((m) => m <= target);
  return before.length ? before[before.length - 1]! : options[options.length - 1]!;
}

/**
 * The control's starting times, kept inside `options` so the selects never show nothing and
 * Apply never sends a time the day does not offer. The stop window is the nearest valid pair
 * (from before to) around the usual 7:30 to 8:00 PM.
 */
export function tonightDefaults(options: readonly number[]): TonightDefaults {
  const closeAt = nearestAtOrBefore(options, DEFAULT_CLOSE_AT);
  const fromChoices = options.slice(0, -1);
  const stopFrom = nearestAtOrBefore(fromChoices.length ? fromChoices : options, DEFAULT_STOP_FROM);
  const after = options.filter((m) => m > stopFrom);
  const stopTo = after.find((m) => m >= DEFAULT_STOP_TO) ?? after[0] ?? stopFrom;
  return { closeAt, stopFrom, stopTo };
}

/** The Tonight rules for `today` that have not yet reached their service-day boundary. */
export function activeTonightChanges(
  rules: readonly DateRule[],
  today: string,
  now: Date
): readonly TonightChange[] {
  return rules.flatMap((rule) => {
    if (rule.kind !== "tonight" || rule.startsOn !== today) return [];
    if (rule.expiresAt && new Date(rule.expiresAt).getTime() <= now.getTime()) return [];
    const change = describe(rule);
    return change ? [change] : [];
  });
}
