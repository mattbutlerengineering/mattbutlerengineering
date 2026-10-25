import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of user
import type { createApiClient } from "@mbe/api-client";
import { GEN_WRITE_TOOL_NAMES } from "./gen-runner.js";

type ApiClient = ReturnType<typeof createApiClient>;

/** The action the user explicitly confirmed in the client's confirm dialog. */
export interface ConfirmedAction {
  /** Echo of the action_request's actionId — traceability only (a resend produces new tool-call ids). */
  readonly actionId: string;
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
}

export interface CreateAgentToolsOptions {
  readonly confirmedAction?: ConfirmedAction | undefined;
  /** The venue the user has selected in the app; every venue-scoped tool is pinned to it. */
  readonly venueId?: string | undefined;
  /** The venue's IANA time zone, so "today" means the venue's today rather than UTC's. */
  readonly timeZone?: string | undefined;
}

/** The reservations API's page-size ceiling. */
const LOOKUP_LIMIT = 100;
/** Guest profiles a name lookup follows; more than this means the name is too vague. */
const MAX_GUEST_MATCHES = 5;

const NO_VENUE = {
  error: "No venue is selected. Ask the user to pick a venue in the app, then try again.",
} as const;

/** YYYY-MM-DD for `now` in `timeZone` (UTC when absent). */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Venue-local 24-hour `HH:mm` for an ISO time in `timeZone` (UTC when absent),
 * so the model never does time-zone arithmetic. Undefined, never a throw, when
 * the time or the zone can't be read.
 */
export function localTimeIn(iso: unknown, timeZone: string | undefined): string | undefined {
  if (typeof iso !== "string") return undefined;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone ?? "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  } catch {
    return undefined; // unknown time zone (RangeError)
  }
}

/** A copy of `item` with `localTime` from its `field` added, or `item` unchanged when unreadable. */
function withLocalTime<T extends object>(
  item: T,
  field: string,
  timeZone: string | undefined
): T | (T & { localTime: string }) {
  const localTime = localTimeIn((item as Record<string, unknown>)[field], timeZone);
  return localTime ? { ...item, localTime } : item;
}

type PublicAvailability = Awaited<ReturnType<ApiClient["availability"]["getPublicAvailability"]>>;

/**
 * Availability is unknown, which is not the same as closed: the model must
 * say it couldn't check, never that the venue is closed or fully booked.
 */
const AVAILABILITY_UNKNOWN = {
  unknown: true,
  error:
    "Couldn't check availability right now. Tell the user you couldn't check and to try again shortly; do not say the venue is closed or fully booked.",
} as const;

/** The tool result for one date: the slots, plus the closure or pause the endpoint reported. */
function availabilityResult(
  response: PublicAvailability,
  date: string,
  timeZone: string | undefined
) {
  const slots = response.data.map((slot) => withLocalTime(slot, "time", timeZone));
  const { closure, bookingPaused } = response;
  return {
    slots,
    ...(closure
      ? {
          closed: true,
          closureMessage: closure.message,
          note: `The venue is closed on ${date} (${closure.message}), so nothing can be booked. Say so rather than calling the day fully booked.`,
        }
      : {}),
    ...(bookingPaused
      ? {
          bookingPaused,
          note: `Online booking is paused: ${bookingPaused.message}${bookingPaused.phone ? ` Guests can call ${bookingPaused.phone}.` : ""} Say so rather than calling the day fully booked.`,
        }
      : {}),
  };
}

const CONFIRMATION_PENDING = {
  pendingConfirmation: true,
  message:
    "This action requires the user's confirmation before it runs. Tell the user what you prepared and ask them to confirm or cancel.",
} as const;

/**
 * Wraps every write tool so its real API call runs only for the action the
 * user explicitly confirmed — with exactly the confirmed input, at most once
 * per request. The unconfirmed path still surfaces as an action_request event
 * (gen-runner), so the client's confirm UI is unchanged; this gate is what
 * makes it real. The model's re-derived input on the confirmed resend is
 * ignored: what the user saw in the dialog is what executes.
 */
