import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, ReservationHold } from "@mbe/types";
import { randomUUID } from "crypto";
import { venueService } from "../services/venue.js";
import { holdService } from "../services/hold.js";
import { emitHoldCreated } from "../services/events.js";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import {
  getActiveHoldCount,
  incrementHoldCount,
  decrementHoldCount,
  MAX_ACTIVE_HOLDS,
} from "../middleware/public-rate-limit.js";

export const publicHoldRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Params: { slug: string };
    Body: { date: string; time: string; partySize: number };
    Reply: ApiResponse<ReservationHold>;
  }>(
    "/:slug/holds",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Create a reservation hold (public)",
        tags: ["Public"],
        body: {
          type: "object",
          required: ["date", "time", "partySize"],
          properties: {
            date: { type: "string", format: "date", description: "Reservation date (YYYY-MM-DD)" },
            time: {
              type: "string",
              format: "date-time",
              description: "Start time in ISO 8601 format",
            },
            partySize: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { date, time, partySize } = request.body;
      const ip = request.ip;

      if (getActiveHoldCount(ip) >= MAX_ACTIVE_HOLDS) {
        return reply.status(429).send({
          type: "https://httpproblems.com/http-status/429",
          title: "Too Many Holds",
          status: 429,
          detail: `Maximum ${MAX_ACTIVE_HOLDS} active holds per session.`,
        } as never);
      }

      const venue = await venueService.getBySlug(slug);
      if (!venue) {
        return reply.status(404).send({
          type: "https://httpproblems.com/http-status/404",
          title: "Venue Not Found",
          status: 404,
          detail: `No venue found with slug '${slug}'.`,
        } as never);
      }

      const sessionId = randomUUID();
      const result = await holdService.create(
        { venueId: venue.id, date, time, partySize },
        sessionId
      );

      if (!result.success) {
        return reply.status(409).send({
          type: "https://httpproblems.com/http-status/409",
          title: "Slot Unavailable",
          status: 409,
          detail: result.error ?? "The requested time slot is no longer available.",
        } as never);
      }

      incrementHoldCount(ip);

      // Fire SSE event for staff timeline visibility
      emitHoldCreated(result.hold!);

      return reply.status(201).send({ data: result.hold! });
    }
  );

  fastify.delete<{
    Params: { slug: string; holdId: string };
  }>(
    "/:slug/holds/:holdId",
    {
      schema: {
        summary: "Release a reservation hold (public)",
        tags: ["Public"],
      },
    },
    async (request, reply) => {
      const { holdId } = request.params;
      const ip = request.ip;

      const released = await holdService.releasePublic(holdId);
      if (released) {
        decrementHoldCount(ip);
      }

      return reply.status(204).send();
    }
  );
};
