/**
 * JSON Schema derived from Zod schemas — single source of truth.
 *
 * Services import these for Fastify schema registration instead of
 * maintaining hand-written JSON Schema that can drift from Zod.
 */
import { toJSONSchema, type ZodType } from "zod";

import { UserPreferencesSchema, UserSchema } from "./user.js";
import { ReservationSchema } from "./reservation.js";
import {
  TableSchema,
  TableShapeMetadataSchema,
  FloorPlanLayoutSchema,
  FloorPlanSchema,
} from "./floor-plan.js";
import {
  AgentSessionSchema,
  AgentSessionEventSchema,
  CreateAgentSessionRequestSchema,
} from "./agent.js";
import { VenueGroupSchema, VenueSchema, PublicVenueConfigSchema } from "./venue.js";
import {
  GuestSchema,
  GuestSegmentSchema,
  GuestRiskResultSchema,
  GuestRecognitionSchema,
} from "./guest.js";
import { WaitlistJoinResultSchema } from "./waitlist.js";
import { ProblemDetailsSchema } from "./api.js";
import { PaginationSchema, ErrorResponseSchema } from "./common.js";
import {
  ListReservationsQuerySchema,
  ListMyReservationsQuerySchema,
  WalkInBodySchema,
  CreateReservationBodySchema,
  UpdateReservationBodySchema,
  AvailabilityQuerySchema,
  AvailabilityDatesQuerySchema,
  BriefingQuerySchema,
  EventsStreamQuerySchema,
  TestEventBodySchema,
  ListFloorPlansQuerySchema,
  CreateFloorPlanBodySchema,
  UpdateFloorPlanBodySchema,
  UpdateTablePositionsBodySchema,
  AssignTableBodySchema,
  ListGuestsQuerySchema,
  SearchGuestsQuerySchema,
  GuestSegmentsQuerySchema,
  CreateGuestBodySchema,
  FindOrCreateGuestBodySchema,
  UpdateGuestBodySchema,
  AddGuestNoteBodySchema,
  LapsingGuestsQuerySchema,
  CreateHoldBodySchema,
  ConfirmHoldBodySchema,
  CreateDepositBodySchema,
  ListTablesQuerySchema,
  CreateTableBodySchema,
  UpdateTableBodySchema,
  UpdateTableStatusBodySchema,
  ListVenueGroupsQuerySchema,
  CreateVenueGroupBodySchema,
  UpdateVenueGroupBodySchema,
  ListVenuesQuerySchema,
  CreateVenueBodySchema,
  UpdateVenueBodySchema,
  CreateWaitlistBodySchema,
  ListWaitlistQuerySchema,
  PublicAvailabilityQuerySchema,
  PublicDepositBodySchema,
  PublicGuestRecognitionQuerySchema,
  PublicGuestRiskQuerySchema,
  PublicHoldBodySchema,
  PublicReservationBodySchema,
  PublicUnsubscribeQuerySchema,
  PublicWaitlistBodySchema,
} from "./reservation-requests.js";

/**
 * Recursively strip `additionalProperties` and `propertyNames` from a JSON Schema
 * object.
 *
 * Zod 4's `toJSONSchema` emits `additionalProperties: false` for objects and
 * `propertyNames` for `Record<string, unknown>` types. Both cause AJV strict mode
 * warnings and are unnecessary for Fastify response schemas (the old hand-written
 * schemas never restricted additional properties or property names).
 */