function gateWriteTools(
  tools: ToolSet,
  log: FastifyBaseLogger,
  confirmedAction?: ConfirmedAction
): ToolSet {
  let consumed = false;
  const gated: ToolSet = { ...tools };
  for (const name of GEN_WRITE_TOOL_NAMES) {
    const original = gated[name];
    const originalExecute = original?.execute;
    if (!original || !originalExecute) continue;
    gated[name] = {
      ...original,
      execute: async (_input: never, ctx: never) => {
        if (confirmedAction?.toolName !== name) {
          log.info({ toolName: name }, "write tool call held for user confirmation");
          return CONFIRMATION_PENDING;
        }
        if (consumed) {
          return { error: "This confirmed action has already been executed." };
        }
        const schema = original.inputSchema as z.ZodType;
        const parsed = schema.safeParse(confirmedAction.toolInput);
        if (!parsed.success) {
          log.error(
            { toolName: name, actionId: confirmedAction.actionId },
            "confirmed action input invalid, refusing to execute"
          );
          return { error: "The confirmed action's parameters are invalid. Please start over." };
        }
        consumed = true;
        log.info(
          { toolName: name, actionId: confirmedAction.actionId },
          "executing user-confirmed action"
        );
        return originalExecute(parsed.data as never, ctx);
      },
    } as ToolSet[string];
  }
  return gated;
}

interface NamedTable {
  readonly id: string;
  readonly name?: string | null;
  readonly tableNumber?: string | null;
}

/**
 * Resolve a staff reference ("12", "Patio 2") to one table. Tables may have a
 * number, a name, or both, so match in order of precision: number, exact
 * name, then case-insensitive name. More than one match at a step is an
 * error, never a guess: the user confirmed this reference, not a table id.
 */
function resolveTable<T extends NamedTable>(
  tables: readonly T[],
  tableRef: string
): { table: T } | { error: string } {
  const ref = tableRef.trim();
  const steps: ReadonlyArray<(t: T) => boolean> = [
    (t) => t.tableNumber === ref,
    (t) => t.name === ref,
    (t) => t.name?.toLowerCase() === ref.toLowerCase(),
  ];
  for (const matches of steps) {
    const found = tables.filter(matches);
    if (found.length === 1) return { table: found[0]! };
    if (found.length > 1) {
      return { error: `Table ${tableRef} is ambiguous in this venue. Ask which table they mean.` };
    }
  }
  return { error: `Table ${tableRef} not found in this venue.` };
}

