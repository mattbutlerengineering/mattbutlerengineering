import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import { NO_VENUE, refusalOf, resolveTable, type ApiClient } from "./gen-tool-support.js";

/**
 * Chat tools for the timeline's booking actions (#7925): seat a booked party,
 * mark a no-show, cancel with a reason. Each one does what the timeline's own
 * button does, and runs only after the user confirms.
 */

/** The timeline's cancel reasons (`CancelReservationDialog`). */
const CANCEL_REASONS = ["guest_cancelled", "no_show", "restaurant_cancelled", "other"] as const;
/** Bookings still waiting for their party. */
const SEATABLE_STATUSES: ReadonlySet<string> = new Set(["PENDING", "CONFIRMED"]);
/** The reservations API's page-size ceiling; a venue's tables fit in one page. */
const TABLES_LIMIT = 100;

const ReservationIdSchema = z.string().min(1).describe("The reservation's ID, from a lookup");

type Reservation = Awaited<ReturnType<ApiClient["reservations"]["get"]>>;

/** A refused or failed booking write, in words the model can pass on. */
function bookingWriteFailure(err: unknown, action: string) {
  const refusal = refusalOf(err);
  if (!refusal)
    return { error: `Couldn't ${action} right now. Ask the user to try again shortly.` };
  if (refusal.status === 403) {
    return {
      refused: true,
      error: "The user doesn't have permission to do this. Nothing was changed.",
    };
  }
  return { refused: true, error: `${refusal.detail} Nothing was changed.` };
}

/** The booking, when it belongs to the selected venue; the user confirmed this venue's booking. */
async function venueReservation(
  api: ApiClient,
  venueId: string,
  reservationId: string
): Promise<{ reservation: Reservation } | { error: string }> {
  const reservation = await api.reservations.get(reservationId);
  if (reservation.venueId !== venueId) {
    return { error: "That reservation isn't at this venue. Look it up again." };
  }
  return { reservation };
}

export function createTimelineTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  { venueId }: { readonly venueId?: string | undefined }
): ToolSet {
  return {
    seat_reservation: tool({
      description:
        "Seat a booked party that has arrived: at its booked table, or at the table staff name. Marks the table occupied, as the timeline's Seat button does. For a walk-in with no booking, use seat_walk_in. Requires confirmation.",
      inputSchema: z.object({
        reservationId: ReservationIdSchema,
        table: z
          .string()
          .min(1)
          .optional()
          .describe("Seat at this table instead, by its name or number; omit for the booked table"),
      }),
      execute: async ({ reservationId, table: tableRef }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, reservationId, tableRef }, "seat_reservation tool called");
        try {
          const found = await venueReservation(api, venueId, reservationId);
          if ("error" in found) return found;
          const { reservation } = found;
          if (!SEATABLE_STATUSES.has(reservation.status)) {
            return {
              error: `This booking is ${reservation.status.toLowerCase().replace(/_/g, " ")}, so it can't be seated.`,
            };
          }
          const { data: tables } = await api.tables.list({ venueId, limit: TABLES_LIMIT });
          const chosen = tableRef ? resolveTable(tables, tableRef) : undefined;
          if (chosen && "error" in chosen) return chosen;
          const tableId = chosen?.table.id ?? reservation.tableId;
          if (!tableId) {
            return { error: "This booking has no table. Ask which table to seat them at." };
          }
          // The server has no CONFIRMED -> CONFIRMED edge, so only a pending booking changes status.
          const update = {
            ...(reservation.status === "PENDING" ? { status: "CONFIRMED" as const } : {}),
            ...(tableId !== reservation.tableId ? { tableId } : {}),
          };
          if (Object.keys(update).length > 0) await api.reservations.update(reservationId, update);
          await api.tables.updateStatus(tableId, "OCCUPIED");
          const seatedAt = tables.find((t) => t.id === tableId);
          return { seated: true, table: seatedAt?.name ?? seatedAt?.tableNumber ?? tableId };
        } catch (err) {
          log.error({ err, venueId, reservationId }, "seat_reservation failed");
          return bookingWriteFailure(err, "seat the party");
        }
      },
    }),

    mark_no_show: tool({
      description: "Mark a booking as a no-show: the party never arrived. Requires confirmation.",
      inputSchema: z.object({ reservationId: ReservationIdSchema }),
      execute: async ({ reservationId }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, reservationId }, "mark_no_show tool called");
        try {
          const found = await venueReservation(api, venueId, reservationId);
          if ("error" in found) return found;
          const { warning } = await api.reservations.markNoShow(reservationId);
          return { noShow: true, ...(warning ? { warning } : {}) };
        } catch (err) {
          log.error({ err, venueId, reservationId }, "mark_no_show failed");
          return bookingWriteFailure(err, "mark the no-show");
        }
      },
    }),

    cancel_reservation: tool({
      description:
        "Cancel a reservation, with the reason and a note when the user gives them. Requires confirmation.",
      inputSchema: z.object({
        reservationId: z.string().optional().describe("Reservation ID to cancel"),
        guestName: z.string().optional().describe("Guest name to look up and cancel"),
        date: z.string().optional().describe("Date to narrow search"),
        reason: z
          .enum(CANCEL_REASONS)
          .optional()
          .describe("Why it is cancelled, when the user says"),
        note: z.string().max(500).optional().describe("A note on the cancellation"),
      }),
      execute: async ({ reservationId, reason, note }) => {
        log.info({ reservationId, reason }, "cancel_reservation tool called");
        try {
          if (!reservationId) {
            return {
              error: "Reservation ID is required to cancel. Please look up the reservation first.",
            };
          }
          const reservation =
            reason || note
              ? await api.reservations.cancelWithReason(reservationId, {
                  ...(reason ? { cancellationReason: reason } : {}),
                  ...(note ? { cancellationNote: note } : {}),
                })
              : await api.reservations.cancel(reservationId);
          return { reservation };
        } catch (err) {
          log.error({ err, reservationId }, "cancel_reservation failed");
          return { error: "Failed to cancel reservation. Please try again." };
        }
      },
    }),
  };
}
