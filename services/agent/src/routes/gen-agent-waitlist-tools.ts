import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import {
  NO_VENUE,
  localTimeIn,
  refusalOf,
  resolveTable,
  type ApiClient,
} from "./gen-tool-support.js";

/**
 * Chat tools for the waitlist (#7926): list it, add a party, tell a party their
 * table is ready, seat them, take them off. Parties are named the way staff say
 * them (the guest's name), never by id; each write runs only after the user confirms.
 */

/** Parties still on the list; seated, expired and cancelled ones are history. */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["waiting", "notified"]);
/** The reservations API's page-size ceiling; a venue's tables fit in one page. */
const TABLES_LIMIT = 100;

type WaitlistEntry = Awaited<ReturnType<ApiClient["waitlist"]["list"]>>[number];

const PartySchema = {
  guestName: z.string().min(1).describe("The party's name, as it is on the waitlist"),
  partySize: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Only when two waiting parties share the name: this party's size"),
};

/** A refused or failed waitlist write, in words the model can pass on. */
function waitlistFailure(err: unknown, action: string) {
  const refusal = refusalOf(err);
  if (!refusal) {
    return {
      error: `Couldn't ${action} right now. Nothing was changed. Ask the user to try again.`,
    };
  }
  if (refusal.status === 403) {
    return {
      refused: true,
      error: "The user doesn't have permission to do this. Nothing was changed.",
    };
  }
  return { refused: true, error: `${refusal.detail} Nothing was changed.` };
}

/**
 * The one active party called `guestName` (case-insensitive), narrowed by `partySize`
 * when given. Two matches is a question for the user, never a guess.
 */
async function findParty(
  api: ApiClient,
  venueId: string,
  guestName: string,
  partySize: number | undefined
): Promise<{ entry: WaitlistEntry } | { error: string }> {
  const entries = await api.waitlist.list(venueId);
  const name = guestName.trim().toLowerCase();
  const named = entries.filter(
    (e) => ACTIVE_STATUSES.has(e.status) && e.guestName.trim().toLowerCase() === name
  );
  const matches = partySize === undefined ? named : named.filter((e) => e.partySize === partySize);
  if (matches.length === 1) return { entry: matches[0]! };
  if (matches.length === 0) {
    return {
      error: `No party called ${guestName} is waiting${partySize ? ` with ${partySize} guests` : ""}.`,
    };
  }
  const sizes = matches.map((e) => e.partySize).join(" and ");
  return {
    error: `${matches.length} waiting parties are called ${guestName} (party sizes ${sizes}). Ask which one, by party size.`,
  };
}

