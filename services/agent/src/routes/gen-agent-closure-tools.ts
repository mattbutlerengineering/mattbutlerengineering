import { randomUUID } from "node:crypto";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { AvailabilityConfig, DateRule, SpecialHoursService } from "@mbe/types";
import {
  AVAILABILITY_PAGE,
  ClockSchema,
  minuteToClock,
  resolveService,
} from "./gen-agent-availability-tools.js";
import {
  CHECK_FAILED,
  NO_REGULAR_HOURS,
  SAVE_UNSURE,
  SCOPES,
  UNREADABLE_DATE,
  UNTIL_REOPENED,
  WEEKDAYS,
  affectedResult,
  checkHours,
  checkSpan,
  closureFailure,
  closureOnDay,
  dayNumber,
  findCoveringClosure,
  findReopenable,
  hasSpecialHours,
  isDated,
  scopeNeedsService,
  scopeOf,
  serviceName,
  spanOf,
  spanText,
  type ClosureRule,
  type DatedRule,
  type Impact,
  type SpecialHoursRule,
} from "./gen-agent-closure-support.js";
import { NO_VENUE, todayIn, type ApiClient } from "./gen-tool-support.js";

/**
 * Chat tools for closures and special hours on dates after tonight (#7929):
 * close the venue or one service, set a date's hours, list what is set, and
 * reopen a plain closure. A change that would touch existing bookings is never
 * saved here: each booking needs its own decision (cancel, move or keep), which
 * stays on the Availability page. So do regular schedules, service hours,
 * special hours' removal and repeating closures.
 */

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

/** The day's regular services (from its schedule) with `serviceId`'s hours replaced. */
async function specialServices(
  api: ApiClient,
  venueId: string,
  config: AvailabilityConfig,
  date: string,
  serviceId: string,
  hours: { opensAt: number; lastSeatingAt: number; closesAt: number }
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
      ...(row.venueServiceId === serviceId
        ? hours
        : { opensAt: row.opensAt, lastSeatingAt: row.lastSeatingAt, closesAt: row.closesAt }),
      seating: row.seating,
      bookingTypes: [...row.bookingTypes],
    })),
  };
}

// ── Listing ─────────────────────────────────────────────────

/** `cancelled` is undefined when the counts could not be read: unknown is never shown as zero. */
function describeRule(rule: DatedRule, config: AvailabilityConfig, cancelled: number | undefined) {
  const repeats = rule.repeat ? { repeatsOn: rule.repeat.weekdays.map((d) => WEEKDAYS[d]) } : {};
  const guests = cancelled === undefined ? {} : { cancelledGuests: cancelled };
  if (rule.kind === "special_hours") {
    return {
      type: "special hours",
      ...spanOf(rule),
      ...repeats,
      ...guests,
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
    ...guests,
  };
}

const DateField = z.string().min(1).describe("Venue-local date as YYYY-MM-DD");
const ScopeField = z
  .enum(SCOPES)
  .describe("whole_venue closes everything; service closes only the service named in service");
const ServiceField = z
  .string()
  .min(1)
  .optional()
  .describe("The service's name, only when scope is service");

type ToolContext = {
  readonly log: FastifyBaseLogger;
  readonly api: ApiClient;
  readonly venueId: string | undefined;
  readonly timeZone: string | undefined;
};

function closeDates({ log, api, venueId, timeZone }: ToolContext) {
  return tool({
    description:
      "Close the whole venue (scope whole_venue) or one service (scope service, with its name) on a date or a run of dates after tonight. Requires confirmation; only use whole_venue when the user asked to close the whole venue. It saves only when no booking is affected; otherwise it refuses and the user finishes it on the Availability page. For tonight use change_tonight_availability.",
    inputSchema: z
      .object({
        scope: ScopeField,
        service: ServiceField,
        date: DateField.describe("First date to close, as YYYY-MM-DD; after today"),
        endDate: DateField.optional().describe("Last date to close; omit for a single date"),
      })
      .superRefine(scopeNeedsService),
    execute: async ({ scope, service, date, endDate }) => {
      if (!venueId) return NO_VENUE;
      log.info({ venueId, scope }, "close_dates tool called");
      try {
        const span = checkSpan(date, endDate, todayIn(timeZone));
        if ("error" in span) return span;
        const state = await api.availability.getConfig(venueId);
        const target = scope === "service" ? resolveService(state.config, service!) : undefined;
        if (target && "error" in target) return target;
        const same = findCoveringClosure(
          state.config,
          { serviceId: target?.id },
          span.from,
          span.to
        );
        if (same) {
          return {
            error: `This is already closed (${scopeOf(same, state.config)} ${spanText(same)}), which covers those dates. Nothing was changed.`,
          };
        }
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
          to: span.to,
          scope: scopeOf(rule, state.config),
          note: "No booking was affected, so no guest was told.",
        };
      } catch (err) {
        log.error({ err, venueId }, "close_dates failed");
        return closureFailure(err, "Couldn't close the dates right now. Nothing was changed.");
      }
    },
  });
}

