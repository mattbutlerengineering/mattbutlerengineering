import type { FastifyInstance } from "fastify";

export const TableShapeMetadataSchema = {
  $id: "TableShapeMetadata",
  type: "object",
  description: "Position and shape metadata for a table on a floor plan canvas",
  required: ["x", "y", "width", "height", "shape"],
  properties: {
    x: {
      type: "number",
      description: "X coordinate on the canvas",
    },
    y: {
      type: "number",
      description: "Y coordinate on the canvas",
    },
    width: {
      type: "number",
      description: "Width of the table shape",
    },
    height: {
      type: "number",
      description: "Height of the table shape",
    },
    rotation: {
      type: "number",
      description: "Rotation angle in degrees",
    },
    shape: {
      type: "string",
      enum: ["rectangle", "circle", "square"],
      description: "Shape of the table",
    },
    color: {
      type: "string",
      description: "Color of the table on the floor plan",
    },
  },
} as const;

export const TableSchema = {
  $id: "Table",
  type: "object",
  description: "A table available for reservations",
  required: ["id", "name", "capacity", "minCovers", "isActive", "priority", "createdAt", "updatedAt"],
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
    tableNumber: {
      type: "string",
      nullable: true,
      description: "Human-readable table number (e.g., '41', '42B')",
      example: "41",
    },
    capacity: {
      type: "integer",
      description: "Maximum number of guests the table can seat",
      example: 4,
    },
    minCovers: {
      type: "integer",
      description: "Minimum party size for this table",
      example: 1,
    },
    maxCovers: {
      type: "integer",
      nullable: true,
      description: "Maximum party size (null means same as capacity)",
      example: 6,
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
    priority: {
      type: "integer",
      description: "Priority for auto-assignment (higher = preferred)",
      example: 0,
    },
    status: {
      type: "string",
      enum: ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"],
      description: "Current operational status of the table",
      example: "AVAILABLE",
    },
    venueId: {
      type: "string",
      nullable: true,
      description: "ID of the venue this table belongs to",
      example: "venue-123",
    },
    floorPlanId: {
      type: "string",
      nullable: true,
      description: "ID of the floor plan this table is placed on",
      example: "floor-plan-123",
    },
    shapeMetadata: {
      oneOf: [{ $ref: "TableShapeMetadata#" }, { type: "null" }],
      description: "Position and shape on the floor plan canvas",
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
    cancellationReason: {
      type: "string",
      nullable: true,
      description: "Reason for cancellation",
      example: "no_show",
    },
    cancellationNote: {
      type: "string",
      nullable: true,
      description: "Additional cancellation notes",
      example: "Guest did not arrive",
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

export const VenueGroupSchema = {
  $id: "VenueGroup",
  type: "object",
  description: "A group of venues under common ownership/management",
  required: ["id", "name", "slug", "createdAt"],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the venue group",
      example: "clx1234567890abcdef",
    },
    name: {
      type: "string",
      description: "Venue group name",
      example: "Downtown Restaurant Group",
    },
    slug: {
      type: "string",
      description: "URL-friendly identifier",
      example: "downtown-restaurant-group",
    },
    settings: {
      type: "object",
      nullable: true,
      description: "Shared settings for all venues in the group",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the venue group was created",
      example: "2024-01-15T10:30:00.000Z",
    },
  },
} as const;

export const VenueSchema = {
  $id: "Venue",
  type: "object",
  description: "A venue (restaurant, bar, etc.) that accepts reservations",
  required: ["id", "name", "slug", "ianaTimezone", "currencyCode", "createdAt", "updatedAt"],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the venue",
      example: "clx1234567890abcdef",
    },
    venueGroupId: {
      type: "string",
      nullable: true,
      description: "ID of the venue group this venue belongs to",
      example: "clx9876543210fedcba",
    },
    venueGroup: {
      $ref: "VenueGroup#",
      description: "The venue group (included when fetching venues)",
    },
    name: {
      type: "string",
      description: "Venue name",
      example: "Chez Panisse",
    },
    slug: {
      type: "string",
      description: "URL-friendly identifier for public booking URLs",
      example: "chez-panisse",
    },
    ianaTimezone: {
      type: "string",
      description: "IANA timezone identifier",
      example: "America/Los_Angeles",
    },
    currencyCode: {
      type: "string",
      description: "ISO 4217 currency code",
      example: "USD",
    },
    operatingHours: {
      type: "object",
      nullable: true,
      description: "Weekly operating schedule",
      properties: {
        monday: { $ref: "#/properties/daySchedule" },
        tuesday: { $ref: "#/properties/daySchedule" },
        wednesday: { $ref: "#/properties/daySchedule" },
        thursday: { $ref: "#/properties/daySchedule" },
        friday: { $ref: "#/properties/daySchedule" },
        saturday: { $ref: "#/properties/daySchedule" },
        sunday: { $ref: "#/properties/daySchedule" },
      },
    },
    daySchedule: {
      type: "object",
      properties: {
        open: { type: "string", example: "09:00" },
        close: { type: "string", example: "22:00" },
        closed: { type: "boolean" },
      },
    },
    settings: {
      type: "object",
      nullable: true,
      description: "Venue-specific settings and feature flags",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the venue was created",
      example: "2024-01-15T10:30:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the venue was last updated",
      example: "2024-01-20T14:45:00.000Z",
    },
  },
} as const;

