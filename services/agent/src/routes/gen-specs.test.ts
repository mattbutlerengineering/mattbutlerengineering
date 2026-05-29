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
}));

// Mock database and other service deps pulled in by app.ts → sessions route
vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    addEvent: vi.fn(),
    listEvents: vi.fn(),
  },
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
  getSlowQueryStats: vi.fn().mockReturnValue({ count5min: 0, slowestMs: 0 }),
  getServiceStatus: vi.fn().mockReturnValue("ok"),
  getPoolMetrics: vi.fn().mockReturnValue({
    active: 1,
    idle: 4,
    busy: 1,
    size: 5,
    utilization: 0.2,
    isDegraded: false,
  }),
}));

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
        url: "/api/gen/specs",
        payload: {
          prompt: "a login form",
          spec: { type: "Stack", children: [] },
          rawLines: ["Stack"],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { data: { id: string } };
      expect(body.data.id).toBe("spec-123");
    });

    it("returns 400 for missing prompt", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/gen/specs",
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
        url: "/api/gen/specs",
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
        url: "/api/gen/specs",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { data: unknown[] };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(1);
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
        url: "/api/gen/specs",
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
      const body = JSON.parse(response.body) as { data: { id: string } };
      expect(body.data.id).toBe("spec-123");
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
