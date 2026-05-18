import { tool } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
// eslint-disable-next-line no-restricted-imports -- agent tools call reservation API on behalf of user
import type { createApiClient } from "@mbe/api-client";

type ApiClient = ReturnType<typeof createApiClient>;

export const WRITE_TOOLS = new Set([
  "create_reservation",
  "modify_reservation",
  "cancel_reservation",
  "seat_walk_in",
  "update_table_status",
]);

export function createAgentTools(log: FastifyBaseLogger, api: ApiClient) {
  return {
    // ── Read tools (instant, no confirmation) ──────────────
    check_availability: tool({
      description: "Check available time slots for a venue on a specific date",
      inputSchema: z.object({
        venueId: z.string().describe("The venue ID to check availability for"),
        date: z.string().describe("Date in YYYY-MM-DD format"),
        partySize: z.number().describe("Number of guests"),
      }),
      execute: async ({ venueId, date, partySize }) => {
        log.info({ venueId, date, partySize }, "check_availability tool called");
        try {
          const slots = await api.availability.getTimeSlots({ venueId, date, partySize });
          return { slots };
        } catch (err) {
          log.error({ err, venueId, date, partySize }, "check_availability failed");
          return { error: "Failed to check availability. Please try again." };
        }
      },
    }),

    lookup_reservation: tool({
      description: "Find reservations by guest name, date, or confirmation number",
      inputSchema: z.object({
        guestName: z.string().optional().describe("Guest name to search"),
        date: z.string().optional().describe("Date in YYYY-MM-DD format"),
        venueId: z.string().optional().describe("Venue ID to filter by"),
      }),
      execute: async ({ date, venueId }) => {
        log.info({ date, venueId }, "lookup_reservation tool called");
        try {
          const result = await api.reservations.list({
            ...(date ? { date } : {}),
            ...(venueId ? { venueId } : {}),
          });
          return { reservations: result.data };
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
        venueId: z.string().optional().describe("Venue ID to scope search"),
      }),
      execute: async ({ query, venueId }) => {
        log.info({ query, venueId }, "search_guests tool called");
        try {
          const result = await api.guests.search({
            venueId: venueId ?? "",
            query,
          });
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
        venueId: z.string().describe("Venue ID"),
        tableNumber: z.number().optional().describe("Specific table number to check"),
      }),
      execute: async ({ venueId }) => {
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
        venueId: z.string().describe("Venue ID"),
        date: z.string().optional().describe("Date in YYYY-MM-DD format, defaults to today"),
        status: z
          .enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"])
          .optional()
          .describe("Filter by reservation status"),
      }),
      execute: async ({ venueId, date, status }) => {
        log.info({ venueId, date, status }, "list_today_reservations tool called");
        try {
          const queryDate = date ?? new Date().toISOString().split("T")[0]!;
          const result = await api.reservations.list({
            venueId,
            date: queryDate,
            limit: 50,
            ...(status ? { status } : {}),
          });
          return { reservations: result.data };
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
            return { error: "Reservation ID is required to cancel. Please look up the reservation first." };
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
        venueId: z.string().describe("Venue ID"),
        partySize: z.number().describe("Number of guests"),
        tableId: z
          .string()
          .optional()
          .describe("Specific table to seat at (auto-assigns if omitted)"),
        guestName: z.string().optional().describe("Guest name if provided"),
      }),
      execute: async ({ venueId, partySize, tableId, guestName }) => {
        log.info({ venueId, partySize, tableId, guestName }, "seat_walk_in tool called");
        try {
          if (!tableId) {
            return { error: "A table must be specified for walk-ins. Check available tables first." };
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
        venueId: z.string().describe("Venue ID"),
        tableNumber: z.number().describe("Table number"),
        status: z.enum(["AVAILABLE", "OCCUPIED", "DIRTY", "READY"]).describe("New table status"),
      }),
      execute: async ({ venueId, tableNumber, status: newStatus }) => {
        log.info({ venueId, tableNumber, newStatus }, "update_table_status tool called");
        try {
          const tablesResult = await api.tables.list({ venueId });
          const table = tablesResult.data.find(
            (t) => t.tableNumber === String(tableNumber)
          );
          if (!table) {
            return { error: `Table ${tableNumber} not found in this venue.` };
          }
          const updated = await api.tables.updateStatus(table.id, newStatus);
          return { table: updated };
        } catch (err) {
          log.error({ err, venueId, tableNumber }, "update_table_status failed");
          return { error: "Failed to update table status. Please try again." };
        }
      },
    }),
  };
}
