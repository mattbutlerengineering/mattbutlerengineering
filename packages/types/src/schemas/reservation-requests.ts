/**
 * Zod schemas for reservations-service request bodies and querystrings —
 * the single source of truth for request validation.
 *
 * These mirror the shapes the routes previously hand-wrote as inline Fastify
 * JSON Schema. Route files derive Fastify-compatible JSON Schema from these via
 * `toRequestJsonSchema`, so the enum lists, formats and constraints live in one
 * place instead of being pasted (and drifting) across `routes/*.ts`.
 *
 * Wire-fidelity notes (verified against Fastify 5's AJV, `strict: false`):
 * - `z.iso.date()` / `z.iso.datetime({ offset: true })` / `z.email()` accept
 *   and reject exactly what the old `format: "date" | "date-time" | "email"`
 *   schemas did.
 * - `.nullable()` derives to `anyOf: [T, { type: "null" }]`, which Fastify
 *   treats identically to the old `nullable: true`.
 * - Querystring params keep their previous `type: "string"` (routes coerce),
 *   so no behavioural change.
 */
import { z } from "zod";

import { OccasionSchema, SeatingPreferenceSchema, ReservationStatusSchema } from "./reservation.js";
import { TableStatusSchema } from "./floor-plan.js";

/** Arbitrary JSON object payload (derives to a bare `{ type: "object" }`). */
const JsonObjectSchema = z.record(z.string(), z.unknown());

// ── Reservations (routes/reservations.ts) ─────────────────────
export const ListReservationsQuerySchema = z.object({
  page: z.string().default("1").describe("Page number (1-indexed)"),
  limit: z.string().default("10").describe("Number of reservations per page (max 100)"),
  date: z.iso.date().describe("Filter by reservation date (YYYY-MM-DD)").optional(),
  status: ReservationStatusSchema.describe("Filter by reservation status").optional(),
  tableId: z.string().describe("Filter by table ID").optional(),
  venueId: z.string().describe("Filter by venue ID").optional(),
});

export const ListMyReservationsQuerySchema = z.object({
  page: z.string().default("1").describe("Page number (1-indexed)"),
  limit: z.string().default("10").describe("Number of reservations per page (max 100)"),
});

export const WalkInBodySchema = z.object({
  partySize: z.number().int().min(1).describe("Number of guests"),
  tableId: z.string().describe("ID of the table to seat guests at"),
  venueId: z.string().describe("ID of the venue"),
  guestName: z.string().describe("Guest name (defaults to 'Walk-in')").optional(),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .describe("Expected duration in minutes (defaults to 90)")
    .optional(),
  occasion: OccasionSchema.describe("Occasion for the reservation").optional(),
  seatingPreference: SeatingPreferenceSchema.describe("Guest seating preference").optional(),
}).describe("Walk-in reservation payload");

export const CreateReservationBodySchema = z.object({
  date: z.iso.date().describe("Reservation date (YYYY-MM-DD)"),
  startTime: z.iso.datetime({ offset: true }).describe("Start time (ISO 8601)"),
  endTime: z.iso.datetime({ offset: true }).describe("End time (ISO 8601)"),
  partySize: z.number().int().min(1).describe("Number of guests"),
  tableId: z.string().describe("ID of the table to reserve"),
  notes: z.string().describe("Special requests or notes").optional(),
  guestName: z.string().describe("Guest name (for unauthenticated reservations)").optional(),
  guestEmail: z.email().describe("Guest email (for unauthenticated reservations)").optional(),
  guestPhone: z.string().describe("Guest phone number").optional(),
  venueId: z.string().describe("ID of the venue for this reservation").optional(),
  occasion: OccasionSchema.describe("Occasion for the reservation").optional(),
  seatingPreference: SeatingPreferenceSchema.describe("Guest seating preference").optional(),
}).describe("Reservation creation payload");

export const UpdateReservationBodySchema = z.object({
  date: z.iso.date().describe("New reservation date").optional(),
  startTime: z.iso.datetime({ offset: true }).describe("New start time").optional(),
  endTime: z.iso.datetime({ offset: true }).describe("New end time").optional(),
  partySize: z.number().int().min(1).describe("New party size").optional(),
  tableId: z.string().describe("New table ID").optional(),
  status: ReservationStatusSchema.describe("New status").optional(),
  notes: z.string().describe("Updated notes").optional(),
  cancellationReason: z
    .string()
    .describe("Reason for cancellation (used when status is CANCELLED)")
    .optional(),
  cancellationNote: z
    .string()
    .describe("Additional cancellation notes (used when status is CANCELLED)")
    .optional(),
  occasion: OccasionSchema.describe("Occasion for the reservation").optional(),
  seatingPreference: SeatingPreferenceSchema.describe("Guest seating preference").optional(),
}).describe("Fields to update");

// ── Availability (routes/availability.ts) ─────────────────────
export const AvailabilityQuerySchema = z.object({
  date: z.iso.date().describe("Date in YYYY-MM-DD format"),
  partySize: z.string().describe("Number of guests"),
  duration: z.string().describe("Optional duration override in minutes").optional(),
});

