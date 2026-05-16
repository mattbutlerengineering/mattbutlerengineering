import type { FastifyPluginAsync } from "fastify";
import type {
  Table,
  CreateTableRequest,
  UpdateTableRequest,
  UpdateTableStatusRequest,
  ApiResponse,
  ApiError,
  PaginatedResponse,
} from "@mbe/types";
import { createProblemDetails } from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { tableService } from "../services/table.js";
import { emitTableUpdated } from "../services/events.js";

export const tableRoutes: FastifyPluginAsync = async (fastify) => {
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
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(request.query.limit ?? "10", 10) || 10));
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
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Table not found"));
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
      preHandler: requireAuth,
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
        if (error instanceof Error && error.message.includes("Unique constraint")) {
          return reply
            .code(400)
            .send(
              createProblemDetails(400, "Bad Request", "A table with this name already exists")
            );
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
      preHandler: requireAuth,
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
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Table not found"));
      }
      return { data: table };
    }
  );

  // Update table status (requires auth)
  fastify.patch<{
    Params: { id: string };
    Body: UpdateTableStatusRequest;
    Reply: ApiResponse<Table> | ApiError;
  }>(
    "/:id/status",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Update table status",
        operationId: "updateTableStatus",
        description:
          "Update the operational status of a table (AVAILABLE, OCCUPIED, DIRTY, READY). Requires authentication.",
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
          description: "Table status update payload",
          properties: {
            status: {
              type: "string",
              enum: ["AVAILABLE", "OCCUPIED", "DIRTY", "READY"],
              description: "New table status",
            },
          },
          required: ["status"],
        },
        response: {
          200: {
            description: "Table status updated successfully",
            type: "object",
            properties: {
              data: { $ref: "Table#" },
            },
          },
          400: {
            description: "Invalid status value",
            $ref: "Error#",
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
      const table = await tableService.updateStatus(request.params.id, request.body.status);
      if (!table) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Table not found"));
      }
      emitTableUpdated(table);
      return { data: table };
    }
  );

  // Delete table (requires auth)
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: requireAuth,
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
        return reply.code(404).send(createProblemDetails(404, "Not Found", "Table not found"));
      }
      return reply.code(204).send();
    }
  );
};
