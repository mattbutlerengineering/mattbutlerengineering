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
import { requireAuth, hasPermission } from "@mbe/auth/fastify";
import { parsePaginationQuery } from "@mbe/database";
import { floorPlanService } from "../services/floor-plan.js";
import { tableService } from "../services/table.js";
import { venueScoped } from "./venue-scope.js";

/** 404 `detail` for a floor plan addressed by `:id` or a body `floorPlanId`. */
const FLOOR_PLAN_NOT_FOUND = "Floor plan not found";
/** 404 `detail` for a table addressed by `:tableId`. */
const TABLE_NOT_FOUND = "Table not found";

/**
 * The venue owning the floor plan addressed by `:id`: by-id actions are scoped
 * to it, and an unknown id is a 403 for non-admins (never leaking existence)
 * and a 404 for admins.
 */
const floorPlanVenue = {
  entity: "floor_plan",
  key: (request: { params: { id: string } }) => request.params.id,
  notFound: FLOOR_PLAN_NOT_FOUND,
} as const;

/**
 * The venue owning the table addressed by `:tableId` — the table being
 * mutated, never the body's floor plan (#5008). No `load`: the service call is
 * the read, and its own `null` keeps the route's 404.
 */
const tableParamVenue = {
  entity: "table",
  key: (request: { params: { tableId: string } }) => request.params.tableId,
  notFound: TABLE_NOT_FOUND,
} as const;

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
      preHandler: requireAuth,
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
    venueScoped({ venue: "params" }, async (_request, reply, { venueId }) => {
      const floorPlan = await floorPlanService.getActiveByVenueId(venueId);
      if (!floorPlan) {
        return reply
          .code(404)
          .send(createProblemDetails(404, "Not Found", "No active floor plan found for venue"));
      }
      return { data: floorPlan };
    })
  );

  fastify.get<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/:id",
    {
      preHandler: requireAuth,
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
    venueScoped(
      { venue: { ...floorPlanVenue, load: (id) => floorPlanService.getById(id) } },
      async (_request, _reply, { entity: floorPlan }) => ({ data: floorPlan })
    )
  );

  fastify.post<{ Body: CreateFloorPlanRequest; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create floor plan",
        body: createFloorPlanBodyJsonSchema,
      },
    },
    venueScoped({ venue: "body" }, async (request, reply) => {
      const floorPlan = await floorPlanService.create(request.body);
      return reply.code(201).send({ data: floorPlan });
    })
  );

  fastify.post<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/:id/clone",
    {
      preHandler: requireAuth,
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
    venueScoped({ venue: floorPlanVenue }, async (request, reply) => {
      const cloned = await floorPlanService.clone(request.params.id);
      if (!cloned) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", FLOOR_PLAN_NOT_FOUND));
      }
      fastify.reservationEvents.emitFloorPlanCreated(cloned);
      return reply.code(201).send({ data: cloned });
    })
  );

  fastify.patch<{
    Params: { id: string };
    Body: UpdateFloorPlanRequest;
    Reply: ApiResponse<FloorPlan> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: requireAuth,
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
    venueScoped({ venue: floorPlanVenue }, async (request, reply) => {
      const floorPlan = await floorPlanService.update(request.params.id, request.body);
      if (!floorPlan) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", FLOOR_PLAN_NOT_FOUND));
      }
      return { data: floorPlan };
    })
  );

  fastify.post<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ProblemDetails }>(
    "/:id/activate",
    {
      preHandler: requireAuth,
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
    venueScoped(
      { venue: { ...floorPlanVenue, load: (id) => floorPlanService.getById(id) } },
      async (_request, reply, { entity: floorPlan }) => {
        const updated = await floorPlanService.setActive(floorPlan.id, floorPlan.venueId);
        if (!updated) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", FLOOR_PLAN_NOT_FOUND));
        }
        return { data: updated };
      }
    )
  );

  fastify.post<{
    Body: { floorPlanId: string; positions: UpdateTablePositionRequest[] };
    Reply: { data: Table[] } | ProblemDetails;
  }>(
    "/tables/positions",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Bulk update table positions",
        description: "Updates the position and metadata for multiple tables in a floor plan.",
        body: updateTablePositionsBodyJsonSchema,
      },
    },
    venueScoped(
      {
        venue: {
          entity: "floor_plan",
          key: (request) => request.body.floorPlanId,
          load: (id) => floorPlanService.getById(id),
          notFound: FLOOR_PLAN_NOT_FOUND,
        },
      },
      async (request, reply, { entity: floorPlan }) => {
        const { floorPlanId, positions } = request.body;

        // The floor plan load above, this cross-venue table scan, and the bulk
        // update itself (which does its own internal floor-plan read, see
        // floor-plan.ts's bulkUpdateTablePositions) all run inside the floor
        // plan's venue context (ADR-026 §3.3 item 2 / #5369 PR 5), so all three
        // succeed under FORCE. Note: once scoped, a genuinely cross-venue
        // `positions[].tableId` becomes invisible here rather than "found,
        // wrong venue" — the 403 below no longer fires for that case, but the
        // attempt still fails (404 "One or more tables not found") because
        // `bulkUpdateTablePositions`'s own UPDATE carries an explicit
        // `t.venue_id = …` predicate independent of RLS.
        const tables = await Promise.all(positions.map((pos) => tableService.getById(pos.tableId)));
        const crossVenueTable = tables.find(
          (table) => table !== null && table.venueId !== floorPlan.venueId
        );
        if (crossVenueTable) {
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

        const updatedTables = await floorPlanService.bulkUpdateTablePositions(
          floorPlanId,
          positions
        );
        return { data: updatedTables };
      }
    )
  );

  fastify.post<{
    Params: { tableId: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Body: { floorPlanId: string; shapeMetadata?: any };
    Reply: { data: Table } | ProblemDetails;
  }>(
    "/tables/:tableId/assign",
    {
      // Scoped to the *table* being mutated (:tableId), not the floor plan
      // named in the body — see issue #5008. The body's floorPlanId can
      // legitimately belong to the caller's own venue while :tableId belongs
      // to someone else's; authorizing on the body let a caller re-point
      // another venue's table onto their own floor plan.
      preHandler: requireAuth,
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
    venueScoped({ venue: tableParamVenue }, async (request, reply) => {
      const table = await floorPlanService.assignTableToFloorPlan(
        request.params.tableId,
        request.body.floorPlanId,
        request.body.shapeMetadata
      );
      if (!table) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", TABLE_NOT_FOUND));
      }
      return { data: table };
    })
  );

  fastify.post<{ Params: { tableId: string }; Reply: { data: Table } | ProblemDetails }>(
    "/tables/:tableId/remove",
    {
      preHandler: requireAuth,
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
    venueScoped({ venue: tableParamVenue }, async (request, reply) => {
      const table = await floorPlanService.removeTableFromFloorPlan(request.params.tableId);
      if (!table) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", TABLE_NOT_FOUND));
      }
      return { data: table };
    })
  );

  fastify.delete<{ Params: { id: string }; Reply: void | ProblemDetails }>(
    "/:id",
    {
      preHandler: requireAuth,
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
    venueScoped({ venue: floorPlanVenue }, async (request, reply) => {
      const success = await floorPlanService.delete(request.params.id);
      if (!success) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", FLOOR_PLAN_NOT_FOUND));
      }
      return reply.code(204).send();
    })
  );
};
