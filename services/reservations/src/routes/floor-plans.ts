import type { FastifyPluginAsync } from "fastify";
import {
  type FloorPlan,
  type Table,
  type ApiResponse,
  type ProblemDetails,
  type PaginatedResponse,
  type CreateFloorPlanRequest,
  type UpdateFloorPlanRequest,
  type UpdateTablePositionRequest,
  createProblemDetails,
  listFloorPlansQueryJsonSchema,
  createFloorPlanBodyJsonSchema,
  updateFloorPlanBodyJsonSchema,
  updateTablePositionsBodyJsonSchema,
  assignTableBodyJsonSchema,
} from "@mbe/types";
import {
  requireAuth,
  requireVenueAccess,
  hasPermission,
  type VenueIdResolver,
} from "@mbe/auth/fastify";
import { parsePaginationQuery } from "@mbe/database";
import { floorPlanService } from "../services/floor-plan.js";
import { tableService } from "../services/table.js";
import { venueIdFromBody, venueIdFromParams, venueIdFromEntity } from "./venue-access.js";

/** Resolves the venue owning a floor plan addressed by `:id` (→ 403 if absent). */
const resolveFloorPlanVenueId: VenueIdResolver = venueIdFromEntity(
  (request) => (request.params as { id?: unknown }).id,
  floorPlanService.getById
);

/** Resolves the venue owning the floor plan named in the request body (`floorPlanId`). */
const resolveFloorPlanBodyVenueId: VenueIdResolver = venueIdFromEntity(
  (request) => (request.body as { floorPlanId?: unknown } | null | undefined)?.floorPlanId,
  floorPlanService.getById
);

/** Resolves the venue owning a table addressed by `:tableId` (→ 403 if absent/unassigned). */
const resolveTableParamVenueId: VenueIdResolver = venueIdFromEntity(
  (request) => (request.params as { tableId?: unknown }).tableId,
  tableService.getById
);

export const floorPlanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { venueId?: string; page?: string; limit?: string };
    Reply: PaginatedResponse<FloorPlan> | ProblemDetails;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List floor plans visible to the caller",
        description:
          "Returns a paginated list of floor plans. Platform admins see floor plans " +
          "for every venue; other callers are scoped to venues they are a member of. " +
          "Optionally filter by venueId.",
        querystring: listFloorPlansQueryJsonSchema,
      },
    },
    async (request, reply) => {
      const { page, limit } = parsePaginationQuery(request.query);
      const user = request.user;

      // requireAuth guarantees an identity; this satisfies the type narrower
      // and fails closed if the guard is ever removed.
      if (!user) {
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "Authentication required"));
      }

      // Platform admins are scoped to every venue (matches requireVenueAccess,
      // ADR-020); everyone else sees only floor plans for venues they belong to.
      if (hasPermission(user, "admin")) {
        return floorPlanService.list(page, limit, request.query.venueId);
      }
      return floorPlanService.listForMember(user.raw.sub, page, limit, request.query.venueId);
    }
  );

  fastify.get<{ Params: { venueId: string }; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/venue/:venueId/active",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, venueIdFromParams),
      ],
      schema: {
        summary: "Get active floor plan for venue",
        params: {
          type: "object",
          properties: {
            venueId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.getActiveByVenueId(request.params.venueId);
      if (!floorPlan) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "No active floor plan found for venue"));
      }
      return { data: floorPlan };
    }
  );

  fastify.get<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/:id",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveFloorPlanVenueId),
      ],
      schema: {
        summary: "Get floor plan by ID",
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.getById(request.params.id);
      if (!floorPlan) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return { data: floorPlan };
    }
  );

  fastify.post<{ Body: CreateFloorPlanRequest; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/",
    {
      preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, venueIdFromBody)],
      schema: {
        summary: "Create floor plan",
        body: createFloorPlanBodyJsonSchema,
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.create(request.body);
      return reply.code(201).send({ data: floorPlan });
    }
  );

  fastify.post<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/:id/clone",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveFloorPlanVenueId),
      ],
      schema: {
        summary: "Clone floor plan",
        description: "Creates a copy of the floor plan and all its tables.",
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const cloned = await floorPlanService.clone(request.params.id);
      if (!cloned) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return reply.code(201).send({ data: cloned });
    }
  );

  fastify.patch<{
    Params: { id: string };
    Body: UpdateFloorPlanRequest;
    Reply: ApiResponse<FloorPlan> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveFloorPlanVenueId),
      ],
      schema: {
        summary: "Update floor plan",
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
        body: updateFloorPlanBodyJsonSchema,
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.update(request.params.id, request.body);
      if (!floorPlan) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return { data: floorPlan };
    }
  );

  fastify.post<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/:id/activate",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveFloorPlanVenueId),
      ],
      schema: {
        summary: "Set floor plan as active",
        description: "Activates this floor plan and deactivates all others for the same venue.",
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.getById(request.params.id);
      if (!floorPlan) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }

      const updated = await floorPlanService.setActive(floorPlan.id, floorPlan.venueId);
      return { data: updated! };
    }
  );

  fastify.post<{
    Body: { floorPlanId: string; positions: UpdateTablePositionRequest[] };
    Reply: { data: Table[] } | ProblemDetails;
  }>(
    "/tables/positions",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveFloorPlanBodyVenueId),
      ],
      schema: {
        summary: "Bulk update table positions",
        description: "Updates the position and metadata for multiple tables in a floor plan.",
        body: updateTablePositionsBodyJsonSchema,
      },
    },
    async (request) => {
      const tables = await floorPlanService.bulkUpdateTablePositions(
        request.body.floorPlanId,
        request.body.positions
      );
      return { data: tables };
    }
  );

  fastify.post<{
    Params: { tableId: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Body: { floorPlanId: string; shapeMetadata?: any };
    Reply: { data: Table } | ProblemDetails;
  }>(
    "/tables/:tableId/assign",
    {
      preHandler: [
        requireAuth,
        // Pinned to the *table* being mutated (:tableId), not the floor plan
        // named in the body — see issue #5008. The body's floorPlanId can
        // legitimately belong to the caller's own venue while :tableId
        // belongs to someone else's; authorizing on the body let a caller
        // re-point another venue's table onto their own floor plan.
        requireVenueAccess(fastify.venueMembershipLookup, resolveTableParamVenueId),
      ],
      schema: {
        summary: "Assign table to floor plan",
        params: {
          type: "object",
          properties: {
            tableId: { type: "string" },
          },
        },
        body: assignTableBodyJsonSchema,
      },
    },
    async (request, reply) => {
      const table = await floorPlanService.assignTableToFloorPlan(
        request.params.tableId,
        request.body.floorPlanId,
        request.body.shapeMetadata
      );
      if (!table) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Table not found"));
      }
      return { data: table };
    }
  );

  fastify.post<{ Params: { tableId: string }; Reply: { data: Table } | ProblemDetails }>(
    "/tables/:tableId/remove",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveTableParamVenueId),
      ],
      schema: {
        summary: "Remove table from floor plan",
        params: {
          type: "object",
          properties: {
            tableId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const table = await floorPlanService.removeTableFromFloorPlan(request.params.tableId);
      if (!table) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Table not found"));
      }
      return { data: table };
    }
  );

  fastify.delete<{ Params: { id: string }; Reply: void | ProblemDetails }>(
    "/:id",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, resolveFloorPlanVenueId),
      ],
      schema: {
        summary: "Delete floor plan",
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const success = await floorPlanService.delete(request.params.id);
      if (!success) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return reply.code(204).send();
    }
  );
};
