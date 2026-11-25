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

/**
 * Counted searches by the reason the engine found no slot (#9621). Precedence when
 * several apply: closure > hours > tables > pacing. Rows recorded before reasons
 * existed carry none, so the four can sum to less than `total`.
 */
const LostDemandByReasonSchema = z.object({
  pacing: z.number().int().nonnegative(),
  tables: z.number().int().nonnegative(),
  hours: z.number().int().nonnegative(),
  closure: z.number().int().nonnegative(),
});

export const LostDemandSchema = z.object({
  venueId: z.string(),
  from: ServiceDateSchema,
  to: ServiceDateSchema,
  /** Every counted search in the window, timed or not. */
  total: z.number().int().nonnegative(),
  /** Optional so existing clients and fixtures keep parsing; the service always sends it. */
  byReason: LostDemandByReasonSchema.optional(),
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

// ── "Add a seating at X" what-if (#9486) ────────────────────────────────────

export const LOST_DEMAND_WHAT_IF_PATH = `${LOST_DEMAND_PATH}/what-if`;

/** A time of day, 24-hour "HH:MM", venue-local. */
const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const LostDemandWhatIfQuerySchema = z.object({
  venueId: z.string().describe("Venue ID"),
  weekday: z.coerce.number().int().min(0).max(6).describe("0 = Sunday ... 6 = Saturday"),
  time: TimeOfDaySchema.describe("Candidate seating time, HH:MM, venue-local"),
  minParty: z.coerce.number().int().min(1).max(20).optional().describe("Smallest party counted"),
  maxParty: z.coerce.number().int().min(1).max(20).optional().describe("Largest party counted"),
  from: ServiceDateSchema.optional().describe(
    "First service date; defaults to 27 days before `to`"
  ),
  to: ServiceDateSchema.optional().describe("Last service date; defaults to today at the venue"),
});

/**
 * How the estimate came out. `estimated`: the seating would be new and `searches`
 * is the count. `closed`: the venue serves nothing that weekday, so there is no
 * service to add a seating to. `already_offered`: the time is already bookable.
 * `blocked`: the seating would run into another service or break a rule.
 */
const LOST_DEMAND_WHAT_IF_OUTCOMES = ["estimated", "closed", "already_offered", "blocked"] as const;

export const LostDemandWhatIfSchema = z.object({
  venueId: z.string(),
  from: ServiceDateSchema,
  to: ServiceDateSchema,
  weekday: WeekdaySchema,
  /** The candidate seating, minutes past the service day's midnight. */
  minute: z.number().int().min(0).max(1439),
  outcome: z.enum(LOST_DEMAND_WHAT_IF_OUTCOMES),
  /** Searches that asked for a time inside the window and a party the seating would fit. */
  searches: z.number().int().nonnegative(),
  /** The requested-time window searches were matched in: [windowStart, windowEnd) minutes. */
  windowStart: z.number().int(),
  windowEnd: z.number().int(),
  minParty: z.number().int().nullable(),
  maxParty: z.number().int().nullable(),
  /**
   * Whole-day misses on that weekday (no time named). Never added to `searches`: they
   * may have booked, but nothing says which hour they wanted.
   */
  anyTimeSearches: z.number().int().nonnegative(),
  /** How many of that weekday the window holds. */
  nights: z.number().int().nonnegative(),
  /** `searches` per night, to one decimal; 0 when the window holds none of that weekday. */
  perNight: z.number().nonnegative(),
});

export type LostDemandWhatIf = z.infer<typeof LostDemandWhatIfSchema>;

export const lostDemandEndpoints = {
  whatIf: defineEndpoint({
    method: "GET",
    path: LOST_DEMAND_WHAT_IF_PATH,
    query: LostDemandWhatIfQuerySchema,
    responses: {
      200: {
        description: "Estimate of the turned-away searches a new seating would have served",
        body: z.object({ data: LostDemandWhatIfSchema }),
      },
      400: problem("Missing venueId, invalid time, party range or date range"),
      401: problem("Authentication required"),
      403: problem("No access to the requested venue"),
    },
  }),
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
