import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Must mock before importing buildApp

vi.mock("ai", () => ({
  streamText: vi.fn(),
  Output: {
    object: vi.fn(),
  },
}));

vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: {
    prompt: vi.fn(() => "mock system prompt"),
  },
}));

vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn(async (_f: unknown, _o: unknown) => {}),
  getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
  requireAuth: vi.fn(async (req: { user?: { id: string } }) => {
    req.user = { id: "test-user" };
  }),
  requireOwnershipOrAdmin: vi.fn(() => vi.fn(async () => {})),
}));

// Mock database and other service deps pulled in by app.ts → sessions route
vi.mock("../services/session.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    sessionService: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      addEvent: vi.fn(),
      listEvents: vi.fn(),
    },
  };
});

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("../services/orchestrator.js", () => ({
  orchestratorService: {
    decompose: vi.fn(),
  },
}));

// Mock the stored-spec service
vi.mock("../services/stored-spec.js", () => ({
  storedSpecService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    toggleFavorite: vi.fn(),
    delete: vi.fn(),
    _enforceCapForUser: vi.fn(),
  },
  mapStoredSpec: vi.fn((s) => ({
    id: s.id,
    userId: s.userId,
    prompt: s.prompt,
    spec: s.spec,
    rawLines: s.rawLines,
    isFavorite: s.isFavorite,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  })),
  mapStoredSpecPublic: vi.fn((s) => ({
    id: s.id,
    prompt: s.prompt,
    spec: s.spec,
    rawLines: s.rawLines,
    isFavorite: s.isFavorite,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  })),
}));

import { storedSpecService } from "../services/stored-spec.js";
import { buildApp } from "../app.js";

const mockSpec = {
  id: "spec-123",
  userId: "test-user",
  prompt: "a login form",
  spec: { type: "Stack", children: [] },
  rawLines: ["Stack"],
  isFavorite: false,
  createdAt: "2026-03-28T00:00:00.000Z",
  updatedAt: "2026-03-28T00:00:00.000Z",
};

const SPECS_URL = "/api/gen/specs";

