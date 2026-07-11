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
import {
  listTablesQueryJsonSchema,
  createTableBodyJsonSchema,
  updateTableBodyJsonSchema,
  updateTableStatusBodyJsonSchema,
} from "@mbe/types";
import { requireAuth, requireAdmin, requireVenueAccess, type VenueIdResolver } from "@mbe/auth/fastify";
import { parsePaginationQuery, createListResponseSchema } from "@mbe/database";
import { tableService, TableTransitionError } from "../services/table.js";
import { venueIdFromBody } from "./venue-access.js";

/**
 * Resolves the venue owning a table addressed by `:id`, scoping by-id actions
 * to that venue. Null when the table does not exist or is unassigned (→ 403 for
 * non-admins; platform admins bypass the check).
 */
const resolveTableVenueId: VenueIdResolver = async (request) => {
  const params = request.params as { id?: unknown };
  if (typeof params.id !== "string") return null;
  const table = await tableService.getById(params.id);
  return table?.venueId ?? null;
};

export const tableRoutes: FastifyPluginAsync = async (fastify) => {
  // List tables
  fastify.get<{
    Querystring: { page?: string; limit?: string; activeOnly?: string };
    Reply: PaginatedResponse<Table>;
  }>(
    "/",
    {
      preHandler: [requireAuth, requireAdmin],
      schema: {
        summary: "List all tables",
        operationId: "listTables",
        description:
          "Retrieve a paginated list of all tables. Optionally filter to only active tables.",
        tags: ["Tables"],
        querystring: listTablesQueryJsonSchema,
        response: {
          200: {
            description: "Successful response with paginated table list",
            ...createListResponseSchema("Table#"),
          },
          500: {
            description: "Internal server error",
            $ref: "Error#",
          },
        },
      },
    },
    async (request) => {
      const { page, limit } = parsePaginationQuery(request.query);
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
      preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, resolveTableVenueId)],
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
    async (request) => {
      const table = await tableService.getById(request.params.id);
      if (!table) {
        const error = new Error("Table not found") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
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
      preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, venueIdFromBody)],
      schema: {
        summary: "Create a new table",
        operationId: "createTable",
        description: "Create a new table. Requires authentication.",
        tags: ["Tables"],
        security: [{ bearerAuth: [] }],
        body: createTableBodyJsonSchema,
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
          const err = new Error("A table with this name already exists") as Error & {
            statusCode?: number;
          };
          err.statusCode = 400;
          throw err;
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
      preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, resolveTableVenueId)],
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
        body: updateTableBodyJsonSchema,
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
    async (request) => {
      const table = await tableService.update(request.params.id, request.body);
      if (!table) {
        const error = new Error("Table not found") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
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
      preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, resolveTableVenueId)],
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
        body: updateTableStatusBodyJsonSchema,
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
    async (request) => {
      try {
        const table = await tableService.updateStatus(request.params.id, request.body.status);
        if (!table) {
          const error = new Error("Table not found") as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }
        fastify.reservationEvents.emitTableUpdated(table);
        return { data: table };
      } catch (err) {
        if (err instanceof TableTransitionError) {
          const error = new Error(err.message) as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }
        throw err;
      }
    }
  );

  // Delete table (requires auth)
  fastify.delete<{
    Params: { id: string };
  }>(
    "/:id",
    {
      preHandler: [requireAuth, requireVenueAccess(fastify.venueMembershipLookup, resolveTableVenueId)],
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
        const error = new Error("Table not found") as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }
      return reply.code(204).send();
    }
  );
};
