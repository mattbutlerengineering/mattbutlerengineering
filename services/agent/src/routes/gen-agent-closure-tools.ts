import { randomUUID } from "node:crypto";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { AvailabilityConfig, DateRule, SpecialHoursService } from "@mbe/types";
import {
  AVAILABILITY_PAGE,
  ClockSchema,
  clockToMinute,
  minuteToClock,
  resolveService,
} from "./gen-agent-availability-tools.js";
import { NO_VENUE, refusalOf, todayIn, type ApiClient } from "./gen-tool-support.js";

/**
 * Chat tools for closures and special hours on dates after tonight (#7929):
 * close the venue or one service, set a date's hours, list what is set, and
 * reopen. A closure that would touch existing bookings is never saved here: each
 * booking needs its own decision (cancel, move or keep), which stays on the
 * Availability page. Regular schedules and service hours stay there too.
 */

type SpecialHoursRule = Extract<DateRule, { kind: "special_hours" }>;
type ClosureRule = Extract<DateRule, { kind: "closure" }>;
type DatedRule = ClosureRule | SpecialHoursRule;
type Impact = Awaited<ReturnType<ApiClient["availability"]["getClosureImpact"]>>;

const MS_PER_DAY = 86_400_000;
const MINUTES_IN_DAY = 1440;
/** The reservations API's cap on a closure's dated span (`SCOPE_CONFLICT_HORIZON_DAYS`). */
const MAX_CLOSURE_DAYS = 366;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const UNREADABLE_DATE = "The date can't be read. Use a real date as YYYY-MM-DD.";
const CHECK_FAILED =
  "Couldn't check which bookings this would affect. Nothing was changed. Ask the user to try again shortly.";
const SAVE_UNSURE =
  "Couldn't confirm the change was saved. Check list_closures before trying again.";
const NO_REGULAR_HOURS = `That date has no regular hours to build special hours on. ${AVAILABILITY_PAGE}`;

// ── Dates ───────────────────────────────────────────────────