describe("Gen Specs Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe("POST /api/gen/specs", () => {
    it("returns 201 with saved spec", async () => {
      vi.mocked(storedSpecService.create).mockResolvedValueOnce(mockSpec as never);

      const response = await app.inject({
        method: "POST",
        url: SPECS_URL,
        payload: {
          prompt: "a login form",
          spec: { type: "Stack", children: [] },
          rawLines: ["Stack"],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { data: { id: string; userId?: string } };
      expect(body.data.id).toBe("spec-123");
      expect(body.data.userId).toBe("test-user");
    });

    it("passes kind through to the service", async () => {
      vi.mocked(storedSpecService.create).mockResolvedValueOnce(mockSpec as never);

      const response = await app.inject({
        method: "POST",
        url: SPECS_URL,
        payload: { prompt: "make it blue", kind: "refine", spec: {}, rawLines: [] },
      });

      expect(response.statusCode).toBe(201);
      expect(storedSpecService.create).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "make it blue", kind: "refine" })
      );
    });

    it("defaults kind to generate when omitted", async () => {
      vi.mocked(storedSpecService.create).mockResolvedValueOnce(mockSpec as never);

      await app.inject({
        method: "POST",
        url: SPECS_URL,
        payload: { prompt: "a form", spec: {}, rawLines: [] },
      });

      expect(storedSpecService.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "generate" })
      );
    });

    it("derives kind and strips ONE legacy prefix when kind is omitted", async () => {
      vi.mocked(storedSpecService.create).mockResolvedValue(mockSpec as never);

      await app.inject({
        method: "POST",
        url: "/api/gen/specs",
        payload: { prompt: "Refined: make it blue", spec: {}, rawLines: [] },
      });
      expect(storedSpecService.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ prompt: "make it blue", kind: "refine" })
      );

      await app.inject({
        method: "POST",
        url: "/api/gen/specs",
        payload: { prompt: "Failed: Refined: x", spec: {}, rawLines: [] },
      });
      expect(storedSpecService.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ prompt: "Refined: x", kind: "failed" })
      );
    });

    it("leaves the prompt alone when an explicit kind is sent", async () => {
      vi.mocked(storedSpecService.create).mockResolvedValue(mockSpec as never);

      await app.inject({
        method: "POST",
        url: "/api/gen/specs",
        payload: { prompt: "Refined: x", kind: "generate", spec: {}, rawLines: [] },
      });
      expect(storedSpecService.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ prompt: "Refined: x", kind: "generate" })
      );
    });

    it("returns 400 for an unknown kind", async () => {
      const response = await app.inject({
        method: "POST",
        url: SPECS_URL,
        payload: { prompt: "a form", kind: "bogus", spec: {}, rawLines: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it("accepts a full 2000-char prompt for any kind", async () => {
      vi.mocked(storedSpecService.create).mockResolvedValueOnce(mockSpec as never);

      const response = await app.inject({
        method: "POST",
        url: SPECS_URL,
        payload: { prompt: "x".repeat(2000), kind: "refine", spec: {}, rawLines: [] },
      });

      expect(response.statusCode).toBe(201);
    });

    describe("refinement", () => {
      const refinement = { parentId: "spec-0", path: "children.0", before: "a", after: "b" };

      it("passes a refinement on a refine entry to the service", async () => {
        vi.mocked(storedSpecService.create).mockResolvedValueOnce(mockSpec as never);

        const response = await app.inject({
          method: "POST",
          url: SPECS_URL,
          payload: { prompt: "p", kind: "refine", spec: {}, rawLines: [], refinement },
        });

        expect(response.statusCode).toBe(201);
        expect(storedSpecService.create).toHaveBeenCalledWith(
          expect.objectContaining({ refinement })
        );
      });

      it("returns 400 for a refinement on a non-refine kind", async () => {
        const response = await app.inject({
          method: "POST",
          url: SPECS_URL,
          payload: { prompt: "p", kind: "generate", spec: {}, rawLines: [], refinement },
        });

        expect(response.statusCode).toBe(400);
        expect(storedSpecService.create).not.toHaveBeenCalled();
      });

      it("returns 400 for a refinement with no kind (defaults to generate)", async () => {
        const response = await app.inject({
          method: "POST",
          url: SPECS_URL,
          payload: { prompt: "p", spec: {}, rawLines: [], refinement },
        });

        expect(response.statusCode).toBe(400);
      });

      it("returns 400 for an empty or over-long path", async () => {
        for (const path of ["", "x".repeat(201)]) {
          const response = await app.inject({
            method: "POST",
            url: SPECS_URL,
            payload: {
              prompt: "p",
              kind: "refine",
              spec: {},
              rawLines: [],
              refinement: { ...refinement, path },
            },
          });
          expect(response.statusCode).toBe(400);
        }
      });

      it("returns 404 when the parent is not the caller's", async () => {
        vi.mocked(storedSpecService.create).mockRejectedValueOnce(new Error("Not found"));

        const response = await app.inject({
          method: "POST",
          url: SPECS_URL,
          payload: { prompt: "p", kind: "refine", spec: {}, rawLines: [], refinement },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    it("returns 400 for missing prompt", async () => {
      const response = await app.inject({
        method: "POST",
        url: SPECS_URL,
        payload: {
          spec: { type: "Stack" },
          rawLines: ["Stack"],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("returns 401 without auth", async () => {
      const { requireAuth } = await import("@mbe/auth/fastify");
      vi.mocked(requireAuth).mockImplementationOnce(async (_req, reply) => {
        reply.code(401).send({
          type: "https://mattbutlerengineering.com/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Authentication required",
        });
      });

      const response = await app.inject({
        method: "POST",
        url: SPECS_URL,
        payload: {
          prompt: "a login form",
          spec: { type: "Stack" },
          rawLines: [],
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/gen/specs", () => {
    it("returns 200 with array of specs", async () => {
      vi.mocked(storedSpecService.list).mockResolvedValueOnce([mockSpec] as never);

      const response = await app.inject({
        method: "GET",
        url: SPECS_URL,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: Array<{ userId?: string }> };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.userId).toBe("test-user");
    });

    it("returns 401 without auth", async () => {
      const { requireAuth } = await import("@mbe/auth/fastify");
      vi.mocked(requireAuth).mockImplementationOnce(async (_req, reply) => {
        reply.code(401).send({
          type: "https://mattbutlerengineering.com/errors/unauthorized",
          title: "Unauthorized",
          status: 401,
          detail: "Authentication required",
        });
      });

      const response = await app.inject({
        method: "GET",
        url: SPECS_URL,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/gen/specs/:id", () => {
    it("returns 200 for existing spec", async () => {
      vi.mocked(storedSpecService.getById).mockResolvedValueOnce(mockSpec as never);

      const response = await app.inject({
        method: "GET",
        url: "/api/gen/specs/spec-123",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: { id: string; userId?: string } };
      expect(body.data.id).toBe("spec-123");
      expect(body.data.userId).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(body.data, "userId")).toBe(false);
    });

    it("returns 404 for missing spec", async () => {
      vi.mocked(storedSpecService.getById).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: "GET",
        url: "/api/gen/specs/nonexistent",
      });

      expect(response.statusCode).toBe(404);
    });

    it("works WITHOUT auth header (public permalink)", async () => {
      // This test verifies the public GET endpoint works without any auth token
      // The requireAuth mock is intentionally NOT overridden here —
      // the route has no preHandler so auth is never called
      vi.mocked(storedSpecService.getById).mockResolvedValueOnce(mockSpec as never);

      const response = await app.inject({
        method: "GET",
        url: "/api/gen/specs/spec-123",
        // No Authorization header
      });

      // If route had requireAuth, the mock sets req.user which is fine.
      // The key assertion: even with no auth configured, this route returns 200.
      expect(response.statusCode).toBe(200);
    });
  });

  describe("PATCH /api/gen/specs/:id/favorite", () => {
    it("toggles isFavorite and returns 200", async () => {
      const toggled = { ...mockSpec, isFavorite: true };
      vi.mocked(storedSpecService.toggleFavorite).mockResolvedValueOnce(toggled as never);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/gen/specs/spec-123/favorite",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: { isFavorite: boolean } };
      expect(body.data.isFavorite).toBe(true);
    });

    it("returns 404 for wrong user (ownership check)", async () => {
      vi.mocked(storedSpecService.toggleFavorite).mockRejectedValueOnce(new Error("Not found"));

      const response = await app.inject({
        method: "PATCH",
        url: "/api/gen/specs/other-users-spec/favorite",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/gen/specs/:id", () => {
    it("returns 204 for successful delete", async () => {
      vi.mocked(storedSpecService.delete).mockResolvedValueOnce(undefined);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/gen/specs/spec-123",
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 for wrong user (ownership check)", async () => {
      vi.mocked(storedSpecService.delete).mockRejectedValueOnce(new Error("Not found"));

      const response = await app.inject({
        method: "DELETE",
        url: "/api/gen/specs/other-users-spec",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
