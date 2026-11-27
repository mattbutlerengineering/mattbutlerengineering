import { randomUUID } from "node:crypto";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { GUEST_MESSAGE_MAX_LENGTH } from "@mbe/types";
import type { AvailabilityConfig } from "@mbe/types";
import { saveIfNoBookings } from "./gen-agent-closure-tools.js";
import {
  SAVE_UNSURE,
  UNTIL_REOPENED,
  childrenOf,
  closureFailure,
  dayNumber,
  spanText,
  type ClosureRule,
} from "./gen-agent-closure-support.js";
import {
  NO_REPLAY,
  NO_VENUE,
  failureLog,
  notExecuted,
  resolveTable,
  todayIn,
  type ApiClient,
} from "./gen-tool-support.js";

/**
 * Chat tools for booking pauses and table pauses (#9479). A pause starts today and
 * runs until a date or until it is resumed. Resuming is the undo: it reopens the
 * pause's own closure, the same call the Availability page's Resume makes.
 */

const TABLES_LIMIT = 100;

export const UntilField = z
  .string()
  .min(1)
  .describe(
    `The last date paused as YYYY-MM-DD (today or later), or "${UNTIL_REOPENED}" for no end`
  );

type ToolContext = {
  readonly log: FastifyBaseLogger;
  readonly api: ApiClient;
  readonly venueId: string | undefined;
  readonly timeZone: string | undefined;
};

const closureRules = (config: AvailabilityConfig, today: string): ClosureRule[] =>
  config.dateRules.filter(
    (r): r is ClosureRule =>
      r.kind === "closure" && !r.seriesId && (r.endsOn == null || r.endsOn >= today)
  );

/** The pause the Pause dialog or `pause_online_booking` made, still in force. */
const onlinePauses = (config: AvailabilityConfig, today: string): ClosureRule[] =>
  closureRules(config, today).filter(
    (r) =>
      r.targetKind === "booking" &&
      r.origin === "pause" &&
      (r.bookingTypes ?? []).includes("online")
  );

/** `endsOn` of a pause: null when it has no end, else a real date that is not in the past. */
export function checkUntil(
  until: string,
  today: string
): { endsOn: string | null } | { error: string } {
  if (until.trim() === UNTIL_REOPENED) return { endsOn: null };
  const end = dayNumber(until);
  if (end === undefined) {
    return {
      error: `The last date can't be read. Use a real date as YYYY-MM-DD, or "${UNTIL_REOPENED}". Nothing was changed.`,
    };
  }
  if (end < dayNumber(today)!) {
    return { error: `${until.trim()} is in the past (today is ${today}). Nothing was changed.` };
  }
  return { endsOn: until.trim() };
}

/** Reopens one pause's closure. It sends the closure as read, so a change in the gap is refused. */
async function resumeRule(
  { log, api, venueId }: ToolContext,
  config: AvailabilityConfig,
  rule: ClosureRule,
  fields: Record<string, unknown>
) {
  try {
    const saved = await api.availability.reopenClosure(venueId!, rule.id, false, NO_REPLAY, {
      rule,
      children: childrenOf(config, rule.id),
    });
    if (saved.stillClosed?.everyDate) {
      return {
        resumed: false,
        pauseRemoved: true,
        ...fields,
        note: "The pause was removed, but another closure still keeps those dates shut, so nothing can be booked yet.",
      };
    }
    return { resumed: true, ...fields, was: spanText(rule) };
  } catch (err) {
    log.error({ ...failureLog(err), venueId }, "resume pause failed");
    return closureFailure(err, SAVE_UNSURE);
  }
}

