import type { FastifyPluginAsync } from "fastify";
import {
  type ApiResponse,
  type FloorPlanSection,
  type Table,
  type ProblemDetails,
  type CreateFloorPlanSectionRequest,
  type UpdateFloorPlanSectionRequest,
  type ReorderFloorPlanSectionsRequest,
  type AssignSectionTablesRequest,
  createProblemDetails,
  floorPlanSectionListQueryJsonSchema,
  floorPlanSectionVenueQueryJsonSchema,
  createFloorPlanSectionBodyJsonSchema,
  updateFloorPlanSectionBodyJsonSchema,
  reorderFloorPlanSectionsBodyJsonSchema,
  assignSectionTablesBodyJsonSchema,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { venueScoped } from "./venue-scope.js";

const SECTION_NOT_FOUND = "Floor plan section not found";
const FLOOR_PLAN_NOT_FOUND = "Floor plan not found";
const TABLES_NOT_FOUND = "Section or table not found in this floor plan";

const sectionIdParams = { type: "object", properties: { sectionId: { type: "string" } } };

interface VenueQuery {
  venueId: string;
}

/**
 * Operator floor-plan section management. Every route names its venue in the
 * query (`?venueId=`) and runs through `venueScoped`, so a non-member gets 403
 * and every service call is confined to that venue; an id that belongs to
 * another venue resolves to 404. v1 authorization is any venue member, as for
 * floor plans.
 */
export const floorPlanSectionRoutes: FastifyPluginAsync = async (fastify) => {
  const { floorPlanSectionService } = fastify.services;

  fastify.get<{
    Querystring: VenueQuery & { floorPlanId?: string };
    Reply: { data: FloorPlanSection[] } | ProblemDetails;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "List a venue's floor-plan sections",
        querystring: floorPlanSectionListQueryJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, _reply, { venueId }) => ({
      data: await floorPlanSectionService.list(venueId, request.query.floorPlanId),
    }))
  );

  fastify.post<{
    Querystring: VenueQuery;
    Body: CreateFloorPlanSectionRequest;
    Reply: ApiResponse<FloorPlanSection> | ProblemDetails;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create a floor-plan section",
        querystring: floorPlanSectionVenueQueryJsonSchema,
        body: createFloorPlanSectionBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const section = await floorPlanSectionService.create(venueId, request.body);
      if (!section) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", FLOOR_PLAN_NOT_FOUND));
      }
      return reply.code(201).send({ data: section });
    })
  );

  fastify.put<{
    Querystring: VenueQuery;
    Body: ReorderFloorPlanSectionsRequest;
    Reply: { data: FloorPlanSection[] } | ProblemDetails;
  }>(
    "/order",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Reorder a floor plan's sections",
        description: "`ids` lists every section to place; its index becomes `displayOrder`.",
        querystring: floorPlanSectionVenueQueryJsonSchema,
        body: reorderFloorPlanSectionsBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const { floorPlanId, ids } = request.body;
      const sections = await floorPlanSectionService.reorder(venueId, floorPlanId, ids);
      if (!sections) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", SECTION_NOT_FOUND));
      }
      return { data: sections };
    })
  );

  fastify.patch<{
    Params: { sectionId: string };
    Querystring: VenueQuery;
    Body: UpdateFloorPlanSectionRequest;
    Reply: ApiResponse<FloorPlanSection> | ProblemDetails;
  }>(
    "/:sectionId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Rename or recolour a floor-plan section",
        params: sectionIdParams,
        querystring: floorPlanSectionVenueQueryJsonSchema,
        body: updateFloorPlanSectionBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const section = await floorPlanSectionService.update(
        venueId,
        request.params.sectionId,
        request.body
      );
      if (!section) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", SECTION_NOT_FOUND));
      }
      return { data: section };
    })
  );

  fastify.delete<{
    Params: { sectionId: string };
    Querystring: VenueQuery;
    Reply: void | ProblemDetails;
  }>(
    "/:sectionId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Delete a floor-plan section (its tables are kept, unassigned)",
        params: sectionIdParams,
        querystring: floorPlanSectionVenueQueryJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      if (!(await floorPlanSectionService.delete(venueId, request.params.sectionId))) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", SECTION_NOT_FOUND));
      }
      return reply.code(204).send();
    })
  );

  fastify.put<{
    Params: { sectionId: string };
    Querystring: VenueQuery;
    Body: AssignSectionTablesRequest;
    Reply: { data: Table[] } | ProblemDetails;
  }>(
    "/:sectionId/tables",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Set the tables that belong to a section",
        description:
          "`tableIds` becomes the section's exact membership; other tables leave it. " +
          "Every table must belong to the section's floor plan.",
        params: sectionIdParams,
        querystring: floorPlanSectionVenueQueryJsonSchema,
        body: assignSectionTablesBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const tables = await floorPlanSectionService.assignTables(
        venueId,
        request.params.sectionId,
        request.body.tableIds
      );
      if (!tables) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", TABLES_NOT_FOUND));
      }
      return { data: tables };
    })
  );
};
