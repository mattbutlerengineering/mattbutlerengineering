import type { FastifyPluginAsync } from "fastify";
import {
  type ApiResponse,
  type Menu,
  type MenuSection,
  type MenuItem,
  type ProblemDetails,
  type CreateMenuRequest,
  type UpdateMenuRequest,
  type CreateMenuSectionRequest,
  type UpdateMenuSectionRequest,
  type CreateMenuItemRequest,
  type UpdateMenuItemRequest,
  type ReorderMenuRequest,
  createProblemDetails,
  titleForStatus,
  menuVenueQueryJsonSchema,
  createMenuBodyJsonSchema,
  updateMenuBodyJsonSchema,
  createMenuSectionBodyJsonSchema,
  updateMenuSectionBodyJsonSchema,
  createMenuItemBodyJsonSchema,
  updateMenuItemBodyJsonSchema,
  reorderMenuBodyJsonSchema,
} from "@mbe/types";
import { requireAuth } from "@mbe/auth/fastify";
import { MenuSlugConflictError, type MenuWithSections } from "../services/menu.js";
import { venueScoped } from "./venue-scope.js";

const MENU_NOT_FOUND = "Menu not found";
const SECTION_NOT_FOUND = "Menu section not found";
const ITEM_NOT_FOUND = "Menu item not found";

/** `string` path params, as the JSON-schema `params` block declares them. */
const paramsSchema = (...names: string[]) => ({
  type: "object",
  properties: Object.fromEntries(names.map((name) => [name, { type: "string" }])),
});

interface MenuQuery {
  venueId: string;
}

/**
 * Operator menu management (menus [2/7]). Every route names its venue in the
 * query (`?venueId=`) and runs through `venueScoped`, so a caller who is not a
 * member of that venue gets 403 and every service call is confined to it. A
 * menu/section/item id that belongs to another venue resolves to 404, never to
 * the other venue's data. v1 authorization is any venue member, as for floor
 * plans — no role checks here.
 */
