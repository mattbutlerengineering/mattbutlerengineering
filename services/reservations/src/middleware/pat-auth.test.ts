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
    tokens.authenticate.mockImplementation(async (t: string) => {
      if (t === "mbe_pat_valid") return { id: "tok-1", userSub: "auth0|me", write: false };
      if (t === "mbe_pat_writer") return { id: "tok-2", userSub: "auth0|me", write: true };
      return null;
    });
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

  describe("write scope (#9778)", () => {
    const WRITER = { authorization: "Bearer mbe_pat_writer" };
    const ALLOWED = [
      ["PATCH", "/api/v1/reservations/r1"],
      ["POST", "/api/v1/venues/v1/closures/impact"],
      ["POST", "/api/v1/venues/v1/closures"],
      ["DELETE", "/api/v1/venues/v1/closures/rule-1"],
    ] as const;
    const send = (method: string, url: string, headers: Record<string, string>) =>
      app.inject({
        method: method as "POST",
        url,
        headers,
        payload: method === "DELETE" ? undefined : {},
      });

    it.each(ALLOWED)("lets a write-scoped token past the guard on %s %s", async (method, url) => {
      const res = await send(method, url, WRITER);
      expect(res.body).not.toContain(READ_ONLY_TYPE);
    });

    it.each(ALLOWED)("still refuses a read-only token on %s %s", async (method, url) => {
      const res = await send(method, url, PAT);
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
    });

    it.each([
      ["POST", "/api/v1/reservations"],
      ["DELETE", "/api/v1/reservations/r1"],
      ["POST", "/api/v1/venues/v1/tables"],
      ["POST", "/api/v1/venues/v1/closures/batch"],
      ["POST", "/api/v1/me/tokens"],
      ["DELETE", "/api/v1/me/tokens/tok-1"],
    ] as const)("refuses a write-scoped token on %s %s", async (method, url) => {
      const res = await send(method, url, WRITER);
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
    });

    it.each([
      { status: "CANCELLED" },
      { status: "NO_SHOW" },
      { override: { reason: "x" } },
      { notes: "x" },
      { startTime: "2026-12-01T19:00:00.000Z", cancellationReason: "x" },
    ])("refuses a write-scoped token a booking change beyond a move: %j", async (payload) => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/r1",
        headers: WRITER,
        payload,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
    });

    it("lets a write-scoped token move a booking (time and table)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/reservations/r1",
        headers: WRITER,
        payload: { startTime: "2026-12-01T19:00:00.000Z", tableId: "t2" },
      });
      expect(res.body).not.toContain(READ_ONLY_TYPE);
    });

    it("refuses a write-scoped token on the token endpoints, even a GET", async () => {
      for (const url of ["/api/v1/me/tokens", "/api/v1/me/%74okens"]) {
        const res = await app.inject({ method: "GET", url, headers: WRITER });
        expect(res.statusCode).toBe(403);
      }
      expect(tokens.list).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/v1/me/access-token (#9781)", () => {
    const URL = "/api/v1/me/access-token";

    it("tells a read-only token it is not write-scoped, without any secret", async () => {
      const res = await app.inject({ method: "GET", url: URL, headers: PAT });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { write: false } });
      expect(res.body).not.toContain("mbe_pat_");
    });

    it("tells a write-scoped token it is write-scoped", async () => {
      const res = await app.inject({
        method: "GET",
        url: URL,
        headers: { authorization: "Bearer mbe_pat_writer" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: { write: true } });
      expect(tokens.list).not.toHaveBeenCalled();
    });

    it("answers 404 to a session (JWT) caller", async () => {
      vi.mocked(jwtVerify).mockResolvedValue({
        payload: {
          sub: "auth0|me",
          iss: "https://test.auth0.com/",
          aud: "https://api.example.com",
        },
        protectedHeader: { alg: "RS256" },
      } as never);
      const res = await app.inject({
        method: "GET",
        url: URL,
        headers: { authorization: "Bearer a.jwt.token" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("answers 401 without a bearer", async () => {
      const res = await app.inject({ method: "GET", url: URL });
      expect(res.statusCode).toBe(401);
    });

    it("keeps every other token endpoint blocked for the same token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/me/tokens",
        headers: { authorization: "Bearer mbe_pat_writer" },
      });
      expect(res.statusCode).toBe(403);
    });
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

  it("leaves a session caller's booking change unrestricted by the move-only rule", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "auth0|me", iss: "https://test.auth0.com/", aud: "https://api.example.com" },
      protectedHeader: { alg: "RS256" },
    } as never);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/reservations/r1",
      headers: { authorization: "Bearer a.jwt.token" },
      payload: { status: "CANCELLED", notes: "x" },
    });
    expect(res.body).not.toContain(READ_ONLY_TYPE);
  });
});
