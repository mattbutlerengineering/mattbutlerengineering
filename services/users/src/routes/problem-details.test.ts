/**
 * Regression tests — RFC 7807 problem-details on error responses.
 *
 * Verifies that all 4xx/5xx responses from the users service carry the
 * required RFC 7807 fields: type, title, status, detail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { MOCK_JWT_PAYLOAD } from "../test/fixtures.js";

vi.mock("../services/user.js", () => ({
  userService: {
    list: vi.fn(),
    getById: vi.fn(),
    getByEmail: vi.fn(),
    create: vi.fn(),
    findOrCreate: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: MOCK_JWT_PAYLOAD,
    protectedHeader: { alg: "RS256" },
  }),
}));

import { userService } from "../services/user.js";
import { buildApp } from "../app.js";

describe("Users service — RFC 7807 problem-details regression", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.AUTH_AUTHORITY = "https://test.auth0.com";
    process.env.AUTH_AUDIENCE = "https://api.test.com";
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

  it("404 on user not found carries RFC 7807 fields", async () => {
    vi.mocked(userService.getById).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/nonexistent-id",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    assertProblemDetails(body);
    expect(body.status).toBe(404);
    expect(body.detail).toBeTruthy();
  });

  it("400 validation error carries RFC 7807 fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { authorization: "Bearer valid-token" },
      payload: { name: "Missing email" },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    assertProblemDetails(body);
    expect(body.status).toBe(400);
    expect(body.detail).toBeTruthy();
  });

  it("401 unauthenticated response carries RFC 7807 fields", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    assertProblemDetails(body);
    expect(body.status).toBe(401);
    expect(body.detail).toBeTruthy();
  });

  it("500 from thrown error carries RFC 7807 fields", async () => {
    vi.mocked(userService.getById).mockRejectedValueOnce(new Error("DB connection lost"));

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/some-id",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    assertProblemDetails(body);
    expect(body.status).toBe(500);
    expect(body.detail).toBeTruthy();
  });
});