export function createAgentTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  options: CreateAgentToolsOptions = {}
): ToolSet {
  const { venueId, timeZone } = options;
  const toLocal = <T extends object>(reservation: T) =>
    withLocalTime(reservation, "startTime", timeZone);
  const tools: ToolSet = {
    // ── Read tools (instant, no confirmation) ──────────────
    // venueId never comes from the model: it is the app's selected venue.
    check_availability: tool({
      description: "Check available time slots on a specific date",
      inputSchema: z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
        partySize: z.number().describe("Number of guests"),
      }),
      execute: async ({ date, partySize }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, date, partySize }, "check_availability tool called");
        try {
          // The public endpoint is slug-scoped and already carries closures and pauses.
          const { slug } = await api.venues.get(venueId);
          const response = await api.availability.getPublicAvailability(slug, { date, partySize });
          return availabilityResult(response, date, timeZone);
        } catch (err) {
          // Timeout, 5xx or network failure: unknown, never "closed".
          log.error({ err, venueId, date, partySize }, "check_availability failed");
          return AVAILABILITY_UNKNOWN;
        }
      },
    }),

    lookup_reservation: tool({
      description: "Find reservations by guest name and/or date",
      inputSchema: z.object({
        guestName: z.string().optional().describe("Guest name (or part of it) to search"),
        date: z.string().optional().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async ({ guestName, date }) => {
        if (!venueId) return NO_VENUE;
        log.info({ date, venueId }, "lookup_reservation tool called");
        const dateFilter = date ? { date } : {};
        try {
          const venueList = await api.reservations.list({
            venueId,
            ...dateFilter,
            limit: LOOKUP_LIMIT,
          });
          const needle = guestName?.trim().toLowerCase();
          if (!needle) return { reservations: venueList.data.map(toLocal) };
          // The list is paginated, so a name filter over it alone misses most
          // of a busy venue: resolve the guest first, then list their bookings.
          const guests = await api.guests.search({ venueId, query: guestName! });
          const byGuest = await Promise.all(
            guests.data.slice(0, MAX_GUEST_MATCHES).map((guest) =>
              api.reservations.list({
                venueId,
                guestId: guest.id,
                ...dateFilter,
                limit: LOOKUP_LIMIT,
              })
            )
          );
          // Walk-ins can carry a name with no guest profile; match those by name.
          const byName = venueList.data.filter((r) => r.guestName?.toLowerCase().includes(needle));
          const merged = [...byGuest.flatMap((page) => page.data), ...byName];
          const reservations = merged.filter(
            (r, i) => merged.findIndex((other) => other.id === r.id) === i
          );
          return { reservations: reservations.map(toLocal) };
        } catch (err) {
          log.error({ err, date, venueId }, "lookup_reservation failed");
          return { error: "Failed to look up reservations. Please try again." };
        }
      },
    }),

    search_guests: tool({
      description: "Search guest directory by name, email, or phone",
      inputSchema: z.object({
        query: z.string().describe("Search term (name, email, or phone)"),
      }),
      execute: async ({ query }) => {
        if (!venueId) return NO_VENUE;
        log.info({ query, venueId }, "search_guests tool called");
        try {
          const result = await api.guests.search({ venueId, query });
          return { guests: result.data };
        } catch (err) {
          log.error({ err, query, venueId }, "search_guests failed");
          return { error: "Failed to search guests. Please try again." };
        }
      },
    }),

    get_table_status: tool({
      description: "Check the status of a specific table or all tables",
      inputSchema: z.object({
        tableNumber: z.number().optional().describe("Specific table number to check"),
      }),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "get_table_status tool called");
        try {
          const result = await api.tables.list({ venueId });
          return { tables: result.data };
        } catch (err) {
          log.error({ err, venueId }, "get_table_status failed");
          return { error: "Failed to get table status. Please try again." };
        }
      },
    }),

    list_today_reservations: tool({
      description: "List all reservations for today or a specified date",
      inputSchema: z.object({
        date: z.string().optional().describe("Date in YYYY-MM-DD format, defaults to today"),
        status: z
          .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
          .optional()
          .describe("Filter by reservation status"),
      }),
      execute: async ({ date, status }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, date, status }, "list_today_reservations tool called");
        try {
          const queryDate = date ?? todayIn(timeZone);
          const result = await api.reservations.list({
            venueId,
            date: queryDate,
            limit: 50,
            ...(status ? { status } : {}),
          });
          return { reservations: result.data.map(toLocal) };
        } catch (err) {
          log.error({ err, venueId, date }, "list_today_reservations failed");
          return { error: "Failed to list reservations. Please try again." };
        }
      },
    }),

    // ── Render tool (special handling — emits elements) ────
    render_component: tool({
      description:
        "Render interactive UI components in the chat. Use when visual presentation is better than text — availability cards, reservation summaries, confirmation forms. Elements use the rialto component catalog.",
      inputSchema: z.object({
        elements: z.array(
          z.object({
            id: z.string(),
            type: z.string(),
            props: z.record(z.string(), z.unknown()).optional(),
            children: z.array(z.string()).optional(),
          })
        ),
      }),
      execute: async () => ({ rendered: true }),
    }),

    // ── Write tools (require confirmation) ─────────────────
    create_reservation: tool({
      description: "Create a new reservation. Requires confirmation before executing.",
      inputSchema: z.object({
        guestName: z.string().describe("Guest name"),
        date: z.string().describe("Date in YYYY-MM-DD format"),
        startTime: z.string().describe("Start time in HH:MM format"),
        endTime: z.string().describe("End time in HH:MM format"),
        partySize: z.number().describe("Number of guests"),
        tableId: z.string().describe("Table ID to reserve"),
        notes: z.string().optional().describe("Reservation notes"),
      }),
      execute: async ({ guestName, date, startTime, endTime, partySize, tableId, notes }) => {
        log.info({ guestName, date, startTime, partySize }, "create_reservation tool called");
        try {
          const reservation = await api.reservations.create({
            guestName,
            date,
            startTime,
            endTime,
            partySize,
            tableId,
            ...(notes ? { notes } : {}),
          });
          return { reservation };
        } catch (err) {
          log.error({ err, guestName, date }, "create_reservation failed");
          return { error: "Failed to create reservation. Please try again." };
        }
      },
    }),

    modify_reservation: tool({
      description:
        "Modify an existing reservation (time, table, party size, or notes). Requires confirmation.",
      inputSchema: z.object({
        reservationId: z.string().describe("Reservation ID to modify"),
        date: z.string().optional().describe("New date in YYYY-MM-DD format"),
        startTime: z.string().optional().describe("New start time in HH:MM format"),
        endTime: z.string().optional().describe("New end time in HH:MM format"),
        partySize: z.number().optional().describe("New party size"),
        tableId: z.string().optional().describe("New table ID"),
        notes: z.string().optional().describe("Updated notes"),
      }),
      execute: async ({ reservationId, ...updates }) => {
        log.info({ reservationId, ...updates }, "modify_reservation tool called");
        try {
          const cleanUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, v]) => v !== undefined)
          );
          const reservation = await api.reservations.update(reservationId, cleanUpdates);
          return { reservation };
        } catch (err) {
          log.error({ err, reservationId }, "modify_reservation failed");
          return { error: "Failed to modify reservation. Please try again." };
        }
      },
    }),

    cancel_reservation: tool({
      description: "Cancel a reservation. Requires confirmation.",
      inputSchema: z.object({
        reservationId: z.string().optional().describe("Reservation ID to cancel"),
        guestName: z.string().optional().describe("Guest name to look up and cancel"),
        date: z.string().optional().describe("Date to narrow search"),
      }),
      execute: async ({ reservationId }) => {
        log.info({ reservationId }, "cancel_reservation tool called");
        try {
          if (!reservationId) {
            return {
              error: "Reservation ID is required to cancel. Please look up the reservation first.",
            };
          }
          const reservation = await api.reservations.cancel(reservationId);
          return { reservation };
        } catch (err) {
          log.error({ err, reservationId }, "cancel_reservation failed");
          return { error: "Failed to cancel reservation. Please try again." };
        }
      },
    }),

    seat_walk_in: tool({
      description:
        "Create a walk-in reservation and seat guests immediately. Requires confirmation.",
      inputSchema: z.object({
        partySize: z.number().describe("Number of guests"),
        tableId: z
          .string()
          .optional()
          .describe("Specific table to seat at (auto-assigns if omitted)"),
        guestName: z.string().optional().describe("Guest name if provided"),
      }),
      execute: async ({ partySize, tableId, guestName }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, partySize, tableId, guestName }, "seat_walk_in tool called");
        try {
          if (!tableId) {
            return {
              error: "A table must be specified for walk-ins. Check available tables first.",
            };
          }
          const reservation = await api.reservations.walkIn({
            venueId,
            partySize,
            tableId,
            ...(guestName ? { guestName } : {}),
          });
          return { reservation };
        } catch (err) {
          log.error({ err, venueId, partySize }, "seat_walk_in failed");
          return { error: "Failed to seat walk-in. Please try again." };
        }
      },
    }),

    update_table_status: tool({
      description:
        "Update a table's status (clean, dirty, occupied, available). Requires confirmation.",
      inputSchema: z.object({
        table: z.string().describe("The table's name or number, as staff call it"),
        status: z.enum(["AVAILABLE", "OCCUPIED", "DIRTY", "READY"]).describe("New table status"),
      }),
      execute: async ({ table: tableRef, status: newStatus }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, tableRef, newStatus }, "update_table_status tool called");
        try {
          const tablesResult = await api.tables.list({ venueId });
          const resolved = resolveTable(tablesResult.data, tableRef);
          if ("error" in resolved) return resolved;
          const { table } = resolved;
          const updated = await api.tables.updateStatus(table.id, newStatus);
          return { table: updated };
        } catch (err) {
          log.error({ err, venueId, tableRef }, "update_table_status failed");
          return { error: "Failed to update table status. Please try again." };
        }
      },
    }),
  };
  return gateWriteTools(tools, log, options.confirmedAction);
}
