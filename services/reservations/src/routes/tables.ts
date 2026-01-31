import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type {
  Table,
  CreateTableRequest,
  UpdateTableRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import type { AuthUser, JWTPayload } from "@mbe/auth/types";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { tableService } from "../services/table.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const tableRoutes: FastifyPluginAsync = async (fastify) => {
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

  // List tables
  fastify.get<{
    Querystring: { page?: string; limit?: string; activeOnly?: string };
    Reply: PaginatedResponse<Table>;
  }>(
    "/",
    {
      schema: {
        summary: "List all tables",
        operationId: "listTables",
        description:
          "Retrieve a paginated list of all tables. Optionally filter to only active tables.",
        tags: ["Tables"],
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
              description: "Number of tables per page (max 100)",
            },
            activeOnly: {
              type: "string",
              enum: ["true", "false"],
              default: "false",
              description: "Filter to only active tables",
            },
          },
        },
        response: {
          200: {
            description: "Successful response with paginated table list",
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "Table#" },
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
      const page = parseInt(request.query.page ?? "1", 10);
      const limit = parseInt(request.query.limit ?? "10", 10);
      const activeOnly = request.query.activeOnly === "true";
      return tableService.list(page, limit, activeOnly);
    }
  );

  // Get table by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Table> | ApiError;
  }>(
    "/:id",
    {
      schema: {
        summary: "Get table by ID",
        operationId: "getTableById",
        description: "Retrieve a single table by its unique identifier.",
        tags: ["Tables"],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique table identifier",
            },
          },
          required: ["id"],
        },
        response: {
          200: {
            description: "Table found",
            type: "object",
            properties: {
              data: { $ref: "Table#" },
            },
          },
          404: {
            description: "Table not found",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const table = await tableService.getById(request.params.id);
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

  // Create table (requires auth)
  fastify.post<{
    Body: CreateTableRequest;
    Reply: ApiResponse<Table> | ApiError;
  }>(
    "/",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Create a new table",
        operationId: "createTable",
        description: "Create a new table. Requires authentication.",
        tags: ["Tables"],
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          description: "Table creation payload",
          properties: {
            name: {
              type: "string",
              description: "Unique table name (e.g., 'Table 1', 'Patio A')",
            },
            capacity: {
              type: "integer",
              minimum: 1,
              description: "Maximum number of guests the table can seat",
            },
            location: {
              type: "string",
              description: "Location description (e.g., 'Main Floor', 'Patio')",
            },
            venueId: {
              type: "string",
              description: "ID of the venue this table belongs to",
            },
          },
          required: ["name", "capacity"],
        },
        response: {
          201: {
            description: "Table created successfully",
            type: "object",
            properties: {
              data: { $ref: "Table#" },
            },
          },
          400: {
            description: "Invalid request body or table name already exists",
            $ref: "Error#",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const table = await tableService.create(request.body);
        return reply.code(201).send({ data: table });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
        ) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "A table with this name already exists",
            statusCode: 400,
          });
        }
        throw error;
      }
    }
  );

  // Update table (requires auth)
  fastify.patch<{
    Params: { id: string };
    Body: UpdateTableRequest;
    Reply: ApiResponse<Table> | ApiError;
  }>(
    "/:id",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Update a table",
        operationId: "updateTable",
        description:
          "Update an existing table. Only provided fields will be updated. Requires authentication.",
        tags: ["Tables"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique table identifier",
            },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          description: "Fields to update",
          properties: {
            name: {
              type: "string",
              description: "New table name",
            },
            capacity: {
              type: "integer",
              minimum: 1,
              description: "New capacity",
            },
            location: {
              type: "string",
              description: "New location description",
            },
            isActive: {
              type: "boolean",
              description: "Whether the table is active and available for reservations",
            },
          },
        },
        response: {
          200: {
            description: "Table updated successfully",
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
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const table = await tableService.update(request.params.id, request.body);
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

  // Delete table (requires auth)
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: verifyAuth,
      schema: {
        summary: "Delete a table",
        operationId: "deleteTable",
        description:
          "Delete a table. This will fail if the table has reservations. Requires authentication.",
        tags: ["Tables"],
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique table identifier",
            },
          },
          required: ["id"],
        },
        response: {
          204: {
            description: "Table deleted successfully",
            type: "null",
          },
          401: {
            description: "Authentication required",
            $ref: "Error#",
          },
          404: {
            description: "Table not found",
            $ref: "Error#",
          },
          409: {
            description: "Table has reservations and cannot be deleted",
            $ref: "Error#",
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request, reply) => {
      const deleted = await tableService.delete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Table not found",
          statusCode: 404,
        });
      }
      return reply.code(204).send();
    }
  );
};
