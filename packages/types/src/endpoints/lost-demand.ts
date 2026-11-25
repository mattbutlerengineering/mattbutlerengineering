/**
 * Turned-away demand by weekday and hour, declared once (#9485). Counts only,
 * read from the Lost Demand Ledger (#9484): never a guest, session or IP.
 * Mounted beside the other booking metrics under the reservations prefix.
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import { ServiceDateSchema } from "../schemas/availability-config.js";

export const LOST_DEMAND_PATH = "/api/v1/reservations/metrics/lost-demand";

export const LostDemandQuerySchema = z.object({
  venueId: z.string().describe("Venue ID"),
  from: ServiceDateSchema.optional().describe(
    "First service date, YYYY-MM-DD; defaults to 27 days before `to`"
  ),
  to: ServiceDateSchema.optional().describe(
    "Last service date, YYYY-MM-DD; defaults to today in the venue's time zone"
  ),
});

/** 0 = Sunday ... 6 = Saturday, read from the venue-local service date. */
const WeekdaySchema = z.number().int().min(0).max(6);

export const LostDemandCellSchema = z.object({
  weekday: WeekdaySchema,
  /** Venue-local hour of the requested time, 0-23. */
  hour: z.number().int().min(0).max(23),
  searches: z.number().int().min(1),
});

const LostDemandAnyTimeSchema = z.object({
  weekday: WeekdaySchema,
  searches: z.number().int().min(1),
});

export const LostDemandSchema = z.object({
  venueId: z.string(),
  from: ServiceDateSchema,
  to: ServiceDateSchema,
  /** Every counted search in the window, timed or not. */
  total: z.number().int().nonnegative(),
  /** Searches that named a time, sparse: only non-empty weekday x hour cells. */
  cells: z.array(LostDemandCellSchema),
  /**
   * Searches that named no time (the whole day had no slot), sparse by weekday.
   * Kept apart from `cells`: they have no hour, so they are never placed in one.
   */
  anyTime: z.array(LostDemandAnyTimeSchema),
});

export type LostDemand = z.infer<typeof LostDemandSchema>;
export type LostDemandCell = z.infer<typeof LostDemandCellSchema>;

export const lostDemandEndpoints = {
  get: defineEndpoint({
    method: "GET",
    path: LOST_DEMAND_PATH,
    query: LostDemandQuerySchema,
    responses: {
      200: {
        description: "Turned-away search counts by weekday and hour",
        body: z.object({ data: LostDemandSchema }),
      },
      400: problem("Missing venueId, invalid date or range"),
      401: problem("Authentication required"),
      403: problem("No access to the requested venue"),
    },
  }),
};