function stripAdditionalProperties(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "additionalProperties" || key === "propertyNames") continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripAdditionalProperties(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? stripAdditionalProperties(item as Record<string, unknown>)
          : item
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Convert a Zod schema to a Fastify-compatible JSON Schema with `$id`.
 *
 * Uses Zod 4's built-in `toJSONSchema` targeting JSON Schema draft-07
 * (Fastify's default), strips `$schema` and `additionalProperties`.
 */
function toFastifyJsonSchema(id: string, zodSchema: ZodType) {
  const raw = toJSONSchema(zodSchema, {
    target: "draft-07",
    unrepresentable: "any",
  });
  const cleaned = stripAdditionalProperties(raw as Record<string, unknown>);
  const { $schema: _, ...rest } = cleaned;
  return { $id: id, ...rest };
}

/**
 * Derive a Fastify request-schema (body / querystring) JSON Schema from a Zod
 * schema.
 *
 * Unlike {@link toFastifyJsonSchema} this deliberately omits `$id`: request
 * schemas are attached inline to a single route (and some — e.g. pagination
 * querystrings — are reused across routes), so a `$id` would either be dead
 * weight or trigger AJV "schema already exists" collisions on reuse.
 *
 * `additionalProperties` is stripped so request payloads stay permissive
 * (the previous hand-written schemas never restricted extra properties).
 * Querystring string values are coerced by Fastify's AJV (`coerceTypes`),
 * so query params modelled as `z.string()` keep arriving as strings while
 * `z.coerce.number()` fields derive to `type: "number"` and coerce on input.
 */
export function toRequestJsonSchema(zodSchema: ZodType): Record<string, unknown> {
  const raw = toJSONSchema(zodSchema, {
    target: "draft-07",
    unrepresentable: "any",
  });
  const cleaned = stripAdditionalProperties(raw as Record<string, unknown>);
  const { $schema: _schema, $id: _id, ...rest } = cleaned;
  return rest;
}

// ── User schemas ──────────────────────────────────────────────
export const userPreferencesJsonSchema = toFastifyJsonSchema(
  "UserPreferences",
  UserPreferencesSchema
);

export const userJsonSchema = toFastifyJsonSchema("User", UserSchema);

// ── Reservation schemas ───────────────────────────────────────
export const tableShapeMetadataJsonSchema = toFastifyJsonSchema(
  "TableShapeMetadata",
  TableShapeMetadataSchema
);

export const tableJsonSchema = toFastifyJsonSchema("Table", TableSchema);

export const reservationJsonSchema = toFastifyJsonSchema("Reservation", ReservationSchema);

// ── Venue schemas ─────────────────────────────────────────────
export const venueGroupJsonSchema = toFastifyJsonSchema("VenueGroup", VenueGroupSchema);

export const venueJsonSchema = toFastifyJsonSchema("Venue", VenueSchema);

export const publicVenueConfigJsonSchema = toFastifyJsonSchema(
  "PublicVenueConfig",
  PublicVenueConfigSchema
);

// ── Guest schemas ─────────────────────────────────────────────
export const guestJsonSchema = toFastifyJsonSchema("Guest", GuestSchema);

export const guestSegmentJsonSchema = toFastifyJsonSchema("GuestSegment", GuestSegmentSchema);

export const guestRiskResultJsonSchema = toFastifyJsonSchema(
  "GuestRiskResult",
  GuestRiskResultSchema
);

export const guestRecognitionJsonSchema = toFastifyJsonSchema(
  "GuestRecognition",
  GuestRecognitionSchema
);

// ── Waitlist schemas ──────────────────────────────────────────
export const waitlistJoinResultJsonSchema = toFastifyJsonSchema(
  "WaitlistJoinResult",
  WaitlistJoinResultSchema
);

// ── Floor plan schemas ────────────────────────────────────────
export const floorPlanLayoutJsonSchema = toFastifyJsonSchema(
  "FloorPlanLayout",
  FloorPlanLayoutSchema
);

export const floorPlanJsonSchema = toFastifyJsonSchema("FloorPlan", FloorPlanSchema);

// ── Agent schemas ─────────────────────────────────────────────
export const sessionJsonSchema = toFastifyJsonSchema("Session", AgentSessionSchema);

export const sessionEventJsonSchema = toFastifyJsonSchema("SessionEvent", AgentSessionEventSchema);

export const createSessionBodyJsonSchema = toFastifyJsonSchema(
  "CreateSessionBody",
  CreateAgentSessionRequestSchema
);

// ── Shared schemas ────────────────────────────────────────────
export const paginationJsonSchema = toFastifyJsonSchema("Pagination", PaginationSchema);

export const errorJsonSchema = toFastifyJsonSchema("Error", ErrorResponseSchema);

export const problemDetailsJsonSchema = toFastifyJsonSchema("ProblemDetails", ProblemDetailsSchema);

// ── Reservations-service request schemas (derived from Zod) ───
// Body / querystring JSON Schema for the reservations routes. `$id`-less so
// they can be attached inline (and reused) without AJV collisions.
export const listReservationsQueryJsonSchema = toRequestJsonSchema(ListReservationsQuerySchema);
export const listMyReservationsQueryJsonSchema = toRequestJsonSchema(ListMyReservationsQuerySchema);
export const walkInBodyJsonSchema = toRequestJsonSchema(WalkInBodySchema);
export const createReservationBodyJsonSchema = toRequestJsonSchema(CreateReservationBodySchema);
export const updateReservationBodyJsonSchema = toRequestJsonSchema(UpdateReservationBodySchema);

export const availabilityQueryJsonSchema = toRequestJsonSchema(AvailabilityQuerySchema);
export const availabilityDatesQueryJsonSchema = toRequestJsonSchema(AvailabilityDatesQuerySchema);

export const briefingQueryJsonSchema = toRequestJsonSchema(BriefingQuerySchema);

export const eventsStreamQueryJsonSchema = toRequestJsonSchema(EventsStreamQuerySchema);
export const testEventBodyJsonSchema = toRequestJsonSchema(TestEventBodySchema);

export const listFloorPlansQueryJsonSchema = toRequestJsonSchema(ListFloorPlansQuerySchema);
export const createFloorPlanBodyJsonSchema = toRequestJsonSchema(CreateFloorPlanBodySchema);
export const updateFloorPlanBodyJsonSchema = toRequestJsonSchema(UpdateFloorPlanBodySchema);
export const updateTablePositionsBodyJsonSchema = toRequestJsonSchema(
  UpdateTablePositionsBodySchema
);
export const assignTableBodyJsonSchema = toRequestJsonSchema(AssignTableBodySchema);

export const listGuestsQueryJsonSchema = toRequestJsonSchema(ListGuestsQuerySchema);
export const searchGuestsQueryJsonSchema = toRequestJsonSchema(SearchGuestsQuerySchema);
export const guestSegmentsQueryJsonSchema = toRequestJsonSchema(GuestSegmentsQuerySchema);
export const createGuestBodyJsonSchema = toRequestJsonSchema(CreateGuestBodySchema);
export const findOrCreateGuestBodyJsonSchema = toRequestJsonSchema(FindOrCreateGuestBodySchema);
export const updateGuestBodyJsonSchema = toRequestJsonSchema(UpdateGuestBodySchema);
export const addGuestNoteBodyJsonSchema = toRequestJsonSchema(AddGuestNoteBodySchema);
export const lapsingGuestsQueryJsonSchema = toRequestJsonSchema(LapsingGuestsQuerySchema);

export const createHoldBodyJsonSchema = toRequestJsonSchema(CreateHoldBodySchema);
export const confirmHoldBodyJsonSchema = toRequestJsonSchema(ConfirmHoldBodySchema);

export const createDepositBodyJsonSchema = toRequestJsonSchema(CreateDepositBodySchema);

export const listTablesQueryJsonSchema = toRequestJsonSchema(ListTablesQuerySchema);
export const createTableBodyJsonSchema = toRequestJsonSchema(CreateTableBodySchema);
export const updateTableBodyJsonSchema = toRequestJsonSchema(UpdateTableBodySchema);
export const updateTableStatusBodyJsonSchema = toRequestJsonSchema(UpdateTableStatusBodySchema);

export const listVenueGroupsQueryJsonSchema = toRequestJsonSchema(ListVenueGroupsQuerySchema);
export const createVenueGroupBodyJsonSchema = toRequestJsonSchema(CreateVenueGroupBodySchema);
export const updateVenueGroupBodyJsonSchema = toRequestJsonSchema(UpdateVenueGroupBodySchema);
export const listVenuesQueryJsonSchema = toRequestJsonSchema(ListVenuesQuerySchema);
export const createVenueBodyJsonSchema = toRequestJsonSchema(CreateVenueBodySchema);
export const updateVenueBodyJsonSchema = toRequestJsonSchema(UpdateVenueBodySchema);

export const createWaitlistBodyJsonSchema = toRequestJsonSchema(CreateWaitlistBodySchema);
export const listWaitlistQueryJsonSchema = toRequestJsonSchema(ListWaitlistQuerySchema);

export const publicAvailabilityQueryJsonSchema = toRequestJsonSchema(PublicAvailabilityQuerySchema);
export const publicDepositBodyJsonSchema = toRequestJsonSchema(PublicDepositBodySchema);
export const publicGuestRecognitionQueryJsonSchema = toRequestJsonSchema(
  PublicGuestRecognitionQuerySchema
);
export const publicGuestRiskQueryJsonSchema = toRequestJsonSchema(PublicGuestRiskQuerySchema);
export const publicHoldBodyJsonSchema = toRequestJsonSchema(PublicHoldBodySchema);
export const publicReservationBodyJsonSchema = toRequestJsonSchema(PublicReservationBodySchema);
export const publicUnsubscribeQueryJsonSchema = toRequestJsonSchema(PublicUnsubscribeQuerySchema);
export const publicWaitlistBodyJsonSchema = toRequestJsonSchema(PublicWaitlistBodySchema);
