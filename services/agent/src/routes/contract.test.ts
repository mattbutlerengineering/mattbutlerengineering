import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";

vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    triggerSession: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
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

const mockJwtVerify = vi.fn();
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: mockJwtVerify,
}));

import { getActiveSessionCount } from "../services/session-executor.js";
import { sessionService } from "../services/session.js";

describe("Agent Service API Contract", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      MAX_CONCURRENT_SESSIONS: "5",
    };
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  it("POST /v1/sessions returns 429 when max concurrent reached", async () => {
    vi.mocked(getActiveSessionCount).mockReturnValueOnce(5);
    vi.mocked(sessionService.triggerSession).mockResolvedValueOnce({
      session: null,
      accepted: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      headers: {
        "x-auth-bypass": "true",
      },
      payload: { taskDescription: "Another task" },
    });

    expect(response.statusCode).toBe(429);
  });
});