function setSpecialHours({ log, api, venueId, timeZone }: ToolContext) {
  return tool({
    description:
      "Set one service's hours on a single date after tonight; the day's other services keep their regular hours and each service's seating pattern stays as it is. Requires confirmation. It saves only when no booking is affected; otherwise it refuses and the user finishes it on the Availability page. A date that already has special hours, or a closure of that service, is changed on the Availability page. For tonight use change_tonight_availability.",
    inputSchema: z.object({
      date: DateField.describe("The date, as YYYY-MM-DD; after today"),
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
        const hours = checkHours(times);
        if ("error" in hours) return hours;
        const state = await api.availability.getConfig(venueId);
        if (hasSpecialHours(state.config, span.from)) {
          return {
            error: `${span.from} already has special hours. Change or remove them on the Availability page.`,
          };
        }
        const target = resolveService(state.config, service);
        if ("error" in target) return target;
        const closed = closureOnDay(state.config, target.id, span.from);
        if (closed) {
          return {
            error: `${serviceName(state.config, target.id)} is closed on ${span.from} by an existing closure (${scopeOf(closed, state.config)}), so special hours would change nothing guests can see. Change or remove that closure on the Availability page first.`,
          };
        }
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
  });
}

/** The guest note for a finished reopen, in plain words. */
function reopenNote(cancelled: number, told: boolean): string {
  if (cancelled === 0) return "No guest was cancelled by this closure, so nobody was told.";
  return told
    ? `${cancelled} guests the closure cancelled were told it has reopened; they stay cancelled.`
    : `${cancelled} guests the closure cancelled were not told it has reopened; they stay cancelled.`;
}

function reopenClosure({ log, api, venueId }: ToolContext) {
  return tool({
    description: `Reopen a closure of the whole venue or one service so its slots return. Pass the closure's full span exactly as list_closures gives it (to is "${UNTIL_REOPENED}" for one with no end) and its scope; a different span is refused with the real one. Guests it already cancelled stay cancelled. Requires confirmation. Special hours, repeating closures and booking or table pauses are changed on the Availability page. Call list_closures first; if the closure cancelled guests, ask whether to tell them.`,
    inputSchema: z
      .object({
        from: DateField.describe("The closure's first date, as YYYY-MM-DD"),
        to: z
          .string()
          .min(1)
          .describe(
            `The closure's last date as YYYY-MM-DD, or "${UNTIL_REOPENED}" if it has no end`
          ),
        scope: ScopeField,
        service: ServiceField,
        tellCancelledGuests: z
          .boolean()
          .describe("Whether to tell the guests the closure cancelled that it has reopened"),
      })
      .superRefine(scopeNeedsService),
    execute: async ({ from, to, scope, service, tellCancelledGuests }) => {
      if (!venueId) return NO_VENUE;
      log.info({ venueId, scope }, "reopen_closure tool called");
      const start = dayNumber(from);
      const end = to.trim() === UNTIL_REOPENED ? null : dayNumber(to);
      if (start === undefined || end === undefined) return { error: UNREADABLE_DATE };
      if (end !== null && end < start) {
        return { error: `The last date (${to}) is before the first (${from}).` };
      }
      let rule: ClosureRule;
      let scopeText: string;
      let cancelled: number;
      try {
        const state = await api.availability.getConfig(venueId);
        const target = scope === "service" ? resolveService(state.config, service!) : undefined;
        if (target && "error" in target) return target;
        const found = findReopenable(state.config, {
          from: from.trim(),
          to: end === null ? null : to.trim(),
          scope,
          serviceId: target?.id,
        });
        if ("error" in found) return { refused: true, ...found };
        rule = found.rule;
        scopeText = scopeOf(rule, state.config);
        const counts = await api.availability.listClosures(venueId).catch((err: unknown) => {
          log.error({ err, venueId }, "reopen_closure counts failed");
          return undefined;
        });
        if (!counts) {
          return {
            error:
              "Couldn't read how many guests this closure cancelled, so it can't decide whether to tell them. Nothing was changed. Ask the user to try again shortly.",
          };
        }
        cancelled = counts.find((c) => c.ruleId === rule.id)?.cancelled ?? 0;
      } catch (err) {
        log.error({ err, venueId }, "reopen_closure failed to read");
        return closureFailure(err, "Couldn't read the closures. Nothing was changed.");
      }
      const told = tellCancelledGuests && cancelled > 0;
      try {
        await api.availability.reopenClosure(venueId, rule.id, told);
      } catch (err) {
        log.error({ err, venueId }, "reopen_closure failed");
        return closureFailure(err, SAVE_UNSURE);
      }
      return {
        reopened: true,
        ...spanOf(rule),
        scope: scopeText,
        guestsCancelled: cancelled,
        guestsTold: told,
        note: reopenNote(cancelled, told),
      };
    },
  });
}

function listClosures({ log, api, venueId, timeZone }: ToolContext) {
  return tool({
    description:
      "List the venue's closures and special hours from today on: their dates, what is closed, the hours, and how many guests each cancelled (cancelledGuests; countsUnavailable means the counts could not be read, so do not assume zero). Call it before reopen_closure.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!venueId) return NO_VENUE;
      log.info({ venueId }, "list_closures tool called");
      try {
        const [state, counts] = await Promise.all([
          api.availability.getConfig(venueId),
          // The closures are still worth showing, but without counts: never as zero.
          api.availability.listClosures(venueId).catch((err: unknown) => {
            log.error({ err, venueId }, "list_closures counts failed");
            return undefined;
          }),
        ]);
        const today = todayIn(timeZone);
        const closures = state.config.dateRules
          .filter(isDated)
          .filter((r) => r.endsOn == null || r.endsOn >= today)
          .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
          .map((r) =>
            describeRule(
              r,
              state.config,
              counts ? (counts.find((c) => c.ruleId === r.id)?.cancelled ?? 0) : undefined
            )
          );
        return { closures, ...(counts ? {} : { countsUnavailable: true }) };
      } catch (err) {
        log.error({ err, venueId }, "list_closures failed");
        return { error: "Couldn't read the closures. Ask the user to try again." };
      }
    },
  });
}

export function createClosureTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  {
    venueId,
    timeZone,
  }: { readonly venueId?: string | undefined; readonly timeZone?: string | undefined }
): ToolSet {
  const context: ToolContext = { log, api, venueId, timeZone };
  return {
    list_closures: listClosures(context),
    close_dates: closeDates(context),
    set_special_hours: setSpecialHours(context),
    reopen_closure: reopenClosure(context),
  };
}
