import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { NO_VENUE, localTimeIn, refusalOf, todayIn, type ApiClient } from "./gen-tool-support.js";

/**
 * Chat tool for the Briefing page (#7973): the day's pending and confirmed
 * seatings with what staff need to know about each guest. Read only; contact
 * details are left out of the result.
 */

type BriefingEntry = Awaited<ReturnType<ApiClient["briefing"]["list"]>>[number];

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

/** A failed briefing read: never shaped like an empty briefing. */
function readFailure(err: unknown) {
  const refusal = refusalOf(err);
  if (!refusal) {
    return {
      unknown: true,
      error:
        "Couldn't read the briefing right now. Tell the user you couldn't check and to try again shortly; do not say there are no bookings.",
    } as const;
  }
  return refusal.status === 403
    ? ({ refused: true, error: "The user doesn't have permission to see the briefing." } as const)
    : ({ refused: true, error: refusal.detail } as const);
}

export function createBriefingTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId, timeZone }: { readonly venueId?: string | undefined; readonly timeZone?: string }
): ToolSet {
  return {
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
          return readFailure(err);
        }
      },
    }),
  };
}
