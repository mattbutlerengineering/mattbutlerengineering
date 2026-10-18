import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { MenuSlugConflictError } from "../services/menu.js";
import type { VenueMembershipLookup } from "@mbe/auth/fastify";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";

const MENUS_URL = "/api/v1/menus";
const Q = "?venueId=venue-1";
const ADMIN = { "x-auth-bypass": "true" };

const menu = {
  id: "menu-1",
  venueId: "venue-1",
  name: "Dinner",
  slug: "dinner",
  description: null,
  status: "DRAFT" as const,
  displayOrder: 0,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
};
const section = {
  id: "sec-1",
  venueId: "venue-1",
  menuId: "menu-1",
  name: "Starters",
  displayOrder: 0,
};
const item = {
  id: "item-1",
  venueId: "venue-1",
  sectionId: "sec-1",
  name: "Soup",
  description: null,
  priceCents: 850,
  status: "AVAILABLE" as const,
  displayOrder: 0,
};

const menuService = {
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  createSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  reorderSections: vi.fn(),
  reorderItems: vi.fn(),
};

describe("Menu routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({
      logger: false,
      services: { menuService: menuService as never },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  describe("authorization", () => {
    it("returns 401 without auth", async () => {
      const response = await app.inject({ method: "GET", url: `${MENUS_URL}${Q}` });
      expect(response.statusCode).toBe(401);
      expect(menuService.list).not.toHaveBeenCalled();
    });

    it("returns 403 for a venue the caller is not a member of", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: "auth0|outsider",
          iss: "https://test.auth0.com/",
          aud: "https://api.example.com",
          permissions: [],
        },
        protectedHeader: { alg: "RS256" },
      } as never);
      const lookup = vi.fn<VenueMembershipLookup>().mockResolvedValue(false);
      const scopedApp = await buildApp({
        logger: false,
        venueMembershipLookup: lookup,
        services: { menuService: menuService as never },
      });
      await scopedApp.ready();

      const response = await scopedApp.inject({
        method: "GET",
        url: `${MENUS_URL}${Q}`,
        headers: { authorization: "Bearer outsider-token" },
      });

      expect(response.statusCode).toBe(403);
      expect(menuService.list).not.toHaveBeenCalled();
      await scopedApp.close();
    });

    it("requires venueId", async () => {
      const response = await app.inject({ method: "GET", url: MENUS_URL, headers: ADMIN });
      expect(response.statusCode).toBe(400);
      expect(menuService.list).not.toHaveBeenCalled();
    });
  });

  describe("menus", () => {
    it("lists the venue's menus", async () => {
      menuService.list.mockResolvedValueOnce([menu]);
      const response = await app.inject({ method: "GET", url: `${MENUS_URL}${Q}`, headers: ADMIN });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(1);
      expect(menuService.list).toHaveBeenCalledWith("venue-1");
    });

    it("creates a menu scoped to the query venue", async () => {
      menuService.create.mockResolvedValueOnce(menu);
      const response = await app.inject({
        method: "POST",
        url: `${MENUS_URL}${Q}`,
        headers: ADMIN,
        payload: { name: "Dinner", slug: "dinner" },
      });
      expect(response.statusCode).toBe(201);
      expect(menuService.create).toHaveBeenCalledWith("venue-1", {
        name: "Dinner",
        slug: "dinner",
      });
    });

    it("returns 409 for a duplicate slug in the venue", async () => {
      menuService.create.mockRejectedValueOnce(new MenuSlugConflictError("dinner"));
      const response = await app.inject({
        method: "POST",
        url: `${MENUS_URL}${Q}`,
        headers: ADMIN,
        payload: { name: "Dinner", slug: "dinner" },
      });
      expect(response.statusCode).toBe(409);
    });

    it("returns 409 when a PATCH renames a menu onto an existing slug", async () => {
      menuService.update.mockRejectedValueOnce(new MenuSlugConflictError("lunch"));
      const response = await app.inject({
        method: "PATCH",
        url: `${MENUS_URL}/menu-1${Q}`,
        headers: ADMIN,
        payload: { slug: "lunch" },
      });
      expect(response.statusCode).toBe(409);
    });

    it("rejects an invalid slug and unknown status with 400", async () => {
      for (const payload of [
        { name: "Dinner", slug: "Not A Slug" },
        { name: "Dinner", slug: "dinner", status: "PUBLISHED" },
      ]) {
        const response = await app.inject({
          method: "POST",
          url: `${MENUS_URL}${Q}`,
          headers: ADMIN,
          payload,
        });
        expect(response.statusCode).toBe(400);
      }
      expect(menuService.create).not.toHaveBeenCalled();
    });

    it("gets a menu with sections, scoped to the venue", async () => {
      menuService.getById.mockResolvedValueOnce({
        ...menu,
        sections: [{ ...section, items: [item] }],
      });
      const response = await app.inject({
        method: "GET",
        url: `${MENUS_URL}/menu-1${Q}`,
        headers: ADMIN,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.sections[0].items[0].name).toBe("Soup");
      expect(menuService.getById).toHaveBeenCalledWith("venue-1", "menu-1");
    });

    it("returns 404 for another venue's menu id (service finds nothing in the venue)", async () => {
      menuService.getById.mockResolvedValueOnce(null);
      menuService.update.mockResolvedValueOnce(null);
      menuService.delete.mockResolvedValueOnce(false);
      const get = await app.inject({
        method: "GET",
        url: `${MENUS_URL}/other${Q}`,
        headers: ADMIN,
      });
      const patch = await app.inject({
        method: "PATCH",
        url: `${MENUS_URL}/other${Q}`,
        headers: ADMIN,
        payload: { name: "x" },
      });
      const del = await app.inject({
        method: "DELETE",
        url: `${MENUS_URL}/other${Q}`,
        headers: ADMIN,
      });
      expect([get.statusCode, patch.statusCode, del.statusCode]).toEqual([404, 404, 404]);
      expect(menuService.getById).toHaveBeenCalledWith("venue-1", "other");
    });

    it("deletes a menu with 204", async () => {
      menuService.delete.mockResolvedValueOnce(true);
      const response = await app.inject({
        method: "DELETE",
        url: `${MENUS_URL}/menu-1${Q}`,
        headers: ADMIN,
      });
      expect(response.statusCode).toBe(204);
      expect(menuService.delete).toHaveBeenCalledWith("venue-1", "menu-1");
    });
  });

  describe("sections", () => {
    it("creates, updates and deletes a section within the venue", async () => {
      menuService.createSection.mockResolvedValueOnce(section);
      menuService.updateSection.mockResolvedValueOnce({ ...section, name: "Mains" });
      menuService.deleteSection.mockResolvedValueOnce(true);

      const created = await app.inject({
        method: "POST",
        url: `${MENUS_URL}/menu-1/sections${Q}`,
        headers: ADMIN,
        payload: { name: "Starters" },
      });
      const updated = await app.inject({
        method: "PATCH",
        url: `${MENUS_URL}/menu-1/sections/sec-1${Q}`,
        headers: ADMIN,
        payload: { name: "Mains" },
      });
      const deleted = await app.inject({
        method: "DELETE",
        url: `${MENUS_URL}/menu-1/sections/sec-1${Q}`,
        headers: ADMIN,
      });

      expect([created.statusCode, updated.statusCode, deleted.statusCode]).toEqual([201, 200, 204]);
      expect(menuService.createSection).toHaveBeenCalledWith("venue-1", "menu-1", {
        name: "Starters",
      });
      expect(menuService.updateSection).toHaveBeenCalledWith("venue-1", "menu-1", "sec-1", {
        name: "Mains",
      });
      expect(menuService.deleteSection).toHaveBeenCalledWith("venue-1", "menu-1", "sec-1");
    });

    it("returns 404 when the parent menu or section is not in the venue", async () => {
      menuService.createSection.mockResolvedValueOnce(null);
      menuService.updateSection.mockResolvedValueOnce(null);
      menuService.deleteSection.mockResolvedValueOnce(false);
      const create = await app.inject({
        method: "POST",
        url: `${MENUS_URL}/other/sections${Q}`,
        headers: ADMIN,
        payload: { name: "x" },
      });
      const update = await app.inject({
        method: "PATCH",
        url: `${MENUS_URL}/menu-1/sections/other${Q}`,
        headers: ADMIN,
        payload: { name: "x" },
      });
      const del = await app.inject({
        method: "DELETE",
        url: `${MENUS_URL}/menu-1/sections/other${Q}`,
        headers: ADMIN,
      });
      expect([create.statusCode, update.statusCode, del.statusCode]).toEqual([404, 404, 404]);
    });

    it("reorders sections, persisting the ids in the venue", async () => {
      menuService.reorderSections.mockResolvedValueOnce([section]);
      const response = await app.inject({
        method: "PUT",
        url: `${MENUS_URL}/menu-1/sections/order${Q}`,
        headers: ADMIN,
        payload: { ids: ["sec-2", "sec-1"] },
      });
      expect(response.statusCode).toBe(200);
      expect(menuService.reorderSections).toHaveBeenCalledWith("venue-1", "menu-1", [
        "sec-2",
        "sec-1",
      ]);
    });

    it("returns 404 when a reorder names a section outside the menu/venue", async () => {
      menuService.reorderSections.mockResolvedValueOnce(null);
      const response = await app.inject({
        method: "PUT",
        url: `${MENUS_URL}/menu-1/sections/order${Q}`,
        headers: ADMIN,
        payload: { ids: ["foreign"] },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("items", () => {
    it("creates, updates and deletes an item within the venue", async () => {
      menuService.createItem.mockResolvedValueOnce(item);
      menuService.updateItem.mockResolvedValueOnce({ ...item, status: "SOLD_OUT" });
      menuService.deleteItem.mockResolvedValueOnce(true);
      const base = `${MENUS_URL}/menu-1/sections/sec-1/items`;

      const created = await app.inject({
        method: "POST",
        url: `${base}${Q}`,
        headers: ADMIN,
        payload: { name: "Soup", priceCents: 850 },
      });
      const updated = await app.inject({
        method: "PATCH",
        url: `${base}/item-1${Q}`,
        headers: ADMIN,
        payload: { status: "SOLD_OUT" },
      });
      const deleted = await app.inject({
        method: "DELETE",
        url: `${base}/item-1${Q}`,
        headers: ADMIN,
      });

      expect([created.statusCode, updated.statusCode, deleted.statusCode]).toEqual([201, 200, 204]);
      expect(menuService.createItem).toHaveBeenCalledWith("venue-1", "menu-1", "sec-1", {
        name: "Soup",
        priceCents: 850,
      });
      expect(menuService.updateItem).toHaveBeenCalledWith("venue-1", "menu-1", "sec-1", "item-1", {
        status: "SOLD_OUT",
      });
      expect(menuService.deleteItem).toHaveBeenCalledWith("venue-1", "menu-1", "sec-1", "item-1");
    });

    it("rejects a negative price with 400", async () => {
      const response = await app.inject({
        method: "POST",
        url: `${MENUS_URL}/menu-1/sections/sec-1/items${Q}`,
        headers: ADMIN,
        payload: { name: "Soup", priceCents: -1 },
      });
      expect(response.statusCode).toBe(400);
      expect(menuService.createItem).not.toHaveBeenCalled();
    });

    it("returns 404 for items outside the venue", async () => {
      menuService.createItem.mockResolvedValueOnce(null);
      menuService.updateItem.mockResolvedValueOnce(null);
      menuService.deleteItem.mockResolvedValueOnce(false);
      const base = `${MENUS_URL}/menu-1/sections/sec-1/items`;
      const create = await app.inject({
        method: "POST",
        url: `${base}${Q}`,
        headers: ADMIN,
        payload: { name: "x", priceCents: 1 },
      });
      const update = await app.inject({
        method: "PATCH",
        url: `${base}/other${Q}`,
        headers: ADMIN,
        payload: { name: "x" },
      });
      const del = await app.inject({ method: "DELETE", url: `${base}/other${Q}`, headers: ADMIN });
      expect([create.statusCode, update.statusCode, del.statusCode]).toEqual([404, 404, 404]);
    });

    it("reorders items, venue-scoped", async () => {
      menuService.reorderItems.mockResolvedValueOnce([item]);
      const response = await app.inject({
        method: "PUT",
        url: `${MENUS_URL}/menu-1/sections/sec-1/items/order${Q}`,
        headers: ADMIN,
        payload: { ids: ["item-2", "item-1"] },
      });
      expect(response.statusCode).toBe(200);
      expect(menuService.reorderItems).toHaveBeenCalledWith("venue-1", "menu-1", "sec-1", [
        "item-2",
        "item-1",
      ]);
    });
  });
});
