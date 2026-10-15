import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type * as AuthFastify from "@mbe/auth/fastify";
import { buildApp } from "../app.js";

// requireAuth is replaced with a no-op that leaves `request.user` unset, so the
// handler's own fail-closed `if (!user)` branch is the only thing between an
// unauthenticated caller and the data. The real guard is covered end to end in
// venues.test.ts / floor-plans.test.ts; this suite pins the backstop (#6520).
vi.mock("@mbe/auth/fastify", async (importOriginal) => ({
  ...(await importOriginal<typeof AuthFastify>()),
  requireAuth: async () => undefined,
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

describe("handler fail-closed backstop when requireAuth leaves request.user unset", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "false",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it.each(["/api/v1/venues", "/api/v1/floor-plans"])(
    "GET %s answers 401 Authentication required",
    async (url) => {
      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        status: 401,
        title: "Unauthorized",
        detail: "Authentication required",
      });
    }
  );
});
