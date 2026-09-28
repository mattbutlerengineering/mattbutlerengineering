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
  titleForStatus,
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
import {
  venueIdFromBody,
  venueIdFromParams,
  venueIdFromEntity,
  loadInVenueContext,
} from "./venue-access.js";

/** Resolves the venue owning a floor plan addressed by `:id` (→ 403 if absent). */
const resolveFloorPlanVenueId: VenueIdResolver = venueIdFromEntity(
  "floor_plan",
  (request) => (request.params as { id?: unknown }).id
);

/** Resolves the venue owning the floor plan named in the request body (`floorPlanId`). */
const resolveFloorPlanBodyVenueId: VenueIdResolver = venueIdFromEntity(
  "floor_plan",
  (request) => (request.body as { floorPlanId?: unknown } | null | undefined)?.floorPlanId
);

/** Resolves the venue owning a table addressed by `:tableId` (→ 403 if absent/unassigned). */
const resolveTableParamVenueId: VenueIdResolver = venueIdFromEntity(
  "table",
  (request) => (request.params as { tableId?: unknown }).tableId
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
      const floorPlan = await loadInVenueContext(
        "floor_plan",
        request.params.id,
        () => floorPlanService.getById(request.params.id),
        null
      );
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
      const cloned = await loadInVenueContext(
        "floor_plan",
        request.params.id,
        () => floorPlanService.clone(request.params.id),
        null
      );
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
      const floorPlan = await loadInVenueContext(
        "floor_plan",
        request.params.id,
        () => floorPlanService.update(request.params.id, request.body),
        null
      );
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
      const updated = await loadInVenueContext(
        "floor_plan",
        request.params.id,
        async () => {
          const floorPlan = await floorPlanService.getById(request.params.id);
          if (!floorPlan) return null;
          return floorPlanService.setActive(floorPlan.id, floorPlan.venueId);
        },
        null
      );
      if (!updated) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return { data: updated };
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
    async (request, reply) => {
      const { floorPlanId, positions } = request.body;

      // Everything below — the floor plan pre-check, the cross-venue table
      // scan, and the bulk update itself (which does its own internal
      // unscoped floor-plan read, see floor-plan.ts's bulkUpdateTablePositions)
      // resolves and runs inside ONE venue context (ADR-026 §3.3 item 2 /
      // #5369 PR 5), so all three succeed under FORCE instead of repeating
      // the unscoped-read trap. Note: once scoped, a genuinely cross-venue
      // `positions[].tableId` becomes invisible here rather than "found,
      // wrong venue" — the 403 below no longer fires for that case, but the
      // attempt still fails (404 "One or more tables not found") because
      // `bulkUpdateTablePositions`'s own UPDATE carries an explicit
      // `t.venue_id = …` predicate independent of RLS.
      const result = await loadInVenueContext(
        "floor_plan",
        floorPlanId,
        async () => {
          const floorPlan = await floorPlanService.getById(floorPlanId);
          if (!floorPlan) return { kind: "not-found" as const };

          const tables = await Promise.all(
            positions.map((pos) => tableService.getById(pos.tableId))
          );
          const crossVenueTable = tables.find(
            (table) => table !== null && table.venueId !== floorPlan.venueId
          );
          if (crossVenueTable) return { kind: "cross-venue" as const };

          const updatedTables = await floorPlanService.bulkUpdateTablePositions(
            floorPlanId,
            positions
          );
          return { kind: "ok" as const, updatedTables };
        },
        { kind: "not-found" as const }
      );

      if (result.kind === "not-found") {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      if (result.kind === "cross-venue") {
        return reply
          .code(403)
          .send(
            createProblemDetails(
              403,
              titleForStatus(403),
              "One or more tables do not belong to the floor plan's venue"
            )
          );
      }
      return { data: result.updatedTables };
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
      const table = await loadInVenueContext(
        "table",
        request.params.tableId,
        () =>
          floorPlanService.assignTableToFloorPlan(
            request.params.tableId,
            request.body.floorPlanId,
            request.body.shapeMetadata
          ),
        null
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
      const table = await loadInVenueContext(
        "table",
        request.params.tableId,
        () => floorPlanService.removeTableFromFloorPlan(request.params.tableId),
        null
      );
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
      const success = await loadInVenueContext(
        "floor_plan",
        request.params.id,
        () => floorPlanService.delete(request.params.id),
        false
      );
      if (!success) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return reply.code(204).send();
    }
  );
};
