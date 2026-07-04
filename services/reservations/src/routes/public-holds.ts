import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, ReservationHold } from "@mbe/types";
import { randomUUID } from "crypto";
import { venueService } from "../services/venue.js";
import { holdService } from "../services/hold.js";
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
    Body: { date: string; startTime: string; endTime: string; partySize: number };
    Reply: ApiResponse<ReservationHold>;
  }>(
    "/:slug/holds",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Create a reservation hold (public)",
        tags: ["Public"],
        params: {
          type: "object",
          required: ["slug"],
          properties: { slug: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["date", "startTime", "endTime", "partySize"],
          properties: {
            date: { type: "string", minLength: 1 },
            startTime: { type: "string", minLength: 1 },
            endTime: { type: "string", minLength: 1 },
            partySize: { type: "integer", minimum: 1, maximum: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { date, startTime, partySize } = request.body;
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
        { venueId: venue.id, date, time: startTime, partySize },
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
      return reply.status(201).send({ data: result.hold! });
    }
  );

  fastify.delete<{
    Params: { slug: string; holdId: string };
  }>(
    "/:slug/holds/:holdId",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Release a reservation hold (public)",
        tags: ["Public"],
      },
    },
    async (request, reply) => {
      const { holdId } = request.params;
      const ip = request.ip;

      // The high-entropy sessionId returned at hold creation is the caller's
      // capability token. Requiring it prevents one guest from releasing
      // another guest's hold — the hold id itself is a low-entropy, guessable
      // cuid and must not be treated as proof of ownership.
      const sessionId = request.headers["x-session-id"];
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        return reply.status(401).send({
          type: "https://httpproblems.com/http-status/401",
          title: "Unauthorized",
          status: 401,
          detail: "Pass the hold's session ID via the x-session-id header to release it.",
        } as never);
      }

      const released = await holdService.release(holdId, sessionId);
      if (released) {
        decrementHoldCount(ip);
      }

      return reply.status(204).send();
    }
  );
};
