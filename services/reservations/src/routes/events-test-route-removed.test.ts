import { describe, it, expect, afterAll, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

/**
 * `POST /api/v1/events/test` was a dev-only helper with no preHandler that let
 * any caller push arbitrary SSE events to any venue on every non-production
 * deploy. Matt ruled it deleted (docs/fixes/venue-scoped-routes, PR 5).
 */
describe("POST /api/v1/events/test (deleted)", () => {
  const originalEnv = process.env;
  const TEST_EVENT_URL = "/api/v1/events/test";
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env = originalEnv;
  });

  it("is not registered in a non-production app", async () => {
    const emitted: unknown[] = [];
    app.reservationEvents.onChange((event) => emitted.push(event));

    const response = await app.inject({
      method: "POST",
      url: TEST_EVENT_URL,
      headers: { "x-auth-bypass": "true" },
      payload: { type: "reservation:created", venueId: "venue-1", data: {} },
    });

    expect(response.statusCode).toBe(404);
    expect(emitted).toEqual([]);
  });
});