function pauseOnlineBooking(ctx: ToolContext) {
  const { log, api, venueId, timeZone } = ctx;
  return tool({
    description:
      "Pause ONLINE booking from today until a date or until it is resumed, so guests can't book on the booking widget; phone and staff bookings and existing bookings are untouched. Optionally add a message guests see. Requires confirmation. To undo, use resume_online_booking. For only the rest of tonight use change_tonight_availability.",
    inputSchema: z.object({
      until: UntilField,
      message: z
        .string()
        .min(1)
        .max(GUEST_MESSAGE_MAX_LENGTH)
        .optional()
        .describe("A short message guests see while booking is paused"),
    }),
    execute: async ({ until, message }) => {
      if (!venueId) return notExecuted(NO_VENUE);
      log.info({ venueId }, "pause_online_booking tool called");
      const today = todayIn(timeZone);
      const end = checkUntil(until, today);
      if ("error" in end) return notExecuted(end);
      try {
        const state = await api.availability.getConfig(venueId);
        const existing = onlinePauses(state.config, today)[0];
        if (existing) {
          return notExecuted({
            error: `Online booking is already paused (${spanText(existing)}). Resume it first to change when it ends. Nothing was changed.`,
          });
        }
        const rule: ClosureRule = {
          id: randomUUID(),
          kind: "closure",
          targetKind: "booking",
          bookingTypes: ["online"],
          origin: "pause",
          startsOn: today,
          endsOn: end.endsOn,
          window: null,
          ...(message ? { guestMessage: message } : {}),
        };
        try {
          await api.availability.createClosure(
            venueId,
            { expectedVersion: state.version, rule, decisions: [] },
            randomUUID()
          );
        } catch (err) {
          log.error({ ...failureLog(err), venueId }, "pause_online_booking save failed");
          return closureFailure(err, SAVE_UNSURE);
        }
        return {
          saved: true,
          from: today,
          until: end.endsOn ?? UNTIL_REOPENED,
          note: "Online booking is paused. Existing bookings are untouched. resume_online_booking undoes it.",
        };
      } catch (err) {
        log.error({ ...failureLog(err), venueId }, "pause_online_booking failed");
        return notExecuted(
          closureFailure(err, "Couldn't pause online booking right now. Nothing was changed.")
        );
      }
    },
  });
}

function resumeOnlineBooking(ctx: ToolContext) {
  const { log, api, venueId, timeZone } = ctx;
  return tool({
    description:
      "Resume online booking: remove the pause so guests can book online again. This undoes pause_online_booking and the Pause button. Requires confirmation. Pauses for only tonight are ended with end_tonight_change.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!venueId) return notExecuted(NO_VENUE);
      log.info({ venueId }, "resume_online_booking tool called");
      try {
        const state = await api.availability.getConfig(venueId);
        const pauses = onlinePauses(state.config, todayIn(timeZone));
        if (pauses.length !== 1) {
          return notExecuted({
            error:
              pauses.length === 0
                ? "Online booking isn't paused by a pause made from the dashboard or chat. Check list_closures; a Tonight pause is ended with end_tonight_change. Nothing was changed."
                : "More than one online pause is in force, so they can't be told apart here. Use the Availability page. Nothing was changed.",
          });
        }
        return await resumeRule(ctx, state.config, pauses[0]!, { booking: "online" });
      } catch (err) {
        log.error({ ...failureLog(err), venueId }, "resume_online_booking failed to read");
        return notExecuted(closureFailure(err, "Couldn't read the pauses. Nothing was changed."));
      }
    },
  });
}

export async function namedTableIds(
  api: ApiClient,
  venueId: string,
  names: readonly string[]
): Promise<{ ids: string[]; names: string[] } | { error: string }> {
  const { data } = await api.tables.list({ venueId, limit: TABLES_LIMIT });
  const found = new Map<string, string>();
  for (const name of names) {
    const resolved = resolveTable(data, name);
    if ("error" in resolved) return { error: `${resolved.error} Nothing was changed.` };
    found.set(resolved.table.id, resolved.table.name ?? resolved.table.tableNumber ?? name);
  }
  return { ids: [...found.keys()], names: [...found.values()] };
}

/** The rule a table pause saves: these tables, whole service days, from `today`. */
export const tablePauseRule = (
  tableIds: readonly string[],
  today: string,
  endsOn: string | null
): ClosureRule => ({
  id: randomUUID(),
  kind: "closure",
  targetKind: "tables",
  tableIds: [...tableIds],
  startsOn: today,
  endsOn,
  window: null,
});

