import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import type { DomainServices } from "../services/domain-services.js";
import { PublicMenuSchema, PublicMenuDetailSchema } from "@mbe/types/schemas";

const venueService = {
  getBySlug: vi.fn(),
  getPublicConfigBySlug: vi.fn(),
} as unknown as DomainServices["venueService"];

const menuService = {
  listPublic: vi.fn(),
  getPublicBySlug: vi.fn(),
} as unknown as DomainServices["menuService"];

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

// Slug resolution is a raw `$queryRaw` the mock database can't answer; RLS
// resolution itself is covered by rls-route-sweep.integration.test.ts.
vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

import { resolveVenueId } from "../services/resolve-venue.js";

const listed = [
  { id: "m1", name: "Dinner", slug: "dinner", description: null, displayOrder: 0 },
  { id: "m2", name: "Brunch", slug: "brunch", description: "Weekends", displayOrder: 1 },
];

const detail = {
  id: "m1",
  name: "Dinner",
  slug: "dinner",
  description: null,
  displayOrder: 0,
  sections: [
    {
      id: "s1",
      name: "Starters",
      displayOrder: 0,
      items: [
        {
          id: "i1",
          name: "Soup",
          description: null,
          priceCents: 850,
          status: "AVAILABLE" as const,
          displayOrder: 0,
        },
        {
          id: "i2",
          name: "Oysters",
          description: "Half dozen",
          priceCents: 1800,
          status: "SOLD_OUT" as const,
          displayOrder: 1,
        },
      ],
    },
  ],
};

describe("public menu routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false, services: { venueService, menuService } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  beforeEach(() => {
    vi.mocked(menuService.listPublic).mockReset();
    vi.mocked(menuService.getPublicBySlug).mockReset();
    vi.mocked(venueService.getPublicConfigBySlug).mockReset();
  });

  describe("GET /public/v1/venues/:slug/menus", () => {
    it("lists the venue's active menus without authentication, scoped to the resolved venue", async () => {
      vi.mocked(menuService.listPublic).mockResolvedValueOnce(listed);

      const response = await app.inject({ method: "GET", url: "/public/v1/venues/the-oak/menus" });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ data: unknown[] }>();
      expect(body.data).toHaveLength(2);
      for (const menu of body.data) expect(PublicMenuSchema.safeParse(menu).success).toBe(true);
      expect(menuService.listPublic).toHaveBeenCalledWith("venue-1");
    });

    it("pins the list payload field list (no item bodies, no internal fields)", async () => {
      vi.mocked(menuService.listPublic).mockResolvedValueOnce(listed);

      const response = await app.inject({ method: "GET", url: "/public/v1/venues/the-oak/menus" });

      const [first] = response.json<{ data: Record<string, unknown>[] }>().data;
      expect(Object.keys(first!).sort()).toEqual(
        ["description", "displayOrder", "id", "name", "slug"].sort()
      );
    });

    it("returns an RFC 7807 404 for an unknown venue slug", async () => {
      vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

      const response = await app.inject({ method: "GET", url: "/public/v1/venues/nope/menus" });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ status: 404, title: "Not Found" });
      expect(menuService.listPublic).not.toHaveBeenCalled();
    });

    it("carries the same rate-limit headers as GET /public/v1/venues/:slug", async () => {
      vi.mocked(menuService.listPublic).mockResolvedValueOnce(listed);
      vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce(null);

      const menus = await app.inject({ method: "GET", url: "/public/v1/venues/the-oak/menus" });
      const venue = await app.inject({ method: "GET", url: "/public/v1/venues/the-oak" });

      expect(menus.headers["x-ratelimit-limit"]).toBeDefined();
      expect(menus.headers["x-ratelimit-limit"]).toBe(venue.headers["x-ratelimit-limit"]);
    });
  });

  describe("GET /public/v1/venues/:slug/menus/:menuSlug", () => {
    it("returns one menu with sections, items and the venue currency", async () => {
      vi.mocked(menuService.getPublicBySlug).mockResolvedValueOnce(detail);
      vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce({
        currencyCode: "USD",
      } as never);

      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak/menus/dinner",
      });

      expect(response.statusCode).toBe(200);
      const { data } = response.json<{ data: Record<string, unknown> }>();
      expect(data.currencyCode).toBe("USD");
      expect(PublicMenuDetailSchema.safeParse(data).success).toBe(true);
      expect(menuService.getPublicBySlug).toHaveBeenCalledWith("venue-1", "dinner");
    });

    it("keeps SOLD_OUT items in the payload", async () => {
      vi.mocked(menuService.getPublicBySlug).mockResolvedValueOnce(detail);
      vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce({
        currencyCode: "USD",
      } as never);

      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak/menus/dinner",
      });

      const items = response.json<{ data: typeof detail }>().data.sections[0]!.items;
      expect(items.map((i) => i.status)).toEqual(["AVAILABLE", "SOLD_OUT"]);
    });

    it("pins the detail payload field list and never leaks internal fields", async () => {
      vi.mocked(menuService.getPublicBySlug).mockResolvedValueOnce({
        ...detail,
        venueId: "venue-1",
        status: "ACTIVE",
        sections: [
          {
            ...detail.sections[0]!,
            venueId: "venue-1",
            items: [{ ...detail.sections[0]!.items[0]!, venueId: "venue-1", sectionId: "s1" }],
          },
        ],
      } as never);
      vi.mocked(venueService.getPublicConfigBySlug).mockResolvedValueOnce({
        currencyCode: "USD",
      } as never);

      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak/menus/dinner",
      });

      const { data } = response.json<{ data: typeof detail & { currencyCode: string } }>();
      expect(Object.keys(data).sort()).toEqual(
        ["currencyCode", "description", "displayOrder", "id", "name", "sections", "slug"].sort()
      );
      expect(Object.keys(data.sections[0]!).sort()).toEqual(
        ["displayOrder", "id", "items", "name"].sort()
      );
      expect(Object.keys(data.sections[0]!.items[0]!).sort()).toEqual(
        ["description", "displayOrder", "id", "name", "priceCents", "status"].sort()
      );
    });

    it("returns 404 for a menu that is not active or does not exist", async () => {
      vi.mocked(menuService.getPublicBySlug).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/the-oak/menus/draft-menu",
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ status: 404 });
    });

    it("returns an RFC 7807 404 for an unknown venue slug", async () => {
      vi.mocked(resolveVenueId).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/public/v1/venues/nope/menus/dinner",
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ status: 404, title: "Not Found" });
    });
  });
});
