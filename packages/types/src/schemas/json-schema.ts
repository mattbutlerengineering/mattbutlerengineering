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
import { VenueGroupSchema, VenueSchema } from "./venue.js";
import { GuestSchema, GuestSegmentSchema } from "./guest.js";
import { ProblemDetailsSchema } from "./api.js";
import {
  PaginationSchema,
  ErrorResponseSchema,
} from "./common.js";

/**
 * Recursively strip `additionalProperties` from a JSON Schema object.
 *
 * Zod 4's `toJSONSchema` emits `additionalProperties: false` for objects,
 * but Fastify response schemas should remain open (the old hand-written
 * schemas never restricted additional properties).
 */
function stripAdditionalProperties(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "additionalProperties") continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripAdditionalProperties(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? stripAdditionalProperties(item as Record<string, unknown>)
          : item,
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

// ── User schemas ──────────────────────────────────────────────
export const userPreferencesJsonSchema = toFastifyJsonSchema(
  "UserPreferences",
  UserPreferencesSchema,
);

export const userJsonSchema = toFastifyJsonSchema("User", UserSchema);

// ── Reservation schemas ───────────────────────────────────────
export const tableShapeMetadataJsonSchema = toFastifyJsonSchema(
  "TableShapeMetadata",
  TableShapeMetadataSchema,
);

export const tableJsonSchema = toFastifyJsonSchema("Table", TableSchema);

export const reservationJsonSchema = toFastifyJsonSchema(
  "Reservation",
  ReservationSchema,
);

// ── Venue schemas ─────────────────────────────────────────────
export const venueGroupJsonSchema = toFastifyJsonSchema(
  "VenueGroup",
  VenueGroupSchema,
);

export const venueJsonSchema = toFastifyJsonSchema("Venue", VenueSchema);

// ── Guest schemas ─────────────────────────────────────────────
export const guestJsonSchema = toFastifyJsonSchema("Guest", GuestSchema);

export const guestSegmentJsonSchema = toFastifyJsonSchema(
  "GuestSegment",
  GuestSegmentSchema,
);

// ── Floor plan schemas ────────────────────────────────────────
export const floorPlanLayoutJsonSchema = toFastifyJsonSchema(
  "FloorPlanLayout",
  FloorPlanLayoutSchema,
);

export const floorPlanJsonSchema = toFastifyJsonSchema(
  "FloorPlan",
  FloorPlanSchema,
);

// ── Agent schemas ─────────────────────────────────────────────
export const sessionJsonSchema = toFastifyJsonSchema(
  "Session",
  AgentSessionSchema,
);

export const sessionEventJsonSchema = toFastifyJsonSchema(
  "SessionEvent",
  AgentSessionEventSchema,
);

export const createSessionBodyJsonSchema = toFastifyJsonSchema(
  "CreateSessionBody",
  CreateAgentSessionRequestSchema,
);

// ── Shared schemas ────────────────────────────────────────────
export const paginationJsonSchema = toFastifyJsonSchema(
  "Pagination",
  PaginationSchema,
);

export const errorJsonSchema = toFastifyJsonSchema(
  "Error",
  ErrorResponseSchema,
);

export const problemDetailsJsonSchema = toFastifyJsonSchema(
  "ProblemDetails",
  ProblemDetailsSchema,
);
