import type { FastifyPluginAsync } from "fastify";
import {
  type FloorPlan,
  type Table,
  type ApiResponse,
  type ApiError,
  type PaginatedResponse,
  type CreateFloorPlanRequest,
  type UpdateFloorPlanRequest,
  type UpdateTablePositionRequest,
  createProblemDetails,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { floorPlanService } from "../services/floor-plan.js";

export const floorPlanRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { venueId?: string; page?: string; limit?: string };
    Reply: PaginatedResponse<FloorPlan> | ApiError;
  }>(
    "/",
    {
      schema: {
        summary: "List floor plans",
        description: "Returns a paginated list of floor plans for a venue.",
        querystring: {
          type: "object",
          properties: {
            venueId: { type: "string" },
            page: { type: "string", default: "1" },
            limit: { type: "string", default: "10" },
          },
        },
      },
    },
    async (request) => {
      const page = parseInt(request.query.page || "1", 10);
      const limit = parseInt(request.query.limit || "10", 10);
      return floorPlanService.list(page, limit, request.query.venueId);
    }
  );

  fastify.get<{ Params: { venueId: string }; Reply: ApiResponse<FloorPlan> | ApiError }>(
    "/venue/:venueId/active",
    {
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
        return reply.code(404).send(createProblemDetails(404, "Not Found", "No active floor plan found for venue"));
      }
      return { data: floorPlan };
    }
  );

  fastify.get<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ApiError }>(
    "/:id",
    {
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

  fastify.post<{ Body: CreateFloorPlanRequest; Reply: ApiResponse<FloorPlan> | ApiError }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create floor plan",
        body: {
          type: "object",
          required: ["venueId", "name", "layoutJson"],
          properties: {
            venueId: { type: "string" },
            name: { type: "string" },
            isActive: { type: "boolean" },
            layoutJson: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.create(request.body);
      return reply.code(201).send({ data: floorPlan });
    }
  );

  fastify.post<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ApiError }>(
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
    async (request, reply) => {
      const cloned = await floorPlanService.clone(request.params.id);
      if (!cloned) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return reply.code(201).send({ data: cloned });
    }
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateFloorPlanRequest; Reply: ApiResponse<FloorPlan> | ApiError }>(
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
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            isActive: { type: "boolean" },
            layoutJson: { type: "object" },
          },
        },
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

  fastify.post<{ Params: { id: string }; Reply: ApiResponse<FloorPlan> | ApiError }>(
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
    Reply: { data: Table[] } | ApiError;
  }>(
    "/tables/positions",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Bulk update table positions",
        description: "Updates the position and metadata for multiple tables in a floor plan.",
        body: {
          type: "object",
          required: ["floorPlanId", "positions"],
          properties: {
            floorPlanId: { type: "string" },
            positions: {
              type: "array",
              items: {
                type: "object",
                required: ["tableId", "shapeMetadata"],
                properties: {
                  tableId: { type: "string" },
                  shapeMetadata: { type: "object" },
                },
              },
            },
          },
        },
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
    Reply: { data: Table } | ApiError;
  }>(
    "/tables/:tableId/assign",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Assign table to floor plan",
        params: {
          type: "object",
          properties: {
            tableId: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["floorPlanId"],
          properties: {
            floorPlanId: { type: "string" },
            shapeMetadata: { type: "object" },
          },
        },
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

  fastify.post<{ Params: { tableId: string }; Reply: { data: Table } | ApiError }>(
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
    async (request, reply) => {
      const table = await floorPlanService.removeTableFromFloorPlan(request.params.tableId);
      if (!table) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Table not found"));
      }
      return { data: table };
    }
  );

  fastify.delete<{ Params: { id: string }; Reply: void | ApiError }>(
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
    async (request, reply) => {
      const success = await floorPlanService.delete(request.params.id);
      if (!success) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Floor plan not found"));
      }
      return reply.code(204).send();
    }
  );
};
