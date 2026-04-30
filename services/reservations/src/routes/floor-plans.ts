import type { FastifyPluginAsync } from "fastify";
import {
  type FloorPlan,
  type Table,
  type ApiError,
  type PaginatedResponse,
  type CreateFloorPlanRequest,
  type UpdateFloorPlanRequest,
  type UpdateTablePositionRequest,
  createProblemDetails,
} from "@mbe/types";
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
            limit: { type: "string", default: "50" },
          },
        },
      },
    },
    async (request) => {
      const page = parseInt(request.query.page || "1", 10);
      const limit = parseInt(request.query.limit || "50", 10);
      return floorPlanService.list(page, limit, request.query.venueId);
    }
  );

  fastify.get<{ Params: { id: string }; Reply: FloorPlan | ApiError }>(
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
      return floorPlan;
    }
  );

  fastify.post<{ Body: CreateFloorPlanRequest; Reply: FloorPlan | ApiError }>(
    "/",
    {
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
    async (request) => {
      return floorPlanService.create(request.body);
    }
  );

  fastify.post<{ Params: { id: string }; Reply: FloorPlan | ApiError }>(
    "/:id/clone",
    {
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
      return reply.code(201).send(cloned);
    }
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateFloorPlanRequest; Reply: FloorPlan | ApiError }>(
    "/:id",
    {
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
      return floorPlan;
    }
  );

  fastify.post<{ Params: { id: string }; Reply: FloorPlan | ApiError }>(
    "/:id/active",
    {
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
      return updated!;
    }
  );

  fastify.post<{
    Params: { id: string };
    Body: UpdateTablePositionRequest[];
    Reply: Table[] | ApiError;
  }>(
    "/:id/bulk-update-positions",
    {
      schema: {
        summary: "Bulk update table positions",
        description: "Updates the position and metadata for multiple tables in a floor plan.",
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
        body: {
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
    async (request) => {
      return floorPlanService.bulkUpdateTablePositions(request.params.id, request.body);
    }
  );

  fastify.delete<{ Params: { id: string }; Reply: { success: boolean } | ApiError }>(
    "/:id",
    {
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
      return { success: true };
    }
  );
};
