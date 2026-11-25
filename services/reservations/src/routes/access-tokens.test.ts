import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { TooManyAccessTokensError } from "../services/access-token.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";

const URL = "/api/v1/me/tokens";
const BEARER = { authorization: "Bearer token" };

const token = {
  id: "tok-1",
  name: "Claude Desktop",
  prefix: "mbe_pat_abcd",
  createdAt: "2026-11-25T12:00:00.000Z",
  lastUsedAt: null,
  expiresAt: null,
};

const svc = { mint: vi.fn(), list: vi.fn(), revoke: vi.fn() };

async function appAs(sub: string): Promise<FastifyInstance> {
  vi.mocked(jwtVerify).mockResolvedValue({
    payload: {
      sub,
      iss: "https://test.auth0.com/",
      aud: "https://api.example.com",
      permissions: [],
    },
    protectedHeader: { alg: "RS256" },
  } as never);
  const built = await buildApp({ logger: false, services: { accessTokenService: svc as never } });
  await built.ready();
  return built;
}

describe("Access token routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
  });

  afterEach(async () => {
    await app?.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it("requires authentication", async () => {
    app = await appAs("auth0|me");
    for (const [method, url] of [
      ["GET", URL],
      ["POST", URL],
      ["DELETE", `${URL}/tok-1`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        payload: method === "POST" ? { name: "x" } : undefined,
      });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("mints a token for the caller and returns the plaintext once", async () => {
    app = await appAs("auth0|me");
    svc.mint.mockResolvedValueOnce({ ...token, token: "mbe_pat_secret" });

    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: BEARER,
      payload: { name: "Claude Desktop", expiresInDays: 90 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toEqual({ ...token, token: "mbe_pat_secret" });
    expect(svc.mint).toHaveBeenCalledWith("auth0|me", {
      name: "Claude Desktop",
      expiresInDays: 90,
    });
  });

  it("rejects an expiry beyond one year or a blank name with 400", async () => {
    app = await appAs("auth0|me");
    for (const payload of [{ name: "x", expiresInDays: 366 }, { name: "" }, {}]) {
      const res = await app.inject({ method: "POST", url: URL, headers: BEARER, payload });
      expect(res.statusCode).toBe(400);
    }
    expect(svc.mint).not.toHaveBeenCalled();
  });

  it("refuses an eleventh active token with a problem detail", async () => {
    app = await appAs("auth0|me");
    svc.mint.mockRejectedValueOnce(new TooManyAccessTokensError());

    const res = await app.inject({
      method: "POST",
      url: URL,
      headers: BEARER,
      payload: { name: "x" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      status: 409,
      detail: expect.stringContaining("at most 10"),
    });
  });

  it("lists the caller's tokens", async () => {
    app = await appAs("auth0|me");
    svc.list.mockResolvedValueOnce([token]);

    const res = await app.inject({ method: "GET", url: URL, headers: BEARER });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([token]);
    expect(svc.list).toHaveBeenCalledWith("auth0|me");
  });

  it("revokes the caller's token with 204", async () => {
    app = await appAs("auth0|me");
    svc.revoke.mockResolvedValueOnce(true);

    const res = await app.inject({ method: "DELETE", url: `${URL}/tok-1`, headers: BEARER });

    expect(res.statusCode).toBe(204);
    expect(svc.revoke).toHaveBeenCalledWith("auth0|me", "tok-1");
  });

  it("answers 404 for another user's or unknown token", async () => {
    app = await appAs("auth0|me");
    svc.revoke.mockResolvedValueOnce(false);

    const res = await app.inject({
      method: "DELETE",
      url: `${URL}/someone-elses`,
      headers: BEARER,
    });

    expect(res.statusCode).toBe(404);
  });
});