export const TablesField = z
  .array(z.string().min(1))
  .min(1)
  .describe("The tables' names or numbers, as staff call them");

function pauseTables(ctx: ToolContext) {
  const { log, api, venueId, timeZone } = ctx;
  return tool({
    description:
      "Take tables out of booking from today until a date or until resumed (a table pause: nothing can be booked on them). It saves only when no booking sits on those tables; otherwise it refuses and the user finishes it on the Availability page. Requires confirmation. To undo, use resume_tables. For only the rest of tonight use change_tonight_availability.",
    inputSchema: z.object({ tables: TablesField, until: UntilField }),
    execute: async ({ tables, until }) => {
      if (!venueId) return notExecuted(NO_VENUE);
      log.info({ venueId }, "pause_tables tool called");
      const today = todayIn(timeZone);
      const end = checkUntil(until, today);
      if ("error" in end) return notExecuted(end);
      try {
        const named = await namedTableIds(api, venueId, tables);
        if ("error" in named) return notExecuted(named);
        const state = await api.availability.getConfig(venueId);
        const rule = tablePauseRule(named.ids, today, end.endsOn);
        const outcome = await saveIfNoBookings(api, venueId, rule, state.version);
        if (!("saved" in outcome)) return outcome;
        return {
          saved: true,
          tables: named.names,
          from: today,
          until: end.endsOn ?? UNTIL_REOPENED,
        };
      } catch (err) {
        log.error({ ...failureLog(err), venueId }, "pause_tables failed");
        return notExecuted(closureFailure(err, "Couldn't pause the tables. Nothing was changed."));
      }
    },
  });
}

/** The one table pause that holds exactly `tables`, or why there is not exactly one. */
export async function findTablePause(
  api: ApiClient,
  venueId: string,
  tables: readonly string[],
  timeZone: string | undefined
) {
  const named = await namedTableIds(api, venueId, tables);
  if ("error" in named) return named;
  const state = await api.availability.getConfig(venueId);
  const wanted = [...named.ids].sort().join(",");
  const matches = closureRules(state.config, todayIn(timeZone)).filter(
    (r) =>
      r.targetKind === "tables" &&
      !r.sectionId &&
      [...(r.tableIds ?? [])].sort().join(",") === wanted
  );
  if (matches.length !== 1) {
    return {
      error:
        matches.length === 0
          ? "Those tables aren't paused together by a table pause. Check list_closures, and name exactly the tables that were paused. Nothing was changed."
          : "More than one pause holds those tables, so they can't be told apart here. Use the Availability page. Nothing was changed.",
    };
  }
  return { state, named, rule: matches[0]! };
}

function resumeTables(ctx: ToolContext) {
  const { log, api, venueId, timeZone } = ctx;
  return tool({
    description:
      "Put paused tables back into booking: remove the table pause that holds exactly these tables. This undoes pause_tables. Requires confirmation. Section closures and Tonight table blocks are not ended here.",
    inputSchema: z.object({ tables: TablesField }),
    execute: async ({ tables }) => {
      if (!venueId) return notExecuted(NO_VENUE);
      log.info({ venueId }, "resume_tables tool called");
      try {
        const found = await findTablePause(api, venueId, tables, timeZone);
        if ("error" in found) return notExecuted(found);
        const { state, named, rule } = found;
        return await resumeRule(ctx, state.config, rule, { tables: named.names });
      } catch (err) {
        log.error({ ...failureLog(err), venueId }, "resume_tables failed to read");
        return notExecuted(closureFailure(err, "Couldn't read the pauses. Nothing was changed."));
      }
    },
  });
}

export function createPauseTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  {
    venueId,
    timeZone,
  }: { readonly venueId?: string | undefined; readonly timeZone?: string | undefined }
): ToolSet {
  const ctx: ToolContext = { log, api, venueId, timeZone };
  return {
    pause_online_booking: pauseOnlineBooking(ctx),
    resume_online_booking: resumeOnlineBooking(ctx),
    pause_tables: pauseTables(ctx),
    resume_tables: resumeTables(ctx),
  };
}