export const menuRoutes: FastifyPluginAsync = async (fastify) => {
  const { menuService } = fastify.services;

  fastify.get<{ Querystring: MenuQuery; Reply: { data: Menu[] } | ProblemDetails }>(
    "/",
    {
      preHandler: requireAuth,
      schema: { summary: "List a venue's menus", querystring: menuVenueQueryJsonSchema },
    },
    venueScoped({ venue: "query" }, async (_request, _reply, { venueId }) => ({
      data: await menuService.list(venueId),
    }))
  );

  fastify.post<{
    Querystring: MenuQuery;
    Body: CreateMenuRequest;
    Reply: ApiResponse<Menu> | ProblemDetails;
  }>(
    "/",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Create a menu",
        querystring: menuVenueQueryJsonSchema,
        body: createMenuBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      try {
        const menu = await menuService.create(venueId, request.body);
        return reply.code(201).send({ data: menu });
      } catch (err) {
        if (err instanceof MenuSlugConflictError) {
          return reply.code(409).send(createProblemDetails(409, titleForStatus(409), err.message));
        }
        throw err;
      }
    })
  );

  fastify.get<{
    Params: { menuId: string };
    Querystring: MenuQuery;
    Reply: ApiResponse<MenuWithSections> | ProblemDetails;
  }>(
    "/:menuId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Get a menu with its sections and items",
        params: paramsSchema("menuId"),
        querystring: menuVenueQueryJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const menu = await menuService.getById(venueId, request.params.menuId);
      if (!menu) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", MENU_NOT_FOUND));
      }
      return { data: menu };
    })
  );

  fastify.patch<{
    Params: { menuId: string };
    Querystring: MenuQuery;
    Body: UpdateMenuRequest;
    Reply: ApiResponse<Menu> | ProblemDetails;
  }>(
    "/:menuId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Update a menu",
        params: paramsSchema("menuId"),
        querystring: menuVenueQueryJsonSchema,
        body: updateMenuBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      try {
        const menu = await menuService.update(venueId, request.params.menuId, request.body);
        if (!menu) {
          return reply.code(404).send(createProblemDetails(404, "Not Found", MENU_NOT_FOUND));
        }
        return { data: menu };
      } catch (err) {
        if (err instanceof MenuSlugConflictError) {
          return reply.code(409).send(createProblemDetails(409, titleForStatus(409), err.message));
        }
        throw err;
      }
    })
  );

  fastify.delete<{
    Params: { menuId: string };
    Querystring: MenuQuery;
    Reply: void | ProblemDetails;
  }>(
    "/:menuId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Delete a menu (cascades to its sections and items)",
        params: paramsSchema("menuId"),
        querystring: menuVenueQueryJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      if (!(await menuService.delete(venueId, request.params.menuId))) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", MENU_NOT_FOUND));
      }
      return reply.code(204).send();
    })
  );

  fastify.post<{
    Params: { menuId: string };
    Querystring: MenuQuery;
    Body: CreateMenuSectionRequest;
    Reply: ApiResponse<MenuSection> | ProblemDetails;
  }>(
    "/:menuId/sections",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Add a section to a menu",
        params: paramsSchema("menuId"),
        querystring: menuVenueQueryJsonSchema,
        body: createMenuSectionBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const section = await menuService.createSection(venueId, request.params.menuId, request.body);
      if (!section) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", MENU_NOT_FOUND));
      }
      return reply.code(201).send({ data: section });
    })
  );

  fastify.put<{
    Params: { menuId: string };
    Querystring: MenuQuery;
    Body: ReorderMenuRequest;
    Reply: { data: MenuSection[] } | ProblemDetails;
  }>(
    "/:menuId/sections/order",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Reorder a menu's sections",
        description: "`ids` lists every section to place; its index becomes `displayOrder`.",
        params: paramsSchema("menuId"),
        querystring: menuVenueQueryJsonSchema,
        body: reorderMenuBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const sections = await menuService.reorderSections(
        venueId,
        request.params.menuId,
        request.body.ids
      );
      if (!sections) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", SECTION_NOT_FOUND));
      }
      return { data: sections };
    })
  );

  fastify.patch<{
    Params: { menuId: string; sectionId: string };
    Querystring: MenuQuery;
    Body: UpdateMenuSectionRequest;
    Reply: ApiResponse<MenuSection> | ProblemDetails;
  }>(
    "/:menuId/sections/:sectionId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Update a menu section",
        params: paramsSchema("menuId", "sectionId"),
        querystring: menuVenueQueryJsonSchema,
        body: updateMenuSectionBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const section = await menuService.updateSection(
        venueId,
        request.params.menuId,
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
    Params: { menuId: string; sectionId: string };
    Querystring: MenuQuery;
    Reply: void | ProblemDetails;
  }>(
    "/:menuId/sections/:sectionId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Delete a menu section (cascades to its items)",
        params: paramsSchema("menuId", "sectionId"),
        querystring: menuVenueQueryJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const { menuId, sectionId } = request.params;
      if (!(await menuService.deleteSection(venueId, menuId, sectionId))) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", SECTION_NOT_FOUND));
      }
      return reply.code(204).send();
    })
  );

  fastify.post<{
    Params: { menuId: string; sectionId: string };
    Querystring: MenuQuery;
    Body: CreateMenuItemRequest;
    Reply: ApiResponse<MenuItem> | ProblemDetails;
  }>(
    "/:menuId/sections/:sectionId/items",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Add an item to a menu section",
        params: paramsSchema("menuId", "sectionId"),
        querystring: menuVenueQueryJsonSchema,
        body: createMenuItemBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const { menuId, sectionId } = request.params;
      const item = await menuService.createItem(venueId, menuId, sectionId, request.body);
      if (!item) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", SECTION_NOT_FOUND));
      }
      return reply.code(201).send({ data: item });
    })
  );

  fastify.put<{
    Params: { menuId: string; sectionId: string };
    Querystring: MenuQuery;
    Body: ReorderMenuRequest;
    Reply: { data: MenuItem[] } | ProblemDetails;
  }>(
    "/:menuId/sections/:sectionId/items/order",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Reorder a section's items",
        description: "`ids` lists every item to place; its index becomes `displayOrder`.",
        params: paramsSchema("menuId", "sectionId"),
        querystring: menuVenueQueryJsonSchema,
        body: reorderMenuBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const { menuId, sectionId } = request.params;
      const items = await menuService.reorderItems(venueId, menuId, sectionId, request.body.ids);
      if (!items) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", ITEM_NOT_FOUND));
      }
      return { data: items };
    })
  );

  fastify.patch<{
    Params: { menuId: string; sectionId: string; itemId: string };
    Querystring: MenuQuery;
    Body: UpdateMenuItemRequest;
    Reply: ApiResponse<MenuItem> | ProblemDetails;
  }>(
    "/:menuId/sections/:sectionId/items/:itemId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Update a menu item",
        params: paramsSchema("menuId", "sectionId", "itemId"),
        querystring: menuVenueQueryJsonSchema,
        body: updateMenuItemBodyJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const { menuId, sectionId, itemId } = request.params;
      const item = await menuService.updateItem(venueId, menuId, sectionId, itemId, request.body);
      if (!item) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", ITEM_NOT_FOUND));
      }
      return { data: item };
    })
  );

  fastify.delete<{
    Params: { menuId: string; sectionId: string; itemId: string };
    Querystring: MenuQuery;
    Reply: void | ProblemDetails;
  }>(
    "/:menuId/sections/:sectionId/items/:itemId",
    {
      preHandler: requireAuth,
      schema: {
        summary: "Delete a menu item",
        params: paramsSchema("menuId", "sectionId", "itemId"),
        querystring: menuVenueQueryJsonSchema,
      },
    },
    venueScoped({ venue: "query" }, async (request, reply, { venueId }) => {
      const { menuId, sectionId, itemId } = request.params;
      if (!(await menuService.deleteItem(venueId, menuId, sectionId, itemId))) {
        return reply.code(404).send(createProblemDetails(404, "Not Found", ITEM_NOT_FOUND));
      }
      return reply.code(204).send();
    })
  );
};
