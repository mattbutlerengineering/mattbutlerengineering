import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { lastServiceDate } from "@mbe/availability";
import {
  NO_VENUE,
  failureLog,
  localTimeIn,
  readFailure,
  todayIn,
  type ApiClient,
} from "./gen-tool-support.js";

/**
 * Chat tool for the Briefing page (#7973): the day's pending and confirmed
 * seatings with what staff need to know about each guest. Read only; contact
 * details are left out of the result.
 */

type BriefingEntry = Awaited<ReturnType<ApiClient["briefing"]["list"]>>[number];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
/** How many weekday-and-hour slots the chat gets: enough to answer, few enough to read. */
const BUSIEST_LIMIT = 10;

const UNREADABLE_DATE = "The date can't be read. Use a real date as YYYY-MM-DD.";

/** True for a real calendar date written YYYY-MM-DD (2026-02-30 is not one). */
function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function seatingOf(entry: BriefingEntry, timeZone: string | undefined) {
  const { guest } = entry;
  return {
    localTime: localTimeIn(entry.startTime, timeZone) ?? entry.startTime,
    partySize: entry.partySize,
    status: entry.status,
    guestName: entry.guestName ?? guest?.name ?? null,
    table: entry.table?.name ?? entry.table?.tableNumber ?? null,
    occasion: entry.occasion,
    seatingPreference: entry.seatingPreference,
    notes: entry.notes,
    ...(guest
      ? {
          visitCount: guest.visitCount,
          lastVisit: guest.lastVisit,
          dietaryRestrictions: guest.dietaryRestrictions ?? [],
          tags: guest.tags ?? [],
          guestNotes: guest.notes,
          staffNotes: guest.staffNotes.map((n) => n.text),
        }
      : {}),
  };
}

/**
 * The service day "tonight" or "last night" means: the one that last opened, from the venue's own
 * hours. After midnight that is still yesterday's. Throws when the hours or the time zone are
 * unavailable: the caller must report that, never fall back to the calendar day.
 */
async function lastNightOf(
  api: ApiClient,
  venueId: string,
  timeZone: string | undefined
): Promise<string> {
  if (!timeZone) throw new Error("The venue's time zone is unknown");
  const { config } = await api.availability.getConfig(venueId);
  return lastServiceDate({ timezone: timeZone, config }, new Date());
}

