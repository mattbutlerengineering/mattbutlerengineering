import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { ANY_TIME_MINUTE, limitingReason, type NoSlotSearchKey } from "../services/lost-demand.js";
import type { PublicAvailabilityDatesResponse, PublicAvailabilityResponse } from "@mbe/types";
import {
  createProblemDetails,
  publicAvailabilityDatesQueryJsonSchema,
  publicAvailabilityDatesResponseJsonSchema,
  publicAvailabilityQueryJsonSchema,
  publicAvailabilityResponseJsonSchema,
} from "@mbe/types";
import { validateDateRange, validatePartySize } from "@mbe/database";
import { publicRateLimitHook } from "../middleware/public-rate-limit.js";
import { publicVenueScoped } from "./public-venue-scope.js";

/** The longest range the dates listing accepts; matches the engine's own cap. */
const MAX_DATES_RANGE_DAYS = 60;
/** Dates ignore party size, so the listing asks the engine as a party of two. */
const DATES_LISTING_PARTY_SIZE = 2;

/**
 * The minute (since local midnight) the guest asked for that had no slot, or
 * `ANY_TIME_MINUTE` when no time was named and the whole day had none; `null`
 * when the search was served. Slot times are `YYYY-MM-DDTHH:mm:ss` local.
 */
function missedMinute(open: ReadonlyArray<{ time: string }>, time: string | undefined) {
  if (time === undefined) return open.length === 0 ? ANY_TIME_MINUTE : null;
  const [hours, minutes] = time.split(":").map(Number);
  const requested = (hours ?? 0) * 60 + (minutes ?? 0);
  const served = open.some(
    (s) => Number(s.time.slice(11, 13)) * 60 + Number(s.time.slice(14, 16)) === requested
  );
  return served ? null : requested;
}

export const publicAvailabilityRoutes: FastifyPluginAsync = async (fastify) => {
  const { availabilityService, venueService, lostDemandService } = fastify.services;

  /** Never slows or fails the guest's response: errors are logged, not thrown. */
  function recordLostDemand(search: NoSlotSearchKey, request: FastifyRequest): void {
    const sessionHeader = request.headers["x-session-id"];
    const signals = {
      sessionId: typeof sessionHeader === "string" && sessionHeader ? sessionHeader : undefined,
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    };
    try {
      void Promise.resolve(
        lostDemandService.recordNoSlotSearch(search, signals, request.log)
      ).catch((error: unknown) =>
        request.log.warn({ err: error }, "lost-demand: recorder rejected")
      );
    } catch (error) {
      request.log.warn({ err: error }, "lost-demand: recorder threw");
    }
  }

  fastify.get<{
    Params: { slug: string };
    Querystring: { date: string; partySize: string; time?: string };
    Reply: PublicAvailabilityResponse | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/availability",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "Get available time slots (public)",
        tags: ["Public"],
        params: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
        },
        querystring: publicAvailabilityQueryJsonSchema,
        // Engine-computed: the slots, plus `closure` for a closed date and
        // `bookingPaused` while online booking is paused (@mbe/types pins both).
        response: { 200: publicAvailabilityResponseJsonSchema },
      },
    },
    publicVenueScoped(
      {
        slug: (request) => request.params.slug,
        notFound: (slug) => ({
          title: "Venue Not Found",
          detail: `No venue found with slug '${slug}'.`,
        }),
      },
      async (request, reply) => {
        const { slug } = request.params;
        const { date, partySize, time } = request.query;

        // ADR-026 §3.3 item 3: resolve via the SECURITY DEFINER function, then
        // run the rest of the lookup (venue re-fetch + slot generation) inside
        // that venue's RLS context, never an unscoped slug read.

        const venue = await venueService.getBySlug(slug);
        if (!venue) {
          return reply
            .status(404)
            .send(
              createProblemDetails(404, "Venue Not Found", `No venue found with slug '${slug}'.`)
            );
        }

        const partySizeResult = validatePartySize(partySize);
        if (!partySizeResult.valid) {
          return reply
            .status(400)
            .send(createProblemDetails(400, "Invalid Party Size", partySizeResult.error));
        }

        const { slots, demand, ...notices } = await availabilityService.getDayAvailability(
          venue.id,
          date,
          partySizeResult.value,
          undefined,
          { logger: request.log }
        );

        const open = slots.filter((s) => s.available);

        // Fire-and-forget: a closed or paused day is not turned-away demand.
        if (!notices.closure && !notices.bookingPaused) {
          const requestedMinute = missedMinute(open, time);
          if (requestedMinute !== null) {
            recordLostDemand(
              {
                venueId: venue.id,
                date,
                requestedMinute,
                partySize: partySizeResult.value,
                reason: limitingReason({
                  requestedMinute,
                  hasSeatings: demand?.hasSeatings ?? false,
                  refusals: demand?.refusals ?? [],
                }),
              },
              request
            );
          }
        }

        return reply.send({ data: open, ...notices });
      }
    )
  );

  fastify.get<{
    Params: { slug: string };
    Querystring: { from: string; to: string };
    Reply: PublicAvailabilityDatesResponse | ReturnType<typeof createProblemDetails>;
  }>(
    "/:slug/availability/dates",
    {
      preHandler: publicRateLimitHook,
      schema: {
        summary: "List closed dates in a range (public)",
        description:
          "The dates in the range the venue is closed, each with the guest message. Lets the booking calendar disable them before a guest picks one.",
        tags: ["Public"],
        params: {
          type: "object",
          properties: { slug: { type: "string" } },
          required: ["slug"],
        },
        querystring: publicAvailabilityDatesQueryJsonSchema,
        response: { 200: publicAvailabilityDatesResponseJsonSchema },
      },
    },
    publicVenueScoped(
      {
        slug: (request) => request.params.slug,
        notFound: (slug) => ({
          title: "Venue Not Found",
          detail: `No venue found with slug '${slug}'.`,
        }),
      },
      async (request, reply) => {
        const { slug } = request.params;
        const { from, to } = request.query;

        const venue = await venueService.getBySlug(slug);
        if (!venue) {
          return reply
            .status(404)
            .send(
              createProblemDetails(404, "Venue Not Found", `No venue found with slug '${slug}'.`)
            );
        }

        const rangeResult = validateDateRange(from, to, MAX_DATES_RANGE_DAYS);
        if (!rangeResult.valid) {
          return reply
            .status(400)
            .send(createProblemDetails(400, "Invalid Date Range", rangeResult.error ?? ""));
        }

        const dates = await availabilityService.getAvailableDates(
          venue.id,
          from,
          to,
          DATES_LISTING_PARTY_SIZE,
          { logger: request.log }
        );

        return reply.send({
          data: dates.flatMap(({ date, closure }) => (closure ? [{ date, closure }] : [])),
        });
      }
    )
  );
};