/** Days since the epoch for a real YYYY-MM-DD date, or undefined for anything else (2026-02-30 included). */
function dayNumber(date: string): number | undefined {
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

/** The dates to close: real, not in the venue's past, in order, and no longer than the API allows. */
function checkSpan(
  date: string,
  endDate: string | undefined,
  today: string
): { from: string; to: string } | { error: string } {
  const start = dayNumber(date);
  const end = endDate === undefined ? start : dayNumber(endDate);
  if (start === undefined || end === undefined) return { error: UNREADABLE_DATE };
  if (start < dayNumber(today)!) {
    return { error: `${date.trim()} is in the past for this venue (today is ${today}).` };
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

function coversDate(rule: DatedRule, date: string): boolean {
  return (
    rule.startsOn <= date &&
    (rule.endsOn == null || rule.endsOn >= date) &&
    (!rule.repeat || rule.repeat.weekdays.includes(weekdayOf(date)))
  );
}

/** A rule's dates as the tools state them: `to`, or `until: "reopened"` when it has no end. */
function spanOf(rule: DatedRule) {
  return rule.endsOn == null
    ? { from: rule.startsOn, until: "reopened" }
    : { from: rule.startsOn, to: rule.endsOn };
}

// ── Words ───────────────────────────────────────────────────

function serviceName(config: AvailabilityConfig, id: string): string {
  return config.venueServices.find((s) => s.id === id)?.name ?? "a service";
}

function scopeOf(rule: DatedRule, config: AvailabilityConfig): string {
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
function affectedResult(impact: Pick<Impact, "reservations" | "covers" | "groups">) {
  const dates = [...new Set(impact.groups.map((g) => g.date))].join(", ");
  return {
    refused: true,
    needsDecisions: true,
    error: `This would affect ${plural(impact.reservations, "booking")} (${plural(impact.covers, "cover")}) on ${dates}, and each one needs a decision (cancel, move or keep). ${AVAILABILITY_PAGE} Nothing was changed.`,
  };
}

/** A refused or failed closure call, in words the model can pass on. `unsure` is the non-API failure. */
function closureFailure(err: unknown, unsure: string) {
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
      return { ...base, error: `${refusal.detail} Nothing was changed.` };
  }
}

// ── Saving ──────────────────────────────────────────────────

/**
 * Saves `rule` only when it touches no booking. The impact is read here, in the
 * confirmed call, so a booking made after the user confirmed still refuses; a
 * failed or unreadable check never falls through to the save. The save sends no
 * decisions, so the server also refuses a booking that lands in between.
 */
async function saveIfNoBookings(
  api: ApiClient,
  venueId: string,
  rule: DateRule,
  expectedVersion: number
): Promise<{ saved: true } | Record<string, unknown>> {
  let impact: Impact;
  try {
    impact = await api.availability.getClosureImpact(venueId, rule);
  } catch (err) {
    return closureFailure(err, CHECK_FAILED);
  }
  if (typeof impact?.reservations !== "number" || !Array.isArray(impact.groups)) {
    return { error: CHECK_FAILED };
  }
  if (impact.reservations > 0 || impact.groups.length > 0) return affectedResult(impact);
  try {
    await api.availability.createClosure(
      venueId,
      { expectedVersion, rule, decisions: [] },
      randomUUID()
    );
    return { saved: true };
  } catch (err) {
    return closureFailure(err, SAVE_UNSURE);
  }
}

// ── Special hours ───────────────────────────────────────────

const HOURS_ORDER =
  "The last seating must fall between opening and closing, and closing must be after opening.";

function hasSpecialHours(config: AvailabilityConfig, date: string): boolean {
  return config.dateRules.some(
    (r) => r.kind === "special_hours" && r.seriesId == null && coversDate(r, date)
  );
}

interface HoursInput {
  readonly opensAt: string;
  readonly lastSeating: string;
  readonly closesAt: string;
}

/** The hours on the venue's two-day minute scale: a time before opening belongs to the night that began the day before. */
function hoursMinutes(input: HoursInput) {
  const opensAt = clockToMinute(input.opensAt);
  const closesAt = clockToMinute(input.closesAt);
  const last = clockToMinute(input.lastSeating);
  const closes = closesAt <= opensAt ? closesAt + MINUTES_IN_DAY : closesAt;
  const lastSeatingAt = last < opensAt ? last + MINUTES_IN_DAY : last;
  return { opensAt, lastSeatingAt, closesAt: closes };
}

/** The day's regular services (from its schedule) with `serviceId`'s hours replaced. */
async function specialServices(
  api: ApiClient,
  venueId: string,
  config: AvailabilityConfig,
  date: string,
  serviceId: string,
  hours: ReturnType<typeof hoursMinutes>
): Promise<{ services: SpecialHoursService[] } | { error: string }> {
  const days = await api.availability.listDays(venueId, { from: date, to: date });
  const scheduleId = days.find((d) => d.serviceDate === date)?.scheduleId;
  if (!scheduleId) return { error: NO_REGULAR_HOURS };
  const live = new Set(config.venueServices.filter((s) => !s.archivedAt).map((s) => s.id));
  const rows = config.scheduleServices.filter(
    (row) => row.scheduleId === scheduleId && live.has(row.venueServiceId)
  );
  if (!rows.some((row) => row.venueServiceId === serviceId)) {
    return {
      error: `${serviceName(config, serviceId)} isn't one of the regular services on ${date}, so there is nothing to base its special hours on. ${AVAILABILITY_PAGE}`,
    };
  }
  return {
    services: rows.map((row) => ({
      venueServiceId: row.venueServiceId,
      opensAt: row.venueServiceId === serviceId ? hours.opensAt : row.opensAt,
      lastSeatingAt: row.venueServiceId === serviceId ? hours.lastSeatingAt : row.lastSeatingAt,
      closesAt: row.venueServiceId === serviceId ? hours.closesAt : row.closesAt,
      seating: row.seating,
      bookingTypes: [...row.bookingTypes],
    })),
  };
}

// ── Listing and reopening ───────────────────────────────────

function describeRule(rule: DatedRule, config: AvailabilityConfig, cancelled: number | undefined) {
  const repeats = rule.repeat ? { repeatsOn: rule.repeat.weekdays.map((d) => WEEKDAYS[d]) } : {};
  if (rule.kind === "special_hours") {
    return {
      type: "special hours",
      ...spanOf(rule),
      ...repeats,
      hours: rule.payload.services.map((s) => ({
        service: serviceName(config, s.venueServiceId),
        opensAt: minuteToClock(s.opensAt),
        lastSeating: minuteToClock(s.lastSeatingAt),
        closesAt: minuteToClock(s.closesAt),
      })),
    };
  }
  return {
    type: "closed",
    ...spanOf(rule),
    ...repeats,
    scope: scopeOf(rule, config),
    ...(rule.window ? { fromTime: minuteToClock(rule.window.from) } : {}),
    ...(cancelled ? { cancelledGuests: cancelled } : {}),
  };
}

const isDated = (rule: DateRule): rule is DatedRule =>
  rule.kind === "closure" || rule.kind === "special_hours";

/** The one closure or special-hours rule covering `date`, optionally narrowed to a service. */
function findCovering(
  config: AvailabilityConfig,
  date: string,
  service: string | undefined
): { rule: DatedRule } | { error: string } {
  let covering = config.dateRules.filter(isDated).filter((r) => coversDate(r, date));
  if (service) {
    const resolved = resolveService(config, service);
    if ("error" in resolved) return resolved;
    covering = covering.filter((r) => r.venueServiceId === resolved.id);
  }
  if (covering.length === 0) {
    return {
      error: `No closure or special hours cover ${date}. Check list_closures for what is set.`,
    };
  }
  if (covering.length > 1) {
    const options = covering
      .map((r) => `${r.kind === "closure" ? "closed" : "special hours"}: ${scopeOf(r, config)}`)
      .join("; ");
    return {
      error: `More than one closure covers ${date}. Ask which, then pass its service. They are: ${options}.`,
    };
  }
  return { rule: covering[0]! };
}

const DateField = z.string().min(1).describe("Venue-local date as YYYY-MM-DD");

export function createClosureTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  {
    venueId,
    timeZone,
  }: { readonly venueId?: string | undefined; readonly timeZone?: string | undefined }
): ToolSet {
  return {
    // ── Read ───────────────────────────────────────────────
    list_closures: tool({
      description:
        "List the venue's closures and special hours from today on: their dates, what is closed, the hours, and how many guests a closure cancelled. Call it before reopen_closure.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "list_closures tool called");
        try {
          const [state, counts] = await Promise.all([
            api.availability.getConfig(venueId),
            // The counts are extra: a failed read must not hide the closures.
            api.availability.listClosures(venueId).catch((err: unknown) => {
              log.error({ err, venueId }, "list_closures counts failed");
              return [];
            }),
          ]);
          const today = todayIn(timeZone);
          const closures = state.config.dateRules
            .filter(isDated)
            .filter((r) => r.endsOn == null || r.endsOn >= today)
            .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
            .map((r) =>
              describeRule(r, state.config, counts.find((c) => c.ruleId === r.id)?.cancelled)
            );
          return { closures };
        } catch (err) {
          log.error({ err, venueId }, "list_closures failed");
          return { error: "Couldn't read the closures. Ask the user to try again." };
        }
      },
    }),

    // ── Write (each runs only after the user confirms) ─────
    close_dates: tool({
      description:
        "Close the whole venue, or one service, on a date or a run of dates after tonight. Requires confirmation. It saves only when no booking is affected; otherwise it refuses and the user finishes it on the Availability page. For tonight use change_tonight_availability.",
      inputSchema: z.object({
        date: DateField.describe("First date to close, as YYYY-MM-DD"),
        endDate: DateField.optional().describe("Last date to close; omit for a single date"),
        service: z
          .string()
          .min(1)
          .optional()
          .describe("The one service to close, by name; omit to close the whole venue"),
      }),
      execute: async ({ date, endDate, service }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "close_dates tool called");
        try {
          const span = checkSpan(date, endDate, todayIn(timeZone));
          if ("error" in span) return span;
          const state = await api.availability.getConfig(venueId);
          const target = service ? resolveService(state.config, service) : undefined;
          if (target && "error" in target) return target;
          const rule: ClosureRule = {
            id: randomUUID(),
            kind: "closure",
            targetKind: target ? "service" : "venue",
            ...(target ? { venueServiceId: target.id } : {}),
            startsOn: span.from,
            endsOn: span.to,
            window: null,
          };
          const outcome = await saveIfNoBookings(api, venueId, rule, state.version);
          if (!("saved" in outcome)) return outcome;
          return {
            saved: true,
            ...spanOf(rule),
            scope: scopeOf(rule, state.config),
            note: "No booking was affected, so no guest was told.",
          };
        } catch (err) {
          log.error({ err, venueId }, "close_dates failed");
          return closureFailure(err, "Couldn't close the dates right now. Nothing was changed.");
        }
      },
    }),

    set_special_hours: tool({
      description:
        "Set one service's hours on a single date after tonight; the day's other services keep their regular hours and each service's seating pattern stays as it is. Requires confirmation. It saves only when no booking is affected; otherwise it refuses and the user finishes it on the Availability page. A date that already has special hours must be reopened first with reopen_closure.",
      inputSchema: z.object({
        date: DateField.describe("The date, as YYYY-MM-DD"),
        service: z.string().min(1).describe("The service whose hours change, by name"),
        opensAt: ClockSchema.describe("Opening time, HH:MM venue-local"),
        lastSeating: ClockSchema.describe("Last seating, HH:MM venue-local"),
        closesAt: ClockSchema.describe("Closing time, HH:MM venue-local; after midnight is fine"),
      }),
      execute: async ({ date, service, ...times }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "set_special_hours tool called");
        try {
          const span = checkSpan(date, undefined, todayIn(timeZone));
          if ("error" in span) return span;
          const hours = hoursMinutes(times);
          if (hours.lastSeatingAt < hours.opensAt || hours.lastSeatingAt > hours.closesAt) {
            return { error: HOURS_ORDER };
          }
          const state = await api.availability.getConfig(venueId);
          if (hasSpecialHours(state.config, span.from)) {
            return {
              error: `${span.from} already has special hours. Reopen them first with reopen_closure, then set the new hours.`,
            };
          }
          const target = resolveService(state.config, service);
          if ("error" in target) return target;
          const built = await specialServices(
            api,
            venueId,
            state.config,
            span.from,
            target.id,
            hours
          );
          if ("error" in built) return built;
          const rule: SpecialHoursRule = {
            id: randomUUID(),
            kind: "special_hours",
            targetKind: "venue",
            startsOn: span.from,
            endsOn: span.from,
            payload: { version: 1, services: built.services },
          };
          const outcome = await saveIfNoBookings(api, venueId, rule, state.version);
          if (!("saved" in outcome)) return outcome;
          return {
            saved: true,
            date: span.from,
            service: serviceName(state.config, target.id),
            ...times,
          };
        } catch (err) {
          log.error({ err, venueId }, "set_special_hours failed");
          return closureFailure(err, "Couldn't set the hours right now. Nothing was changed.");
        }
      },
    }),

    reopen_closure: tool({
      description:
        "Reopen a closure or remove special hours, found by a date it covers (and its service when several apply), so its slots return. Guests it already cancelled stay cancelled. Requires confirmation. Call list_closures first; if the closure cancelled guests, ask the user whether to tell them.",
      inputSchema: z.object({
        date: DateField.describe("A date the closure or special hours cover, as YYYY-MM-DD"),
        service: z
          .string()
          .min(1)
          .optional()
          .describe("When several cover the date: the service the closure is for, by name"),
        tellCancelledGuests: z
          .boolean()
          .describe("Whether to tell the guests the closure cancelled that it has reopened"),
      }),
      execute: async ({ date, service, tellCancelledGuests }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "reopen_closure tool called");
        try {
          if (dayNumber(date) === undefined) return { error: UNREADABLE_DATE };
          const state = await api.availability.getConfig(venueId);
          const found = findCovering(state.config, date.trim(), service);
          if ("error" in found) return found;
          await api.availability.reopenClosure(venueId, found.rule.id, tellCancelledGuests);
          return { reopened: true, ...spanOf(found.rule), tellCancelledGuests };
        } catch (err) {
          log.error({ err, venueId }, "reopen_closure failed");
          return closureFailure(err, "Couldn't reopen it right now. Nothing was changed.");
        }
      },
    }),
  };
}