export function createBriefingTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId, timeZone }: { readonly venueId?: string | undefined; readonly timeZone?: string }
): ToolSet {
  return {
    get_night_summary: tool({
      description:
        'Read how the night went: covers served, table turns and no-shows for a service date (counts only). Use it for "how did tonight go" and "how was last night". Defaults to today.',
      inputSchema: z.object({
        date: z
          .string()
          .optional()
          .describe(
            "Service date in YYYY-MM-DD format. Omit for the service night that last opened (still last night's after midnight)"
          ),
      }),
      execute: async ({ date }) => {
        if (!venueId) return NO_VENUE;
        if (date !== undefined && !isRealDate(date)) {
          return { rejected: true, error: UNREADABLE_DATE };
        }
        log.info({ venueId, date }, "get_night_summary tool called");
        let day = date ?? "";
        try {
          day = date ?? (await lastNightOf(api, venueId, timeZone));
          const summary = await api.reservations.getEndOfServiceSummary({ venueId, date: day });
          return {
            date: summary.date,
            covers: summary.covers,
            tableTurns: summary.tableTurns,
            noShows: summary.noShows,
            // Null until the Lost Demand Ledger lands; omitted so the model never reports a zero.
            ...(summary.turnedAway === null ? {} : { turnedAway: summary.turnedAway }),
          };
        } catch (err) {
          log.error({ err, venueId, date: day }, "get_night_summary failed");
          return readFailure(err, "the night's numbers", { notEmpty: "the night had no guests" });
        }
      },
    }),
    get_autopilot_suggestions: tool({
      description:
        'Read the moves Autopilot suggests for tonight: reseating a booked party or offering a table to a waiting party, each with a plain reason (at most three). Read only: it suggests, never moves anyone. Use it for "anything I should move tonight?".',
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "get_autopilot_suggestions tool called");
        try {
          const proposals = await api.reservations.getAutopilotProposals({ venueId });
          return {
            date: proposals.date,
            count: proposals.moves.length,
            moves: proposals.moves.map((m) => ({
              party: m.partyLabel ?? `party of ${m.partySize}`,
              partySize: m.partySize,
              from: m.fromTableName,
              to: m.toTableName,
              reason: m.reason,
            })),
          };
        } catch (err) {
          log.error({ venueId, ...failureLog(err) }, "get_autopilot_suggestions failed");
          return readFailure(err, "the Autopilot suggestions");
        }
      },
    }),
    get_turned_away_demand: tool({
      description:
        'Read when guests are turned away: public availability searches that found no slot, counted by weekday and hour (counts only, no guests). Use it for "when are we turning people away". Defaults to the last 28 days.',
      inputSchema: z.object({
        from: z.string().optional().describe("First date, YYYY-MM-DD. Omit for the last 28 days"),
        to: z.string().optional().describe("Last date, YYYY-MM-DD. Omit for today"),
      }),
      execute: async ({ from, to }) => {
        if (!venueId) return NO_VENUE;
        if ((from !== undefined && !isRealDate(from)) || (to !== undefined && !isRealDate(to))) {
          return { rejected: true, error: UNREADABLE_DATE };
        }
        log.info({ venueId, from, to }, "get_turned_away_demand tool called");
        try {
          const demand = await api.reservations.getLostDemand({
            venueId,
            ...(from === undefined ? {} : { from }),
            ...(to === undefined ? {} : { to }),
          });
          return {
            from: demand.from,
            to: demand.to,
            total: demand.total,
            busiest: [...demand.cells]
              .sort((a, b) => b.searches - a.searches || a.weekday - b.weekday || a.hour - b.hour)
              .slice(0, BUSIEST_LIMIT)
              .map((c) => ({
                weekday: WEEKDAYS[c.weekday] ?? "",
                hour: `${String(c.hour).padStart(2, "0")}:00`,
                searches: c.searches,
              })),
            // Searches that named no time: the whole day had no slot. Never placed in an hour.
            noTimeNamed: demand.anyTime.map((a) => ({
              weekday: WEEKDAYS[a.weekday] ?? "",
              searches: a.searches,
            })),
          };
        } catch (err) {
          log.error({ venueId, ...failureLog(err) }, "get_turned_away_demand failed");
          return readFailure(err, "the turned-away numbers", {
            notEmpty: "nobody was turned away",
          });
        }
      },
    }),
    get_briefing: tool({
      description:
        "Read the Briefing page: the day's pending and confirmed seatings in arrival order, with each guest's visits, dietary restrictions, tags and notes. Defaults to today.",
      inputSchema: z.object({
        date: z.string().optional().describe("Date in YYYY-MM-DD format, defaults to today"),
      }),
      execute: async ({ date }) => {
        if (!venueId) return NO_VENUE;
        const day = date ?? todayIn(timeZone);
        if (!isRealDate(day)) return { rejected: true, error: UNREADABLE_DATE };
        log.info({ venueId, date: day }, "get_briefing tool called");
        try {
          const rows = await api.briefing.list({ venueId, date: day });
          const entries = [...rows]
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
            .map((entry) => seatingOf(entry, timeZone));
          return {
            date: day,
            count: entries.length,
            covers: rows.reduce((sum, r) => sum + r.partySize, 0),
            entries,
          };
        } catch (err) {
          log.error({ err, venueId, date: day }, "get_briefing failed");
          return readFailure(err, "the briefing", { notEmpty: "there are no bookings" });
        }
      },
    }),
  };
}
