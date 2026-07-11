import type { FastifyInstance } from "fastify";
import {
  tableShapeMetadataJsonSchema,
  tableJsonSchema,
  reservationJsonSchema,
  paginationJsonSchema,
  problemDetailsJsonSchema,
  venueGroupJsonSchema,
  venueJsonSchema,
  guestJsonSchema,
  guestSegmentJsonSchema,
  floorPlanLayoutJsonSchema,
  floorPlanJsonSchema,
} from "@mbe/types";

// Re-export the derived JSON Schemas so existing imports continue to work.
export const TableShapeMetadataSchema = tableShapeMetadataJsonSchema;
export const TableSchema = tableJsonSchema;
export const ReservationSchema = reservationJsonSchema;
export const PaginationSchema = paginationJsonSchema;
// RFC 7807 problem-details (ADR-008) registered under the legacy "Error" $id so
// existing `$ref: "Error#"` response refs keep resolving; the wire shape is now
// RFC 7807 only, not the legacy { error, message, statusCode } envelope.
export const ErrorSchema = { ...problemDetailsJsonSchema, $id: "Error" } as const;
export const VenueGroupSchema = venueGroupJsonSchema;
export const VenueSchema = venueJsonSchema;
export const GuestSchema = guestJsonSchema;
export const GuestSegmentSchema = guestSegmentJsonSchema;
export const FloorPlanLayoutSchema = floorPlanLayoutJsonSchema;
export const FloorPlanSchema = floorPlanJsonSchema;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(TableShapeMetadataSchema);
  fastify.addSchema(TableSchema);
  fastify.addSchema(ReservationSchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
  fastify.addSchema(VenueGroupSchema);
  fastify.addSchema(VenueSchema);
  fastify.addSchema(GuestSchema);
  fastify.addSchema(GuestSegmentSchema);
  fastify.addSchema(FloorPlanLayoutSchema);
  fastify.addSchema(FloorPlanSchema);
}
