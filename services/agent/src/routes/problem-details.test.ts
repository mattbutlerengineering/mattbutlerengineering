/**
 * Regression tests — RFC 7807 problem-details on error responses.
 *
 * Verifies that all 4xx/5xx responses from the agent service carry the
 * required RFC 7807 fields: type, title, status, detail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    triggerSession: vi.fn(),
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

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

import { sessionService } from "../services/session.js";
import { buildApp } from "../app.js";

describe("Agent service — RFC 7807 problem-details regression", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // AUTH_BYPASS_IN_TESTS=true is set in vitest.config.ts; AUTH_AUTHORITY/AUDIENCE
    // are also set there. Use x-auth-bypass header to skip JWT validation.
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  function assertProblemDetails(body: Record<string, unknown>) {
    expect(body.type).toBeDefined();
    expect(typeof body.type).toBe("string");
    expect(body.title).toBeDefined();
    expect(typeof body.title).toBe("string");
    expect(body.status).toBeDefined();
    expect(typeof body.status).toBe("number");
    expect(body.detail).toBeDefined();
    expect(typeof body.detail).toBe("string");
  }

  it("404 on session not found carries RFC 7807 fields", async () => {
    vi.mocked(sessionService.getById).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/nonexistent-session-id",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    assertProblemDetails(body);
    expect(body.status).toBe(404);
    expect(body.detail).toBeTruthy();
  });

  it("400 on invalid create session body carries RFC 7807 fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers: { "x-auth-bypass": "true" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    assertProblemDetails(body);
    expect(body.status).toBe(400);
    expect(body.detail).toBeTruthy();
  });

  it("500 from thrown error carries RFC 7807 fields", async () => {
    vi.mocked(sessionService.getById).mockRejectedValueOnce(new Error("DB connection lost"));

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/some-id",
      headers: { "x-auth-bypass": "true" },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    assertProblemDetails(body);
    expect(body.status).toBe(500);
    expect(body.detail).toBeTruthy();
  });
});
