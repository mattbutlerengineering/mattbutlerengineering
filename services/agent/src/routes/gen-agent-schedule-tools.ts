import { randomUUID } from "node:crypto";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { AvailabilityConfig, ScheduleService } from "@mbe/types";
import { AVAILABILITY_PAGE, ClockSchema, resolveService } from "./gen-agent-availability-tools.js";
import { saveIfNoBookings } from "./gen-agent-closure-tools.js";
import {
  SCOPES,
  WEEKDAYS,
  checkHours,
  checkSpan,
  closureFailure,
  dayNumber,
  scopeNeedsService,
  scopeOf,
  type ClosureRule,
} from "./gen-agent-closure-support.js";
import {
  NO_VENUE,
  failedBeforeWrite,
  failureLog,
  notExecuted,
  refusalOf,
  todayIn,
  type ApiClient,
} from "./gen-tool-support.js";

/**
 * Chat tools for repeating closures ("close every Monday in January") and a
 * service's regular hours. Like the closure tools, neither saves a change that
 * would touch an existing booking: those need a decision per booking, which
 * stays on the Availability page. Each input is flat, so what the confirm bar
 * shows is what runs.
 */

const MS_PER_DAY = 86_400_000;
const HOURS_UNSURE =
  "Couldn't confirm the new hours were saved. Check the Availability page before trying again.";

const WeekdayField = z.enum(WEEKDAYS as [string, ...string[]]);

type ToolContext = {
  readonly log: FastifyBaseLogger;
  readonly api: ApiClient;
  readonly venueId: string | undefined;
  readonly timeZone: string | undefined;
};

/** `Monday`, `Monday and Wednesday`, `Monday, Wednesday and Friday`. */
function listDays(days: readonly string[]): string {
  if (days.length < 2) return days.join("");
  return `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
}

/** Weekday names as indexes (Sunday is 0), deduplicated and in week order. */
function weekdayIndexes(names: readonly string[]): number[] {
  return [...new Set(names.map((name) => WEEKDAYS.indexOf(name)))].sort((a, b) => a - b);
}

/** Whether any date from `from` to `to` falls on one of `weekdays`. */
function runsInSpan(weekdays: readonly number[], from: string, to: string): boolean {
  const first = dayNumber(from)!; // `checkSpan` read both
  const last = dayNumber(to)!;
  for (let day = first; day <= last && day < first + 7; day += 1) {
    if (weekdays.includes(new Date(day * MS_PER_DAY).getUTCDay())) return true;
  }
  return false;
}

function closeRepeating({ log, api, venueId, timeZone }: ToolContext) {
  return tool({
    description:
      "Close the whole venue (scope whole_venue) or one service (scope service, with its name) on chosen weekdays between two dates after tonight, such as every Monday from 5 Jan to 26 Jan. Requires confirmation; only use whole_venue when the user asked to close the whole venue. It saves only when no booking is affected; otherwise it refuses and the user finishes it on the Availability page. A repeating closure can't be reopened from chat. For one date or an unbroken run of dates use close_dates; for tonight use change_tonight_availability.",
    inputSchema: z
      .object({
        scope: z
          .enum(SCOPES)
          .describe("whole_venue closes everything; service closes only the service named"),
        service: z
          .string()
          .min(1)
          .optional()
          .describe("The service's name, only for scope service"),
        weekdays: z
          .array(WeekdayField)
          .min(1)
          .describe('English weekday names to close, e.g. ["Monday"]'),
        from: z.string().min(1).describe("First date of the run, YYYY-MM-DD; after today"),
        to: z.string().min(1).describe("Last date of the run, YYYY-MM-DD"),
      })
      .superRefine(scopeNeedsService),
    execute: async ({ scope, service, weekdays, from, to }) => {
      if (!venueId) return notExecuted(NO_VENUE);
      log.info({ venueId, scope }, "close_repeating_days tool called");
      try {
        const span = checkSpan(from, to, todayIn(timeZone));
        if ("error" in span) return notExecuted(span);
        const days = weekdayIndexes(weekdays);
        if (!runsInSpan(days, span.from, span.to)) {
          return notExecuted({
            error: `No ${listDays(days.map((d) => WEEKDAYS[d]!))} falls between ${span.from} and ${span.to}, so nothing would close. Nothing was changed.`,
          });
        }
        const state = await api.availability.getConfig(venueId);
        const target = scope === "service" ? resolveService(state.config, service!) : undefined;
        if (target && "error" in target) return notExecuted(target);
        const rule: ClosureRule = {
          id: randomUUID(),
          kind: "closure",
          targetKind: target ? "service" : "venue",
          ...(target ? { venueServiceId: target.id } : {}),
          startsOn: span.from,
          endsOn: span.to,
          repeat: { version: 1, weekdays: days },
          window: null,
        };
        const outcome = await saveIfNoBookings(api, venueId, rule, state.version);
        if (!("saved" in outcome)) return outcome;
        const names = listDays(days.map((d) => WEEKDAYS[d]!));
        return {
          saved: true,
          scope: scopeOf(rule, state.config),
          summary: `Closed every ${names} from ${span.from} to ${span.to}`,
          note: "No booking was affected, so no guest was told.",
        };
      } catch (err) {
        log.error({ ...failureLog(err), venueId }, "close_repeating_days failed");
        // The save's own failures are caught in saveIfNoBookings: anything thrown here was a read.
        return notExecuted(
          closureFailure(err, "Couldn't close those days right now. Nothing was changed.")
        );
      }
    },
  });
}

/** The regular schedule's row for a service, with the schedule it sits on. */
function regularRow(config: AvailabilityConfig, serviceId: string): ScheduleService | undefined {
  const regular = config.schedules.find((s) => s.isRegular && !s.archivedAt);
  return config.scheduleServices.find(
    (row) => row.scheduleId === regular?.id && row.venueServiceId === serviceId
  );
}

type Hours = { opensAt: number; lastSeatingAt: number; closesAt: number };

const sameHours = (row: Hours, hours: Hours): boolean =>
  row.opensAt === hours.opensAt &&
  row.lastSeatingAt === hours.lastSeatingAt &&
  row.closesAt === hours.closesAt;

/**
 * The row with `hours` applied: to every day it runs (no weekdays), or to just
 * `days` as one day set. A service already varied by day is left to the page.
 */
function withHours(
  row: ScheduleService,
  hours: Hours,
  days: number[] | undefined
): { row: ScheduleService } | { error: string } {
  if (row.dayHours.sets.length > 0) {
    return {
      error: `This service already has different hours on some days. ${AVAILABILITY_PAGE} Nothing was changed.`,
    };
  }
  const outside = (days ?? []).filter((d) => row.weekdays.length > 0 && !row.weekdays.includes(d));
  if (outside.length > 0) {
    return {
      error: `This service doesn't run on ${listDays(outside.map((d) => WEEKDAYS[d]!))}. Nothing was changed.`,
    };
  }
  if (!days || days.length === 7) return { row: { ...row, ...hours } };
  const set = {
    weekdays: days,
    ...hours,
    seating: row.seating,
    bookingTypes: row.bookingTypes,
  };
  return { row: { ...row, dayHours: { version: 1, sets: [set] } } };
}