export const AvailabilityDatesQuerySchema = z.object({
  startDate: z.iso.date().describe("Start date in YYYY-MM-DD format"),
  endDate: z.iso.date().describe("End date in YYYY-MM-DD format"),
  partySize: z.string().describe("Number of guests"),
});

// ── Briefing (routes/briefing.ts) ─────────────────────────────
export const BriefingQuerySchema = z.object({
  date: z.iso.date().describe("Date for the briefing (YYYY-MM-DD)"),
  venueId: z.string().describe("Venue ID to scope the briefing to"),
});

// ── Events (routes/events.ts) ─────────────────────────────────
export const EventsStreamQuerySchema = z.object({
  venueId: z.string().describe("Filter events to a specific venue").optional(),
});

export const TestEventBodySchema = z.object({
  type: z.string(),
  venueId: z.string(),
  data: JsonObjectSchema,
});

// ── Floor plans (routes/floor-plans.ts) ───────────────────────
export const ListFloorPlansQuerySchema = z.object({
  venueId: z.string().optional(),
  page: z.string().default("1"),
  limit: z.string().default("10"),
});

export const CreateFloorPlanBodySchema = z.object({
  venueId: z.string(),
  name: z.string(),
  isActive: z.boolean().optional(),
  layoutJson: JsonObjectSchema,
});

export const UpdateFloorPlanBodySchema = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
  layoutJson: JsonObjectSchema.optional(),
});

export const UpdateTablePositionsBodySchema = z.object({
  floorPlanId: z.string(),
  positions: z.array(
    z.object({
      tableId: z.string(),
      shapeMetadata: JsonObjectSchema,
    })
  ),
});

export const AssignTableBodySchema = z.object({
  floorPlanId: z.string(),
  shapeMetadata: JsonObjectSchema.optional(),
});

// ── Guests (routes/guests.ts) ─────────────────────────────────
export const ListGuestsQuerySchema = z.object({
  venueId: z.string().describe("Venue ID to list guests for"),
  page: z.string().default("1").describe("Page number (1-indexed)"),
  limit: z.string().default("10").describe("Number of guests per page (max 100)"),
});

export const SearchGuestsQuerySchema = z.object({
  venueId: z.string().describe("Venue ID to search within"),
  query: z.string().describe("Search term (matches name, email, or phone)").optional(),
  tags: z.string().describe("Comma-separated tags to filter by").optional(),
  hasNotVisitedInDays: z
    .string()
    .describe("Filter guests who haven't visited in X days")
    .optional(),
});

export const GuestSegmentsQuerySchema = z.object({
  venueId: z.string().describe("Venue ID to get segments for"),
});

export const CreateGuestBodySchema = z.object({
  venueId: z.string().describe("Venue ID"),
  email: z.email().describe("Guest email").optional(),
  phone: z.string().describe("Guest phone").optional(),
  name: z.string().describe("Guest name"),
  notes: z.string().describe("Internal notes").optional(),
  tags: z.array(z.string()).describe("Tags for categorization").optional(),
  dietaryRestrictions: z
    .array(z.string())
    .describe("Dietary restrictions (e.g. gluten-free, vegan, nut-allergy)")
    .optional(),
});

export const FindOrCreateGuestBodySchema = z.object({
  venueId: z.string().describe("Venue ID"),
  email: z.email().describe("Guest email (used for matching)").optional(),
  phone: z.string().describe("Guest phone (used for matching if email not found)").optional(),
  name: z.string().describe("Guest name"),
  dietaryRestrictions: z
    .array(z.string())
    .describe("Dietary restrictions to merge with existing guest profile")
    .optional(),
});

export const UpdateGuestBodySchema = z.object({
  email: z.email().nullable().optional(),
  phone: z.string().nullable().optional(),
  name: z.string().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  dietaryRestrictions: z
    .array(z.string())
    .nullable()
    .describe("Dietary restrictions (replaces existing list)")
    .optional(),
});

export const AddGuestNoteBodySchema = z.object({
  text: z.string().min(1).describe("Note text"),
});

export const LapsingGuestsQuerySchema = z.object({
  venueId: z.string().describe("Venue ID to scan"),
});

// ── Holds (routes/holds.ts) ───────────────────────────────────
export const CreateHoldBodySchema = z.object({
  venueId: z.string().describe("Venue ID"),
  date: z.iso.date().describe("Reservation date (YYYY-MM-DD)"),
  time: z.iso.datetime({ offset: true }).describe("Start time in ISO 8601 format"),
  partySize: z.number().int().min(1).max(20).describe("Number of guests"),
  tableId: z
    .string()
    .describe(
      "Optional specific table to hold. If not provided, best available table is assigned."
    )
    .optional(),
  holdDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(60)
    .describe("Override hold duration in minutes. Defaults to venue setting or 10 minutes.")
    .optional(),
});

export const ConfirmHoldBodySchema = z.object({
  guestName: z.string().describe("Guest name").optional(),
  guestEmail: z.email().describe("Guest email").optional(),
  guestPhone: z.string().describe("Guest phone number").optional(),
  guestId: z.string().describe("ID of existing guest record").optional(),
  notes: z.string().describe("Special requests or notes").optional(),
});

