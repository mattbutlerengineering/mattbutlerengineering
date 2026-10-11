import type { FastifyPluginAsync } from "fastify";
import type {
  Table,
  CreateTableRequest,
  UpdateTableRequest,
  UpdateTableStatusRequest,
  ApiResponse,
  ProblemDetails,
  PaginatedResponse,
} from "@mbe/types";
import {
  createProblemDetails,
  titleForStatus,
  listTablesQueryJsonSchema,
  createTableBodyJsonSchema,
  updateTableBodyJsonSchema,
  updateTableStatusBodyJsonSchema,
} from "@mbe/types";
import { requireAuth, requireVenueAccess } from "@mbe/auth/fastify";
import { parsePaginationQuery, createListResponseSchema } from "@mbe/database";
import { TableTransitionError } from "../services/table.js";
import { venueIdFromBody, venueIdFromQuery } from "./venue-access.js";
import { venueScoped } from "./venue-scope.js";

/** 404 `detail` for a table addressed by `:id`. */
const TABLE_NOT_FOUND = "Table not found";

/**
 * The venue owning the table addressed by `:id`: by-id actions are scoped to
 * it, and an unknown or unassigned table is a 403 for non-admins (never
 * leaking existence) and a 404 for admins. No `load`: each handler's own
 * service call is the read, and its thrown 404 keeps the route's bytes.
 */
const tableVenue = {
  venue: {
    entity: "table",
    key: (request: { params: { id: string } }) => request.params.id,
    notFound: TABLE_NOT_FOUND,
  },
} as const;

/** The 404 the table routes throw for a missing row (the error handler adds `instance`). */
function tableNotFound(): Error {
  const error = new Error(TABLE_NOT_FOUND) as Error & { statusCode?: number };
  error.statusCode = 404;
  return error;
}

export const tableRoutes: FastifyPluginAsync = async (fastify) => {
  // Resolve domain services from the buildApp seam (issue #3357) rather than
  // importing the sibling singleton directly — tests inject fakes via
  // buildApp({ services }).
  const { tableService, floorPlanService } = fastify.services;

  // List tables
  fastify.get<{
    Querystring: { page?: string; limit?: string; activeOnly?: string; venueId?: string };
    Reply: PaginatedResponse<Table>;
  }>(
    "/",
    {
      preHandler: [
        requireAuth,
        requireVenueAccess(fastify.venueMembershipLookup, venueIdFromQuery),
      ],
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
      return tableService.list(page, limit, activeOnly, request.query.venueId);
    }
  );

  // Get table by ID
  fastify.get<{
    Params: { id: string };
    Reply: ApiResponse<Table> | ProblemDetails;
  }>(
    "/:id",
    {
      preHandler: requireAuth,
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
    venueScoped(tableVenue, async (request) => {
      const table = await tableService.getById(request.params.id);
      if (!table) throw tableNotFound();
      return { data: table };
    })
  );

  // Create table (requires auth)
  fastify.post<{
    Body: CreateTableRequest;
    Reply: ApiResponse<Table> | ProblemDetails;
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
    Reply: ApiResponse<Table> | ProblemDetails;
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
          403: {
            description: "Requested floor plan belongs to a different venue",
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
    venueScoped(tableVenue, async (request, reply) => {
      const { floorPlanId } = request.body;

      // ADR-026 §3.3 item 5 / #5369 PR 7: the floor-plan reassignment
      // pre-check runs INSIDE the table's venue context (venueScoped), the way
      // `floor-plans.ts`'s `/tables/positions` route does, so both reads
      // succeed under FORCE instead of silently skipping this check.
      if (floorPlanId) {
        // Venue scope only proves the caller belongs to the TABLE's own venue.
        // `floorPlanId` is a client-supplied id that the update connects with
        // no venue awareness of its own, so a member of the table's venue could
        // otherwise re-point it onto ANOTHER venue's floor plan. Same bug class
        // as #5008 (/tables/:tableId/assign) and #5042 (/tables/positions) in
        // floor-plans.ts. Checked here rather than in the DB layer because
        // `Table` has no compound floorPlanId/venueId constraint, and ADR-026's
        // RLS does not apply to the app's own role.
        const [current, floorPlan] = await Promise.all([
          tableService.getById(request.params.id),
          floorPlanService.getById(floorPlanId),
        ]);
        // A missing table or floor plan is not a cross-venue reassignment —
        // fall through so the update below surfaces the existing 404. Note
        // (matching `floor-plans.ts`'s `/tables/positions` route): inside the
        // table's own venue context, a GENUINELY cross-venue `floorPlanId`
        // becomes invisible here under RLS rather than "found, wrong venue" —
        // `floorPlan` resolves `null`, this 403 never fires, and the attempt
        // still fails, but as the 404 below (from `tableService.update`'s own
        // nested `connect`) instead.
        if (current && floorPlan && floorPlan.venueId !== current.venueId) {
          return reply
            .code(403)
            .send(
              createProblemDetails(
                403,
                titleForStatus(403),
                "The requested floor plan does not belong to this table's venue"
              )
            );
        }
      }

      const table = await tableService.update(request.params.id, request.body);
      if (!table) throw tableNotFound();
      return { data: table };
    })
  );

  // Update table status (requires auth)
  fastify.patch<{
    Params: { id: string };
    Body: UpdateTableStatusRequest;
    Reply: ApiResponse<Table> | ProblemDetails;
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
    venueScoped(tableVenue, async (request) => {
      try {
        const table = await tableService.updateStatus(request.params.id, request.body.status);
        if (!table) throw tableNotFound();
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
    })
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
    venueScoped(tableVenue, async (request, reply) => {
      const deleted = await tableService.delete(request.params.id);
      if (!deleted) throw tableNotFound();
      return reply.code(204).send();
    })
  );
};
