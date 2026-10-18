import type { FastifyPluginAsync } from "fastify";
import type { ApiResponse, ProblemDetails, PublicMenu, PublicMenuDetail } from "@mbe/types";
import {
  createProblemDetails,
  publicMenuResponseJsonSchema,
  publicMenuDetailResponseJsonSchema,
} from "@mbe/types";
import { publicVenueScoped } from "./public-venue-scope.js";

/**
 * Guest-facing menus (menus [3/7]). Read-only, unauthenticated, addressed by
 * venue slug through `publicVenueScoped` (ADR-026 §3.3 item 3). Only ACTIVE
 * menus are visible; HIDDEN items never leave the service. Rate limiting is the
 * service-wide limiter — no route-level `config.rateLimit` (gotchas.md §
 * Fastify / rate limiting).
 */
export const publicMenuRoutes: FastifyPluginAsync = async (fastify) => {
  const { menuService, venueService } = fastify.services;

  fastify.get<{
    Params: { slug: string };
    Reply: { data: PublicMenu[] } | ProblemDetails;
  }>(
    "/:slug/menus",
    {
      schema: {
        summary: "List a venue's active menus",
        tags: ["Public"],
        params: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
        response: {
          200: {
            type: "object",
            properties: { data: { type: "array", items: publicMenuResponseJsonSchema } },
          },
        },
      },
    },
    publicVenueScoped(
      { slug: (request) => request.params.slug },
      async (_request, _reply, scope) => ({
        data: await menuService.listPublic(scope.venueId),
      })
    )
  );

  fastify.get<{
    Params: { slug: string; menuSlug: string };
    Reply: ApiResponse<PublicMenuDetail> | ProblemDetails;
  }>(
    "/:slug/menus/:menuSlug",
    {
      schema: {
        summary: "Get one active menu with sections and items",
        tags: ["Public"],
        params: {
          type: "object",
          properties: { slug: { type: "string" }, menuSlug: { type: "string" } },
          required: ["slug", "menuSlug"],
        },
        response: {
          200: {
            type: "object",
            properties: { data: publicMenuDetailResponseJsonSchema },
          },
        },
      },
    },
    publicVenueScoped({ slug: (request) => request.params.slug }, async (request, reply, scope) => {
      const [menu, venue] = await Promise.all([
        menuService.getPublicBySlug(scope.venueId, request.params.menuSlug),
        venueService.getPublicConfigBySlug(scope.slug),
      ]);
      if (!menu || !venue) {
        return reply
          .code(404)
          .send(
            createProblemDetails(
              404,
              "Not Found",
              `No menu found with slug '${request.params.menuSlug}'.`
            )
          );
      }
      return { data: { ...menu, currencyCode: venue.currencyCode } };
    })
  );
};