// ── Deposits (routes/deposits.ts) ─────────────────────────────
export const CreateDepositBodySchema = z.object({
  reservationId: z.string().describe("ID of the reservation"),
  amountCents: z.number().int().min(1).describe("Deposit amount in cents"),
  currency: z.string().default("usd").describe("ISO currency code"),
});

// ── Tables (routes/tables.ts) ─────────────────────────────────
export const ListTablesQuerySchema = z.object({
  page: z.string().default("1").describe("Page number (1-indexed)"),
  limit: z.string().default("10").describe("Number of tables per page (max 100)"),
  activeOnly: z
    .enum(["true", "false"])
    .default("false")
    .describe("Filter to only active tables"),
});

export const CreateTableBodySchema = z.object({
  name: z.string().describe("Unique table name (e.g., 'Table 1', 'Patio A')"),
  capacity: z.number().int().min(1).describe("Maximum number of guests the table can seat"),
  location: z.string().describe("Location description (e.g., 'Main Floor', 'Patio')").optional(),
  venueId: z.string().describe("ID of the venue this table belongs to").optional(),
}).describe("Table creation payload");

export const UpdateTableBodySchema = z.object({
  name: z.string().describe("New table name").optional(),
  capacity: z.number().int().min(1).describe("New capacity").optional(),
  location: z.string().describe("New location description").optional(),
  isActive: z
    .boolean()
    .describe("Whether the table is active and available for reservations")
    .optional(),
}).describe("Fields to update");

export const UpdateTableStatusBodySchema = z.object({
  status: TableStatusSchema.describe("New table status"),
}).describe("Table status update payload");

// ── Venues (routes/venues.ts) ─────────────────────────────────
export const ListVenueGroupsQuerySchema = z.object({
  page: z.string().default("1").describe("Page number (1-indexed)"),
  limit: z.string().default("10").describe("Number of groups per page (max 100)"),
});

export const CreateVenueGroupBodySchema = z.object({
  name: z.string().describe("Venue group name"),
  slug: z.string().describe("URL-friendly identifier (must be unique)"),
  settings: JsonObjectSchema.describe("Shared settings for all venues in the group").optional(),
}).describe("Venue group creation payload");

export const UpdateVenueGroupBodySchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  settings: JsonObjectSchema.optional(),
}).describe("Fields to update");

export const ListVenuesQuerySchema = z.object({
  page: z.string().default("1").describe("Page number (1-indexed)"),
  limit: z.string().default("10").describe("Number of venues per page (max 100)"),
  venueGroupId: z.string().describe("Filter venues by venue group ID").optional(),
});

export const CreateVenueBodySchema = z.object({
  venueGroupId: z.string().describe("ID of the venue group this venue belongs to").optional(),
  name: z.string().describe("Venue name"),
  slug: z.string().describe("URL-friendly identifier for public booking URLs (must be unique)"),
  ianaTimezone: z.string().describe("IANA timezone identifier (e.g., 'America/Los_Angeles')"),
  currencyCode: z.string().default("USD").describe("ISO 4217 currency code"),
  operatingHours: JsonObjectSchema.describe("Weekly operating schedule").optional(),
  settings: JsonObjectSchema.describe("Venue-specific settings").optional(),
}).describe("Venue creation payload");

export const UpdateVenueBodySchema = z
  .object({
    venueGroupId: z.string().nullable().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
    ianaTimezone: z.string().optional(),
    currencyCode: z.string().optional(),
    operatingHours: JsonObjectSchema.nullable().optional(),
    settings: JsonObjectSchema.nullable().optional(),
  })
  .describe("Fields to update");

// ── Waitlist (routes/waitlist.ts) ─────────────────────────────
export const CreateWaitlistBodySchema = z.object({
  venueId: z.string(),
  partySize: z.number().int().min(1),
  guestName: z.string(),
  guestPhone: z.string(),
  avgTurnTimeMinutes: z.number().int().min(1).optional(),
});

export const ListWaitlistQuerySchema = z.object({
  venueId: z.string(),
});

// ── Public booking widget (routes/public-*.ts) ────────────────
export const PublicAvailabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  partySize: z.string(),
});

export const PublicDepositBodySchema = z.object({
  reservationId: z.string().min(1),
  guestEmail: z.string().optional(),
  guestName: z.string().optional(),
});

export const PublicGuestRecognitionQuerySchema = z.object({
  email: z.email(),
});

export const PublicGuestRiskQuerySchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const PublicHoldBodySchema = z.object({
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  partySize: z.number().int().min(1).max(20),
});

export const PublicReservationBodySchema = z.object({
  holdId: z.string().min(1),
  guestName: z.string().min(1),
  guestEmail: z.string().min(1),
  guestPhone: z.string().optional(),
  specialRequests: z.string().optional(),
});

export const PublicUnsubscribeQuerySchema = z.object({
  token: z.string().optional(),
});

export const PublicWaitlistBodySchema = z.object({
  venueId: z.string(),
  partySize: z.number().int().min(1),
  guestName: z.string(),
  guestPhone: z.string(),
});
