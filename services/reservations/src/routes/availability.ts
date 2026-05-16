import type { FastifyPluginAsync } from "fastify";
import type {
  TimeSlot,
  DateAvailability,
  ApiResponse,
  ApiError,
} from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { availabilityService } from "../services/availability.js";
import { venueService } from "../services/venue.js";

// Schema for TimeSlot
const TimeSlotSchema = {
  $id: "TimeSlot",
  type: "object",
  description: "An available time slot for a reservation",
  required: ["time", "available"],
  properties: {
    time: {
      type: "string",
      format: "date-time",
      description: "The start time of the slot in ISO 8601 format",
    },
    available: {
      type: "boolean",
      description: "Whether this slot has any available tables",
    },
    tables: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          capacity: { type: "integer" },
          minCovers: { type: "integer" },
          maxCovers: { type: "integer", nullable: true },
        },
      },
      description: "Available tables for this slot (only included if available)",
    },
  },
} as const;

// Schema for DateAvailability
const DateAvailabilitySchema = {
  $id: "DateAvailability",
  type: "object",
  description: "Availability summary for a specific date",
  required: ["date", "hasAvailability"],
  properties: {
    date: {
      type: "string",
      format: "date",
      description: "The date in YYYY-MM-DD format",
    },
    hasAvailability: {
      type: "boolean",
      description: "Whether any time slots are available on this date",
    },
    slotCount: {
      type: "integer",
      description: "Number of available time slots",
    },
  },
} as const;

export const availabilityRoutes: FastifyPluginAsync = async (fastify) => {
  // Register schemas
  fastify.addSchema(TimeSlotSchema);
  fastify.addSchema(DateAvailabilitySchema);

  // GET /:venueId - Get available time slots for a date
  fastify.get<{
    Params: { venueId: string };
    Querystring: { date: string; partySize: string; duration?: string };
    Reply: ApiResponse<TimeSlot[]> | ApiError;
  }>(
    "/:venueId",
    {
      schema: {
        summary: "Get available time slots",
        operationId: "getAvailability",
        description:
          "Get all available time slots for a venue on a specific date for a given party size.",
        tags: ["Availability"],
        params: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: {
              type: "string",
              description: "The venue ID",
            },
          },
        },
        querystring: {
          type: "object",
          required: ["date", "partySize"],
          properties: {
            date: {
              type: "string",
              format: "date",
              description: "Date in YYYY-MM-DD format",
            },
            partySize: {
              type: "string",
              description: "Number of guests",
            },
            duration: {
              type: "string",
              description: "Optional duration override in minutes",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "TimeSlot#" },
              },
            },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.params;
      const { date, partySize, duration } = request.query;

      // Validate venue exists
      const venue = await venueService.getById(venueId);
      if (!venue) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", "Invalid date format. Use YYYY-MM-DD."));
      }

      const partySizeNum = parseInt(partySize, 10);
      if (isNaN(partySizeNum) || partySizeNum < 1) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", "Invalid party size. Must be a positive integer."));
      }

      const durationNum = duration ? parseInt(duration, 10) : undefined;
      if (duration && (isNaN(durationNum!) || durationNum! < 15)) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", "Invalid duration. Must be at least 15 minutes."));
      }

      const slots = await availabilityService.generateTimeSlots(
        venueId,
        date,
        partySizeNum,
        durationNum
      );

      return { data: slots };
    }
  );

  // GET /:venueId/dates - Get dates with availability in a range
  fastify.get<{
    Params: { venueId: string };
    Querystring: { startDate: string; endDate: string; partySize: string };
    Reply: ApiResponse<DateAvailability[]> | ApiError;
  }>(
    "/:venueId/dates",
    {
      schema: {
        summary: "Get dates with availability",
        operationId: "getAvailableDates",
        description:
          "Get a list of dates with availability in a date range. Useful for calendar displays.",
        tags: ["Availability"],
        params: {
          type: "object",
          required: ["venueId"],
          properties: {
            venueId: {
              type: "string",
              description: "The venue ID",
            },
          },
        },
        querystring: {
          type: "object",
          required: ["startDate", "endDate", "partySize"],
          properties: {
            startDate: {
              type: "string",
              format: "date",
              description: "Start date in YYYY-MM-DD format",
            },
            endDate: {
              type: "string",
              format: "date",
              description: "End date in YYYY-MM-DD format",
            },
            partySize: {
              type: "string",
              description: "Number of guests",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "DateAvailability#" },
              },
            },
          },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const { venueId } = request.params;
      const { startDate, endDate, partySize } = request.query;

      // Validate venue exists
      const venue = await venueService.getById(venueId);
      if (!venue) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Venue not found"));
      }

      // Validate date formats
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", "Invalid date format. Use YYYY-MM-DD."));
      }

      // Validate date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", "startDate must be before or equal to endDate."));
      }

      const partySizeNum = parseInt(partySize, 10);
      if (isNaN(partySizeNum) || partySizeNum < 1) {
        return reply.code(400).send(createProblemDetails(400, "Bad Request", "Invalid party size. Must be a positive integer."));
      }

      const dates = await availabilityService.getAvailableDates(
        venueId,
        startDate,
        endDate,
        partySizeNum
      );

      return { data: dates };
    }
  );
};
