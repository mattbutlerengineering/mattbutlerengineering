/**
 * The end-of-service summary, declared once (#9482). Counts only: never a
 * reservation id, guest name, email or phone. Mounted beside the booking
 * metrics under the reservations prefix.
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import { ServiceDateSchema } from "../schemas/availability-config.js";

export const END_OF_SERVICE_PATH = "/api/v1/reservations/metrics/end-of-service";

export const EndOfServiceQuerySchema = z.object({
  venueId: z.string().describe("Venue ID"),
  date: ServiceDateSchema.optional().describe(
    "Service date, YYYY-MM-DD; defaults to today in the venue's time zone"
  ),
});

export const EndOfServiceSummarySchema = z.object({
  date: ServiceDateSchema,
  venueId: z.string(),
  /** Sum of party sizes of completed reservations. */
  covers: z.number().int().nonnegative(),
  /** Completed reservations (one completed seating each). */
  tableTurns: z.number().int().nonnegative(),
  noShows: z.number().int().nonnegative(),
  /** Reserved for the Lost Demand Ledger (#9484); always null until it lands. */
  turnedAway: z.number().int().nonnegative().nullable(),
});

export type EndOfServiceSummary = z.infer<typeof EndOfServiceSummarySchema>;

export const endOfServiceEndpoints = {
  get: defineEndpoint({
    method: "GET",
    path: END_OF_SERVICE_PATH,
    query: EndOfServiceQuerySchema,
    responses: {
      200: {
        description: "Counts-only summary for the service date",
        body: z.object({ data: EndOfServiceSummarySchema }),
      },
      400: problem("Missing venueId or invalid date"),
      401: problem("Authentication required"),
      403: problem("No access to the requested venue"),
    },
  }),
};
