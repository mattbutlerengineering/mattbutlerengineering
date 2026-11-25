/**
 * Autopilot proposals, declared once (#9492). Read-only: the host sees the moves the rule-based
 * engine (#9491) would suggest for tonight. Nothing here applies a move (that is #9493).
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import { ServiceDateSchema } from "../schemas/availability-config.js";

export const AUTOPILOT_PROPOSALS_PATH = "/api/v1/reservations/metrics/autopilot-proposals";

export const AutopilotProposalsQuerySchema = z.object({
  venueId: z.string().describe("Venue ID"),
  date: ServiceDateSchema.optional().describe(
    "Service date, YYYY-MM-DD; defaults to the venue's current service date (still last night's after midnight)"
  ),
});

export const AutopilotMoveSchema = z.object({
  /** Stable for the same move, so a client can remember a dismissal. */
  id: z.string(),
  /** `reseat` moves a booked party to another table; `waitlist_offer` seats a waiting party. */
  kind: z.enum(["reseat", "waitlist_offer"]),
  /** The party the move is about: the guest's name, or null when the booking has none. */
  partyLabel: z.string().nullable(),
  /** The booking a `reseat` moves; null for a waitlist offer. Approving applies it (#9493). */
  reservationId: z.string().nullable(),
  /** The waiting party a `waitlist_offer` seats; null for a reseat. */
  waitlistEntryId: z.string().nullable(),
  partySize: z.number().int().min(1),
  /** Table the party sits at now; null for a waitlist offer. */
  fromTableId: z.string().nullable(),
  fromTableName: z.string().nullable(),
  toTableId: z.string(),
  toTableName: z.string(),
  /** Where the ghost block sits on the Timeline: the booking's own span, or now for an offer. */
  startTime: z.string(),
  endTime: z.string(),
  /** One plain sentence on why. */
  reason: z.string(),
});

export const AutopilotProposalsSchema = z.object({
  date: ServiceDateSchema,
  venueId: z.string(),
  moves: z.array(AutopilotMoveSchema),
});

export type AutopilotMove = z.infer<typeof AutopilotMoveSchema>;
export type AutopilotProposals = z.infer<typeof AutopilotProposalsSchema>;

export const autopilotProposalsEndpoints = {
  get: defineEndpoint({
    method: "GET",
    path: AUTOPILOT_PROPOSALS_PATH,
    query: AutopilotProposalsQuerySchema,
    responses: {
      200: {
        description: "Moves worth suggesting tonight, best first (at most three)",
        body: z.object({ data: AutopilotProposalsSchema }),
      },
      400: problem("Missing venueId or invalid date"),
      401: problem("Authentication required"),
      403: problem("No access to the requested venue"),
    },
  }),
};
