import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type {
  FloorPlan,
  Table,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  UpdateTablePositionRequest,
  BulkUpdateTablePositionsRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import type { AuthUser, JWTPayload } from "@mbe/auth/types";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { floorPlanService } from "../services/floor-plan.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const floorPlanRoutes: FastifyPluginAsync = async (fastify) => {
  const authority = process.env.AUTH_AUTHORITY;
  const audience = process.env.AUTH_AUDIENCE;

  let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
  if (authority && audience) {
    const jwksUri = `${authority.replace(/\/$/, "")}/.well-known/jwks.json`;
    JWKS = createRemoteJWKSet(new URL(jwksUri));
  }

  const verifyAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!JWKS || !authority || !audience) {
      return reply.code(500).send({ error: "Auth not configured" });
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Missing or invalid authorization header",
        statusCode: 401,
      });
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: authority.replace(/\/$/, "") + "/",
        audience,
      });

      const jwtPayload = payload as unknown as JWTPayload;
      request.user = {
        id: jwtPayload.sub,
        email: jwtPayload.email,
        name: jwtPayload.name,
        picture: jwtPayload.picture,
        emailVerified: jwtPayload.email_verified,
        raw: jwtPayload,
      };
    } catch (error) {
      fastify.log.warn({ error }, "JWT validation failed");
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid token",
        statusCode: 401,
      });
    }
  };

  // List floor plans
  fastify.get<{
    Querystring: { page?: string; limit?: string; venueId?: string };
    Reply: PaginatedResponse<FloorPlan>;
  }>(
    "/",
    {
      schema: {
        summary: "List all floor plans",
        operationId: "listFloorPlans",
        description:
          "Retrieve a paginated list of all floor plans. Optionally filter by venue.",
        tags: ["Floor Plans"],
        querystring: {
          type: "object",
          properties: {
            page: {
              type: "string",
              default: "1",
              description: "Page number (1-indexed)",
            },
            limit: {
              type: "string",
              default: "10",
              description: "Number of floor plans per page (max 100)",
            },
            venueId: {
              type: "string",
              description: "Filter floor plans by venue ID",
            },
          },
        },
        response: {
          200: {
            description: "Successful response with paginated floor plan list",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "FloorPlan#" },
              },
              pagination: { $ref: "Pagination#" },
            },
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request) => {
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "10", 10) || 10));
      return floorPlanService.list(page, limit, request.query.venueId);
    }
  );

  // Get floor plan by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<FloorPlan> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Get floor plan by ID",
        operationId: "getFloorPlanById",
        description: "Retrieve a single floor plan by its unique identifier.",
        tags: ["Floor Plans"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique floor plan identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Floor plan found",
            type: "object",
            properties: {
              data: { $ref: "FloorPlan#" },
            },
          },
          404: {
            description: "Floor plan not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.getById(request.params.id);
      if (!floorPlan) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Floor plan not found",
          statusCode: 404,
        });
      }
      return { data: floorPlan };
    }
  );

  // Get active floor plan for a venue
  fastify.get<{
    Params: { venueId: string };
    Reply: ApiResponse<FloorPlan> | ApiError;
  }>(
    "/venue/:venueId/active",
    {
      schema: {
        summary: "Get active floor plan for a venue",
        operationId: "getActiveFloorPlan",
        description: "Retrieve the currently active floor plan for a venue.",
        tags: ["Floor Plans"],
        params: {
          type: "object",
          properties: {
            venueId: {
              type: "string",
              description: "Venue identifier",
            },
          },
          required: ["venueId"],
        },
        response: {
          200: {
            description: "Active floor plan found",
            type: "object",
            properties: {
              data: { $ref: "FloorPlan#" },
            },
          },
          404: {
            description: "No active floor plan for this venue",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.getActiveByVenueId(request.params.venueId);
      if (!floorPlan) {
        return reply.code(404).send({
          error: "Not Found",
          message: "No active floor plan for this venue",
          statusCode: 404,
        });
      }
      return { data: floorPlan };
    }
  );

  // Create floor plan (requires auth)
  fastify.post<{
    Body: CreateFloorPlanRequest;
    Reply: ApiResponse<FloorPlan> | ApiError;
  }>(
    "/",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Create a new floor plan",
        operationId: "createFloorPlan",
        description: "Create a new floor plan. Requires authentication.",
        tags: ["Floor Plans"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          description: "Floor plan creation payload",
          properties: {
            venueId: {
              type: "string",
              description: "ID of the venue this floor plan belongs to",
            },
            name: {
              type: "string",
              description: "Floor plan name (e.g., 'Main Dining', 'Patio')",
            },
            isActive: {
              type: "boolean",
              description: "Whether this should be the active floor plan",
            },
            layoutJson: {
              type: "object",
              description: "Canvas layout configuration",
              properties: {
                width: { type: "number" },
                height: { type: "number" },
                backgroundImage: { type: "string" },
                gridSize: { type: "number" },
                showGrid: { type: "boolean" },
              },
              required: ["width", "height"],
            },
          },
          required: ["venueId", "name", "layoutJson"],
        },
        response: {
          201: {
            description: "Floor plan created successfully",
            type: "object",
            properties: {
              data: { $ref: "FloorPlan#" },
            },
          },
          400: {
            description: "Invalid request body",
            $ref: "Error#",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.create(request.body);
      return reply.code(201).send({ data: floorPlan });
    }
  );

  // Update floor plan (requires auth)
  fastify.patch<{
    Params: { id: string };
    Body: UpdateFloorPlanRequest;
    Reply: ApiResponse<FloorPlan> | ApiError;
  }>(
    "/:id",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Update a floor plan",
        operationId: "updateFloorPlan",
        description:
          "Update an existing floor plan. Only provided fields will be updated. Requires authentication.",
        tags: ["Floor Plans"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique floor plan identifier",
            },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          description: "Fields to update",
          properties: {
            name: { type: "string" },
            isActive: { type: "boolean" },
            layoutJson: {
              type: "object",
              properties: {
                width: { type: "number" },
                height: { type: "number" },
                backgroundImage: { type: "string" },
                gridSize: { type: "number" },
                showGrid: { type: "boolean" },
              },
            },
          },
        },
        response: {
          200: {
            description: "Floor plan updated successfully",
            type: "object",
            properties: {
              data: { $ref: "FloorPlan#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Floor plan not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.update(request.params.id, request.body);
      if (!floorPlan) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Floor plan not found",
          statusCode: 404,
        });
      }
      return { data: floorPlan };
    }
  );

  // Set active floor plan (requires auth)
  fastify.post<{
    Params: { id: string };
    Body: { venueId: string };
    Reply: ApiResponse<FloorPlan> | ApiError;
  }>(
    "/:id/activate",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Set floor plan as active",
        operationId: "activateFloorPlan",
        description:
          "Set this floor plan as the active one for its venue. Deactivates any other active floor plans for the same venue. Requires authentication.",
        tags: ["Floor Plans"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique floor plan identifier",
            },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            venueId: {
              type: "string",
              description: "Venue ID (for verification)",
            },
          },
          required: ["venueId"],
        },
        response: {
          200: {
            description: "Floor plan activated successfully",
            type: "object",
            properties: {
              data: { $ref: "FloorPlan#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Floor plan not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const floorPlan = await floorPlanService.setActive(
        request.params.id,
        request.body.venueId
      );
      if (!floorPlan) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Floor plan not found",
          statusCode: 404,
        });
      }
      return { data: floorPlan };
    }
  );

  // Delete floor plan (requires auth)
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Delete a floor plan",
        operationId: "deleteFloorPlan",
        description:
          "Delete a floor plan. Tables will be unlinked but not deleted. Requires authentication.",
        tags: ["Floor Plans"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique floor plan identifier",
            },
          },
          required: ["id"],
        },
        response: {
          204: {
            description: "Floor plan deleted successfully",
            type: "null",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Floor plan not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const deleted = await floorPlanService.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Floor plan not found",
          statusCode: 404,
        });
      }
      return reply.code(204).send();
    }
  );

  // Bulk update table positions (requires auth)
  fastify.post<{
    Body: BulkUpdateTablePositionsRequest;
    Reply: ApiResponse<Table[]> | ApiError;
  }>(
    "/tables/positions",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Bulk update table positions",
        operationId: "bulkUpdateTablePositions",
        description:
          "Update positions of multiple tables on a floor plan in a single transaction. Used when saving canvas state. Requires authentication.",
        tags: ["Floor Plans"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          description: "Bulk position update payload",
          properties: {
            floorPlanId: {
              type: "string",
              description: "ID of the floor plan",
            },
            positions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tableId: { type: "string" },
                  shapeMetadata: { $ref: "TableShapeMetadata#" },
                },
                required: ["tableId", "shapeMetadata"],
              },
            },
          },
          required: ["floorPlanId", "positions"],
        },
        response: {
          200: {
            description: "Table positions updated successfully",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "Table#" },
              },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          400: {
            description: "Invalid request body",
            $ref: "Error#",
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

  // Assign table to floor plan (requires auth)
  fastify.post<{
    Params: { tableId: string };
    Body: { floorPlanId: string; shapeMetadata?: UpdateTablePositionRequest["shapeMetadata"] };
    Reply: ApiResponse<Table> | ApiError;
  }>(
    "/tables/:tableId/assign",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Assign table to floor plan",
        operationId: "assignTableToFloorPlan",
        description:
          "Assign a table to a floor plan with optional position metadata. Requires authentication.",
        tags: ["Floor Plans"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            tableId: {
              type: "string",
              description: "Table identifier",
            },
          },
          required: ["tableId"],
        },
        body: {
          type: "object",
          properties: {
            floorPlanId: {
              type: "string",
              description: "Floor plan to assign to",
            },
            shapeMetadata: { $ref: "TableShapeMetadata#" },
          },
          required: ["floorPlanId"],
        },
        response: {
          200: {
            description: "Table assigned successfully",
            type: "object",
            properties: {
              data: { $ref: "Table#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Table not found",
            $ref: "Error#",
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
        return reply.code(404).send({
          error: "Not Found",
          message: "Table not found",
          statusCode: 404,
        });
      }
      return { data: table };
    }
  );

  // Remove table from floor plan (requires auth)
  fastify.post<{
    Params: { tableId: string };
    Reply: ApiResponse<Table> | ApiError;
  }>(
    "/tables/:tableId/remove",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Remove table from floor plan",
        operationId: "removeTableFromFloorPlan",
        description:
          "Remove a table from its floor plan. The table is not deleted, just unlinked. Requires authentication.",
        tags: ["Floor Plans"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            tableId: {
              type: "string",
              description: "Table identifier",
            },
          },
          required: ["tableId"],
        },
        response: {
          200: {
            description: "Table removed from floor plan",
            type: "object",
            properties: {
              data: { $ref: "Table#" },
            },
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Table not found",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const table = await floorPlanService.removeTableFromFloorPlan(request.params.tableId);
      if (!table) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Table not found",
          statusCode: 404,
        });
      }
      return { data: table };
    }
  );
};
