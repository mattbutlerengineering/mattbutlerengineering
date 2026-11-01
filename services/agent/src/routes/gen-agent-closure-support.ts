import type { z } from "zod";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { AVAILABILITY_PAGE, clockToMinute } from "./gen-agent-availability-tools.js";
import { refusalOf, saveUnsure, type ApiClient } from "./gen-tool-support.js";

/**
 * The closure tools' pure helpers (#7929): dates read in the venue's calendar,
 * which rule a request names, and the words a refusal is passed on in.
 */

export type SpecialHoursRule = Extract<DateRule, { kind: "special_hours" }>;
export type ClosureRule = Extract<DateRule, { kind: "closure" }>;
export type DatedRule = ClosureRule | SpecialHoursRule;
export type Impact = Awaited<ReturnType<ApiClient["availability"]["getClosureImpact"]>>;

const MS_PER_DAY = 86_400_000;
const MINUTES_IN_DAY = 1440;
/** The reservations API's cap on a closure's dated span (`SCOPE_CONFLICT_HORIZON_DAYS`). */
const MAX_CLOSURE_DAYS = 366;
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** What `reopen_closure` is given as `to` for a closure with no end date. */
export const UNTIL_REOPENED = "until reopened";

const UNREADABLE_DATE = "The date can't be read. Use a real date as YYYY-MM-DD.";
/** `reopen_closure`'s last date also takes the open-end literal, so its refusal names it. */
export const UNREADABLE_SPAN_DATE = `The date can't be read. Use a real date as YYYY-MM-DD, or "${UNTIL_REOPENED}" as the last date of a closure with no end.`;
export const CHECK_FAILED =
  "Couldn't check which bookings this would affect. Nothing was changed. Ask the user to try again shortly.";
export const SAVE_UNSURE = saveUnsure("list_closures");
export const NO_REGULAR_HOURS = `That date has no regular hours to build special hours on. ${AVAILABILITY_PAGE}`;
const HOURS_ORDER =
  "Opening, last seating and closing don't fit: the last seating must fall between opening and closing, and closing can't be the same time as opening.";

// ── Dates ───────────────────────────────────────────────────

/** Days since the epoch for a real YYYY-MM-DD date, or undefined for anything else (2026-02-30 included). */
export function dayNumber(date: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const instant = new Date(Date.UTC(year, month - 1, day));
  const reads =
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day;
  return reads ? instant.getTime() / MS_PER_DAY : undefined;
}

function weekdayOf(date: string): number {
  return new Date(dayNumber(date)! * MS_PER_DAY).getUTCDay();
}

/**
 * The dates to close: real, after today in the venue's calendar (tonight has
 * its own tool), in order, and no longer than the API allows.
 */
export function checkSpan(
  date: string,
  endDate: string | undefined,
  today: string
): { from: string; to: string } | { error: string } {
  const start = dayNumber(date);
  const end = endDate === undefined ? start : dayNumber(endDate);
  if (start === undefined || end === undefined) return { error: UNREADABLE_DATE };
  const now = dayNumber(today)!;
  if (start < now) {
    return { error: `${date.trim()} is in the past for this venue (today is ${today}).` };
  }
  if (start === now) {
    return {
      error: `Today (${today}) can't be changed here. For tonight use change_tonight_availability; pick a later date for this.`,
    };
  }
  if (end < start) {
    return { error: `The last date (${endDate}) is before the first (${date}).` };
  }
  if (end - start + 1 > MAX_CLOSURE_DAYS) {
    return {
      error: `A closure can cover at most ${MAX_CLOSURE_DAYS} days. Close a shorter stretch, or close until reopened on the Availability page.`,
    };
  }
  return { from: date.trim(), to: (endDate ?? date).trim() };
}

/** Whether `rule` is in force on `date`: in its range, on its weekdays, and not taken out by a skip or edit of it. */
function coversDate(rule: DatedRule, date: string, config: AvailabilityConfig): boolean {
  const skipped = config.dateRules.some(
    (other) =>
      other.seriesId === rule.id &&
      other.startsOn <= date &&
      (other.endsOn ?? other.startsOn) >= date
  );
  return (
    !skipped &&
    rule.startsOn <= date &&
    (rule.endsOn == null || rule.endsOn >= date) &&
    (!rule.repeat || rule.repeat.weekdays.includes(weekdayOf(date)))
  );
}

/** A rule's dates as the tools state them; `to` is `until reopened` when it has no end, as `reopen_closure` takes it. */
export function spanOf(rule: DatedRule) {
  return { from: rule.startsOn, to: rule.endsOn ?? UNTIL_REOPENED };
}

