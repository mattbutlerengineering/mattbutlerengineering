import type { FastifyInstance } from "fastify";

export const TableSchema = {
  $id: "Table",
  type: "object",
  description: "A table available for reservations",
  required: ["id", "name", "capacity", "isActive", "createdAt", "updatedAt"],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the table",
      example: "clx1234567890abcdef",
    },
    name: {
      type: "string",
      description: "Table name or number",
      example: "Table 1",
    },
    capacity: {
      type: "integer",
      description: "Maximum number of guests the table can seat",
      example: 4,
    },
    location: {
      type: "string",
      nullable: true,
      description: "Location description",
      example: "Main Floor",
    },
    isActive: {
      type: "boolean",
      description: "Whether the table is active and available for reservations",
      example: true,
    },
    venueId: {
      type: "string",
      nullable: true,
      description: "ID of the venue this table belongs to",
      example: "venue-123",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the table was created",
      example: "2024-01-15T10:30:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the table was last updated",
      example: "2024-01-20T14:45:00.000Z",
    },
  },
} as const;

export const ReservationSchema = {
  $id: "Reservation",
  type: "object",
  description: "A reservation for a table",
  required: [
    "id",
    "date",
    "startTime",
    "endTime",
    "partySize",
    "status",
    "tableId",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the reservation",
      example: "clx1234567890abcdef",
    },
    date: {
      type: "string",
      format: "date",
      description: "Reservation date (YYYY-MM-DD)",
      example: "2024-02-15",
    },
    startTime: {
      type: "string",
      format: "date-time",
      description: "Reservation start time",
      example: "2024-02-15T18:00:00.000Z",
    },
    endTime: {
      type: "string",
      format: "date-time",
      description: "Reservation end time",
      example: "2024-02-15T20:00:00.000Z",
    },
    partySize: {
      type: "integer",
      description: "Number of guests",
      example: 4,
    },
    status: {
      type: "string",
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
      description: "Current reservation status",
      example: "CONFIRMED",
    },
    notes: {
      type: "string",
      nullable: true,
      description: "Special requests or notes",
      example: "Birthday celebration, need high chair",
    },
    guestName: {
      type: "string",
      nullable: true,
      description: "Guest name (for unauthenticated reservations)",
      example: "John Doe",
    },
    guestEmail: {
      type: "string",
      format: "email",
      nullable: true,
      description: "Guest email",
      example: "john@example.com",
    },
    guestPhone: {
      type: "string",
      nullable: true,
      description: "Guest phone number",
      example: "+1-555-123-4567",
    },
    userId: {
      type: "string",
      nullable: true,
      description: "User ID (for authenticated reservations)",
      example: "auth0|user123",
    },
    tableId: {
      type: "string",
      description: "ID of the reserved table",
      example: "clx1234567890abcdef",
    },
    table: {
      $ref: "Table#",
      description: "The reserved table (included when fetching reservations)",
    },
    venueId: {
      type: "string",
      nullable: true,
      description: "ID of the venue for this reservation (denormalized for queries)",
      example: "venue-123",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the reservation was created",
      example: "2024-01-15T10:30:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the reservation was last updated",
      example: "2024-01-20T14:45:00.000Z",
    },
  },
} as const;

export const PaginationSchema = {
  $id: "Pagination",
  type: "object",
  description: "Pagination metadata for list responses",
  required: ["page", "limit", "total", "totalPages", "hasNext", "hasPrev"],
  properties: {
    page: {
      type: "number",
      description: "Current page number (1-indexed)",
      example: 1,
    },
    limit: {
      type: "number",
      description: "Number of items per page",
      example: 10,
    },
    total: {
      type: "number",
      description: "Total number of items across all pages",
      example: 42,
    },
    totalPages: {
      type: "number",
      description: "Total number of pages",
      example: 5,
    },
    hasNext: {
      type: "boolean",
      description: "Whether there is a next page",
      example: true,
    },
    hasPrev: {
      type: "boolean",
      description: "Whether there is a previous page",
      example: false,
    },
  },
} as const;

export const ErrorSchema = {
  $id: "Error",
  type: "object",
  description: "Standard error response",
  required: ["error", "message", "statusCode"],
  properties: {
    error: {
      type: "string",
      description: "Error type or category",
      example: "Not Found",
    },
    message: {
      type: "string",
      description: "Human-readable error message",
      example: "Reservation not found",
    },
    statusCode: {
      type: "number",
      description: "HTTP status code",
      example: 404,
    },
  },
} as const;

export function registerSchemas(fastify: FastifyInstance) {
  fastify.addSchema(TableSchema);
  fastify.addSchema(ReservationSchema);
  fastify.addSchema(PaginationSchema);
  fastify.addSchema(ErrorSchema);
}