/** A refused hours save, in words the model can pass on. */
function hoursFailure(err: unknown) {
  if (refusalOf(err)?.code === "stranded-bookings") {
    return {
      refused: true,
      needsDecisions: true,
      code: "stranded-bookings",
      error: `This would affect existing bookings, and each one needs a decision (cancel, move or keep). ${AVAILABILITY_PAGE} Nothing was changed.`,
    };
  }
  return closureFailure(err, HOURS_UNSURE);
}

function setRegularHours({ log, api, venueId }: ToolContext) {
  return tool({
    description:
      "Change one service's regular opening hours, for every day it runs or for chosen weekdays only. Requires confirmation. It saves only when no existing booking is affected; otherwise it refuses and the user finishes it on the Availability page. A service that already has different hours on some days, adding or removing a service, and the seating pattern are changed on the Availability page. For one date use set_special_hours; for tonight use change_tonight_availability.",
    inputSchema: z.object({
      service: z.string().min(1).describe("The service whose hours change, by name"),
      weekdays: z
        .array(WeekdayField)
        .min(1)
        .optional()
        .describe("English weekday names the new hours apply to; omit for every day it runs"),
      opensAt: ClockSchema.describe("Opening time, HH:MM venue-local"),
      lastSeating: ClockSchema.describe("Last seating, HH:MM venue-local"),
      closesAt: ClockSchema.describe("Closing time, HH:MM venue-local; after midnight is fine"),
    }),
    execute: async ({ service, weekdays, ...times }) => {
      if (!venueId) return notExecuted(NO_VENUE);
      log.info({ venueId }, "set_regular_hours tool called");
      let unsure: string | undefined;
      try {
        const hours = checkHours(times);
        if ("error" in hours) return notExecuted(hours);
        const state = await api.availability.getConfig(venueId);
        const target = resolveService(state.config, service);
        if ("error" in target) return notExecuted(target);
        const current = regularRow(state.config, target.id);
        if (!current) {
          return notExecuted({
            error: `${service} isn't on the regular schedule. ${AVAILABILITY_PAGE}`,
          });
        }
        if (!weekdays && sameHours(current, hours) && current.dayHours.sets.length === 0) {
          return notExecuted({ error: `${service} already has those hours. Nothing was changed.` });
        }
        const days = weekdays ? weekdayIndexes(weekdays) : undefined;
        const built = withHours(current, hours, days);
        if ("error" in built) return notExecuted(built);
        unsure = HOURS_UNSURE;
        await api.availability.saveConfig(venueId, {
          expectedVersion: state.version,
          changes: { upsert: { scheduleServices: [built.row] }, remove: {} },
          scopeConflicts: "keep",
        });
        return {
          saved: true,
          service,
          ...(weekdays ? { weekdays } : {}),
          ...times,
          note: "No booking was affected, so no guest was told.",
        };
      } catch (err) {
        log.error({ ...failureLog(err), venueId }, "set_regular_hours failed");
        return failedBeforeWrite(unsure, hoursFailure(err));
      }
    },
  });
}

export function createScheduleTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  {
    venueId,
    timeZone,
  }: { readonly venueId?: string | undefined; readonly timeZone?: string | undefined }
): ToolSet {
  const context: ToolContext = { log, api, venueId, timeZone };
  return {
    close_repeating_days: closeRepeating(context),
    set_regular_hours: setRegularHours(context),
  };
}