export function spanText(rule: DatedRule): string {
  return rule.endsOn == null
    ? `from ${rule.startsOn} until reopened`
    : `from ${rule.startsOn} to ${rule.endsOn}`;
}

export const isDated = (rule: DateRule): rule is DatedRule =>
  rule.kind === "closure" || rule.kind === "special_hours";

// ── Words ───────────────────────────────────────────────────

export function serviceName(config: AvailabilityConfig, id: string): string {
  return config.venueServices.find((s) => s.id === id)?.name ?? "a service";
}

export function scopeOf(rule: DatedRule, config: AvailabilityConfig): string {
  switch (rule.targetKind) {
    case "service":
      return rule.venueServiceId ? serviceName(config, rule.venueServiceId) : "a service";
    case "booking":
      return `${(rule.bookingTypes ?? []).join(" and ")} booking`;
    case "tables":
      return "some tables";
    default:
      return "the whole venue";
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Bookings that need their own decision: refused here, finished on the page. */
export function affectedResult(impact: Pick<Impact, "reservations" | "covers" | "groups">) {
  const dates = [...new Set(impact.groups.map((g) => g.date))].join(", ");
  return {
    refused: true,
    needsDecisions: true,
    error: `This would affect ${plural(impact.reservations, "booking")} (${plural(impact.covers, "cover")}) on ${dates}, and each one needs a decision (cancel, move or keep). ${AVAILABILITY_PAGE} Nothing was changed.`,
  };
}

/** The `message` of each validation issue a refusal carries, so the model can say why. */
function issueMessages(err: unknown): string[] {
  const issues = (err as { problemDetails?: { issues?: unknown } } | null)?.problemDetails?.issues;
  if (!Array.isArray(issues)) return [];
  return issues
    .map((issue) => (issue as { message?: unknown } | null)?.message)
    .filter((message): message is string => typeof message === "string" && message !== "");
}

/** A refused or failed closure call, in words the model can pass on. `unsure` is the non-API failure. */
export function closureFailure(err: unknown, unsure: string) {
  const refusal = refusalOf(err);
  if (!refusal) return { error: unsure };
  const base = { refused: true, ...(refusal.code ? { code: refusal.code } : {}) };
  switch (refusal.code ?? (refusal.status === 403 ? "forbidden" : undefined)) {
    case "decision-required":
      return {
        ...base,
        needsDecisions: true,
        error: `Bookings now sit on those dates, and each one needs a decision (cancel, move or keep). ${AVAILABILITY_PAGE} Nothing was changed.`,
      };
    case "version-conflict":
      return {
        ...base,
        error:
          "Availability changed since it was read, so nothing was saved. Ask the user to confirm again.",
      };
    case "closure-exists":
      return { ...base, error: "That closure was already saved. Nothing more was changed." };
    case "forbidden":
      return {
        ...base,
        error: `The user doesn't have permission to do this. Closing or changing dates is for a manager. A manager can make it, or it can be done on the Availability page. Nothing was changed.`,
      };
    default:
      return {
        ...base,
        error: `${[refusal.detail, ...issueMessages(err)].join(" ")} Nothing was changed.`,
      };
  }
}

// ── What a request names ────────────────────────────────────

export const SCOPES = ["whole_venue", "service"] as const;

/** `service` is required exactly when `scope` is `service`, so the confirm bar states what closes. */
export function scopeNeedsService(
  input: { readonly scope: (typeof SCOPES)[number]; readonly service?: string | undefined },
  ctx: z.RefinementCtx
): void {
  if (input.scope === "service" && !input.service) {
    ctx.addIssue({ code: "custom", path: ["service"], message: "scope service needs the service" });
  }
  if (input.scope === "whole_venue" && input.service) {
    ctx.addIssue({
      code: "custom",
      path: ["service"],
      message: "service only applies when scope is service",
    });
  }
}

/** An existing whole-day closure that already covers `target` on every date from `from` to `to`. */
export function findCoveringClosure(
  config: AvailabilityConfig,
  target: { readonly serviceId?: string | undefined },
  from: string,
  to: string
): ClosureRule | undefined {
  return config.dateRules.find(
    (r): r is ClosureRule =>
      r.kind === "closure" &&
      !r.repeat &&
      !r.seriesId &&
      !r.window &&
      (r.targetKind === "venue" ||
        (target.serviceId !== undefined &&
          r.targetKind === "service" &&
          r.venueServiceId === target.serviceId)) &&
      r.startsOn <= from &&
      (r.endsOn == null || r.endsOn >= to)
  );
}

/** A whole-day closure that already shuts `serviceId` on `date`. */
export function closureOnDay(
  config: AvailabilityConfig,
  serviceId: string,
  date: string
): ClosureRule | undefined {
  return config.dateRules.find(
    (r): r is ClosureRule =>
      r.kind === "closure" &&
      !r.window &&
      (r.targetKind === "venue" ||
        (r.targetKind === "service" && r.venueServiceId === serviceId)) &&
      coversDate(r, date, config)
  );
}

export function hasSpecialHours(config: AvailabilityConfig, date: string): boolean {
  return config.dateRules.some(
    (r) => r.kind === "special_hours" && r.seriesId == null && coversDate(r, date, config)
  );
}

const matchesScope = (rule: DatedRule, scope: (typeof SCOPES)[number], serviceId?: string) =>
  scope === "whole_venue"
    ? rule.targetKind === "venue"
    : rule.targetKind === "service" && rule.venueServiceId === serviceId;

const ONLY_THESE_HERE = "Closures of the whole venue or one service can be reopened here.";

/**
 * The one closure the user confirmed reopening: named by its full span and
 * scope. Any mismatch refuses with the real span, so a request for one day of a
 * longer closure is re-proposed instead of removing days the user never saw.
 */
export function findReopenable(
  config: AvailabilityConfig,
  want: {
    readonly from: string;
    readonly to: string | null;
    readonly scope: (typeof SCOPES)[number];
    readonly serviceId?: string | undefined;
  }
): { rule: ClosureRule } | { error: string } {
  const near = config.dateRules
    .filter(isDated)
    .filter(
      (r) =>
        r.startsOn === want.from ||
        coversDate(r, want.from, config) ||
        (want.to !== null && coversDate(r, want.to, config))
    );
  if (near.length === 0) {
    return { error: `No closure or special hours cover ${want.from}. Check list_closures.` };
  }
  const inScope = near.filter((r) => matchesScope(r, want.scope, want.serviceId));
  if (inScope.length === 0) {
    const have = near.map((r) => `${scopeOf(r, config)} ${spanText(r)}`).join("; ");
    return {
      error: `A closure covers those dates, but not for that scope: ${have}. ${ONLY_THESE_HERE} Propose again with its scope and full span, or ${AVAILABILITY_PAGE} Nothing was changed.`,
    };
  }
  const exact = inScope.filter(
    (r) => r.startsOn === want.from && (want.to === null ? r.endsOn == null : r.endsOn === want.to)
  );
  if (exact.length === 0) {
    const real = inScope.map(spanText).join("; ");
    return {
      error: `That closure runs ${real}, not ${want.from} to ${want.to ?? UNTIL_REOPENED}. Reopening removes all of it, so propose again with its full span. Nothing was changed.`,
    };
  }
  // A plain closure may share its span with special hours; only closures compete for the reopen.
  const closures = exact.filter((r) => r.kind === "closure");
  const named = closures.length > 0 ? closures : exact;
  if (named.length > 1) {
    return {
      error: `More than one closure has that scope and span, so they can't be told apart here. ${AVAILABILITY_PAGE} Nothing was changed.`,
    };
  }
  return reopenableOnly(named[0]!);
}

/** What the chat won't reopen: removing these skips checks the Availability page makes. */
function reopenableOnly(rule: DatedRule): { rule: ClosureRule } | { error: string } {
  if (rule.kind === "special_hours") {
    return {
      error: `Special hours can't be removed from the chat, because removing them can leave bookings without a service and only the page checks for that. ${AVAILABILITY_PAGE} Nothing was changed.`,
    };
  }
  if (rule.repeat || rule.seriesId) {
    return {
      error: `That closure repeats or belongs to a repeating series, and reopening it would also remove that series' skipped dates and edits. ${AVAILABILITY_PAGE} Nothing was changed.`,
    };
  }
  return { rule };
}

// ── Hours ───────────────────────────────────────────────────

export interface HoursInput {
  readonly opensAt: string;
  readonly lastSeating: string;
  readonly closesAt: string;
}

/**
 * The hours on the venue's two-day minute scale: a time before opening belongs
 * to the night that began the day before. Closing at the opening time is
 * refused, never read as a 24-hour service.
 */
export function checkHours(
  input: HoursInput
): { opensAt: number; lastSeatingAt: number; closesAt: number } | { error: string } {
  const opensAt = clockToMinute(input.opensAt);
  const closeWall = clockToMinute(input.closesAt);
  const last = clockToMinute(input.lastSeating);
  if (closeWall === opensAt) return { error: HOURS_ORDER };
  const closesAt = closeWall < opensAt ? closeWall + MINUTES_IN_DAY : closeWall;
  const lastSeatingAt = last < opensAt ? last + MINUTES_IN_DAY : last;
  if (lastSeatingAt > closesAt) return { error: HOURS_ORDER };
  return { opensAt, lastSeatingAt, closesAt };
}