export function createWaitlistTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  {
    venueId,
    timeZone,
  }: { readonly venueId?: string | undefined; readonly timeZone?: string | undefined }
): ToolSet {
  return {
    // ── Read ───────────────────────────────────────────────
    list_waitlist: tool({
      description:
        "List the parties on the waitlist now, in order: name, party size, quoted wait, whether they've been told their table is ready, and when they joined.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "list_waitlist tool called");
        try {
          const entries = await api.waitlist.list(venueId);
          const parties = entries
            .filter((e) => ACTIVE_STATUSES.has(e.status))
            .sort((a, b) => a.position - b.position)
            .map((e) => {
              const joinedAt = localTimeIn(e.createdAt, timeZone);
              return {
                guestName: e.guestName,
                partySize: e.partySize,
                position: e.position,
                quotedWaitMinutes: e.estimatedWaitMinutes,
                status: e.status,
                ...(joinedAt ? { joinedAt } : {}),
              };
            });
          return { parties };
        } catch (err) {
          log.error({ err, venueId }, "list_waitlist failed");
          const refusal = refusalOf(err);
          return refusal?.status === 403
            ? { refused: true, error: "The user doesn't have permission to see the waitlist." }
            : { error: "Couldn't read the waitlist. Ask the user to try again." };
        }
      },
    }),

    // ── Write (each runs only after the user confirms) ─────
    add_to_waitlist: tool({
      description:
        "Add a walk-in party to the waitlist. Needs their name, party size and phone number (the waitlist texts them when their table is ready). Requires confirmation.",
      inputSchema: z.object({
        guestName: z.string().min(1).describe("The party's name"),
        partySize: z.number().int().min(1).describe("Number of guests"),
        guestPhone: z.string().min(1).describe("The guest's phone number"),
      }),
      execute: async ({ guestName, partySize, guestPhone }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, partySize }, "add_to_waitlist tool called");
        try {
          const added = await api.waitlist.create({ venueId, guestName, partySize, guestPhone });
          return {
            added: true,
            position: added.position,
            quotedWaitMinutes: added.estimatedWaitMinutes,
          };
        } catch (err) {
          log.error({ err, venueId }, "add_to_waitlist failed");
          return waitlistFailure(err, "add the party");
        }
      },
    }),

    notify_waitlist_party: tool({
      description:
        "Tell a waiting party their table is ready (sends them a text). Requires confirmation.",
      inputSchema: z.object(PartySchema),
      execute: async ({ guestName, partySize }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "notify_waitlist_party tool called");
        try {
          const found = await findParty(api, venueId, guestName, partySize);
          if ("error" in found) return found;
          await api.waitlist.notify(found.entry.id);
          return { notified: true, guestName: found.entry.guestName };
        } catch (err) {
          log.error({ err, venueId }, "notify_waitlist_party failed");
          return waitlistFailure(err, "notify the party");
        }
      },
    }),

    seat_waitlist_party: tool({
      description:
        "Seat a waiting party at a table staff name: creates their walk-in at that table and takes them off the waitlist. Requires confirmation.",
      inputSchema: z.object({
        ...PartySchema,
        table: z.string().min(1).describe("The table's name or number, as staff call it"),
      }),
      execute: async ({ guestName, partySize, table: tableRef }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, tableRef }, "seat_waitlist_party tool called");
        let seatedAt: string | undefined;
        try {
          const found = await findParty(api, venueId, guestName, partySize);
          if ("error" in found) return found;
          const { entry } = found;
          const { data: tables } = await api.tables.list({ venueId, limit: TABLES_LIMIT });
          const resolved = resolveTable(tables, tableRef);
          if ("error" in resolved) return resolved;
          const { table } = resolved;
          const label = table.name ?? table.tableNumber ?? tableRef;
          if (table.status !== "AVAILABLE") {
            return {
              error: `Table ${label} is ${table.status.toLowerCase()}, so the party can't be seated there. Nothing was changed.`,
            };
          }
          await api.reservations.walkIn({
            venueId,
            partySize: entry.partySize,
            tableId: table.id,
            guestName: entry.guestName,
          });
          seatedAt = label;
          await api.waitlist.seat(entry.id);
          return { seated: true, guestName: entry.guestName, table: label };
        } catch (err) {
          log.error({ err, venueId }, "seat_waitlist_party failed");
          // The walk-in exists, so the party is seated; only the waitlist row is stale (as WaitlistPage reports it).
          if (seatedAt) {
            return {
              seated: true,
              waitlistStale: true,
              table: seatedAt,
              note: `The party is seated at ${seatedAt}, but they are still shown on the waitlist. Tell the user to remove them from the Waitlist page.`,
            };
          }
          return waitlistFailure(err, "seat the party");
        }
      },
    }),

    remove_from_waitlist: tool({
      description:
        "Take a party off the waitlist (they left or no longer want a table). Requires confirmation.",
      inputSchema: z.object(PartySchema),
      execute: async ({ guestName, partySize }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "remove_from_waitlist tool called");
        try {
          const found = await findParty(api, venueId, guestName, partySize);
          if ("error" in found) return found;
          await api.waitlist.cancel(found.entry.id);
          return { removed: true, guestName: found.entry.guestName };
        } catch (err) {
          log.error({ err, venueId }, "remove_from_waitlist failed");
          return waitlistFailure(err, "remove the party");
        }
      },
    }),
  };
}
