import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";

const PAT = { authorization: "Bearer mbe_pat_valid" };
const READ_ONLY_TYPE = "urn:mbe:problem:token-read-only";

const tokens = {
  mint: vi.fn(),
  list: vi.fn(async () => []),
  revoke: vi.fn(),
  authenticate: vi.fn(),
};

describe("personal access token bearer (#9664)", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
    };
    delete process.env.AUTH_BYPASS_IN_TESTS;
    tokens.authenticate.mockImplementation(async (t: string) =>
      t === "mbe_pat_valid" ? { id: "tok-1", userSub: "auth0|me" } : null
    );
    app = await buildApp({ logger: false, services: { accessTokenService: tokens as never } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it("rejects an unknown, revoked or expired token with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/venues",
      headers: { authorization: "Bearer mbe_pat_unknown" },
    });
    expect(res.statusCode).toBe(401);
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it("authenticates a valid token as its owner without touching the JWT verifier", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/venues", headers: PAT });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
    expect(tokens.authenticate).toHaveBeenCalledWith("mbe_pat_valid");
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "answers 403 token-read-only to %s",
    async (method) => {
      const res = await app.inject({
        method,
        url: "/api/v1/venues/v1/tables",
        headers: PAT,
        payload: method === "DELETE" ? undefined : {},
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
    }
  );

  it("refuses a token on the token endpoints, even a GET", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/tokens", headers: PAT });
    expect(res.statusCode).toBe(403);
    expect(tokens.list).not.toHaveBeenCalled();
  });

  it("refuses a token on the token endpoints through a percent-encoded path", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/%74okens", headers: PAT });
    expect(res.statusCode).toBe(403);
    expect(tokens.list).not.toHaveBeenCalled();
  });

  it("leaves the JWT path unchanged, including writes", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "auth0|me", iss: "https://test.auth0.com/", aud: "https://api.example.com" },
      protectedHeader: { alg: "RS256" },
    } as never);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/tokens",
      headers: { authorization: "Bearer a.jwt.token" },
    });
    expect(res.statusCode).toBe(200);
    expect(jwtVerify).toHaveBeenCalled();
  });
});