export const GuestSchema = {
  $id: "Guest",
  type: "object",
  description: "A guest who makes reservations at a venue",
  required: ["id", "venueId", "name", "visitCount", "createdAt", "updatedAt"],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the guest",
      example: "clx1234567890abcdef",
    },
    venueId: {
      type: "string",
      description: "ID of the venue this guest belongs to",
      example: "venue-123",
    },
    email: {
      type: "string",
      format: "email",
      nullable: true,
      description: "Guest email address",
      example: "john@example.com",
    },
    phone: {
      type: "string",
      nullable: true,
      description: "Guest phone number",
      example: "+1-555-123-4567",
    },
    name: {
      type: "string",
      description: "Guest name",
      example: "John Doe",
    },
    notes: {
      type: "string",
      nullable: true,
      description: "Internal notes about the guest",
      example: "Prefers window seating, allergic to shellfish",
    },
    visitCount: {
      type: "integer",
      description: "Number of completed visits",
      example: 5,
    },
    lifetimeSpend: {
      type: "string",
      nullable: true,
      description: "Total amount spent (as decimal string)",
      example: "1250.00",
    },
    lastVisit: {
      type: "string",
      format: "date-time",
      nullable: true,
      description: "Date of last completed visit",
      example: "2024-01-15T19:00:00.000Z",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      nullable: true,
      description: "Tags for categorization",
      example: ["VIP", "Birthday Club"],
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the guest was created",
      example: "2024-01-15T10:30:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the guest was last updated",
      example: "2024-01-20T14:45:00.000Z",
    },
  },
} as const;

export const GuestSegmentSchema = {
  $id: "GuestSegment",
  type: "object",
  description: "A segment of guests based on behavior",
  required: ["name", "description", "count"],
  properties: {
    name: {
      type: "string",
      description: "Segment name",
      example: "VIP",
    },
    description: {
      type: "string",
      description: "What defines this segment",
      example: "Guests with 5+ visits",
    },
    count: {
      type: "integer",
      description: "Number of guests in this segment",
      example: 42,
    },
  },
} as const;

export const FloorPlanLayoutSchema = {
  $id: "FloorPlanLayout",
  type: "object",
  description: "Layout configuration for a floor plan canvas",
  required: ["width", "height"],
  properties: {
    width: {
      type: "number",
      description: "Canvas width in pixels",
    },
    height: {
      type: "number",
      description: "Canvas height in pixels",
    },
    backgroundImage: {
      type: "string",
      description: "URL of the background image (e.g., architectural drawing)",
    },
    gridSize: {
      type: "number",
      description: "Grid size for snapping in pixels",
    },
    showGrid: {
      type: "boolean",
      description: "Whether to display the grid",
    },
  },
} as const;

export const FloorPlanSchema = {
  $id: "FloorPlan",
  type: "object",
  description: "A floor plan representing a physical layout of tables",
  required: ["id", "venueId", "name", "isActive", "layoutJson", "createdAt", "updatedAt"],
  properties: {
    id: {
      type: "string",
      description: "Unique identifier for the floor plan",
      example: "clx1234567890abcdef",
    },
    venueId: {
      type: "string",
      description: "ID of the venue this floor plan belongs to",
      example: "venue-123",
    },
    name: {
      type: "string",
      description: "Floor plan name (e.g., 'Main Dining', 'Patio')",
      example: "Main Dining",
    },
    isActive: {
      type: "boolean",
      description: "Whether this is the active floor plan for the venue",
      example: true,
    },
    layoutJson: {
      $ref: "FloorPlanLayout#",
      description: "Canvas layout configuration",
    },
    tables: {
      type: "array",
      items: { $ref: "Table#" },
      description: "Tables placed on this floor plan",
    },
    createdAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the floor plan was created",
      example: "2024-01-15T10:30:00.000Z",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      description: "Timestamp when the floor plan was last updated",
      example: "2024-01-20T14:45:00.000Z",
    },
  },
} as const;

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
