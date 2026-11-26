import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { DuplicateConfirmNonceError } from "../services/access-token-audit.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from "jose";

const WRITER = { authorization: "Bearer mbe_pat_writer" };
const READER = { authorization: "Bearer mbe_pat_reader" };
const MOVE = { startTime: "2026-12-01T19:00:00.000Z", tableId: "t2" };

const tokens = { authenticate: vi.fn() };
const audit = { record: vi.fn(), recordStatus: vi.fn() };
/** Any method on this records a call: a handler that reached it ran. */
const handlerCalls = vi.fn();
const reservationService = new Proxy({}, { get: () => handlerCalls });

describe("write audit for write-scoped tokens (#9780)", () => {
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
      if (t === "mbe_pat_writer") return { id: "tok-2", userSub: "auth0|me", write: true };
      if (t === "mbe_pat_reader") return { id: "tok-1", userSub: "auth0|me", write: false };
      return null;
    });
    audit.record.mockResolvedValue("audit-1");
    audit.recordStatus.mockResolvedValue(undefined);
    app = await buildApp({
      logger: false,
      services: {
        accessTokenService: tokens as never,
        accessTokenAuditService: audit as never,
        reservationService: reservationService as never,
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  it("writes one row for an allowlisted write, then records the status", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/reservations/r1",
      headers: { ...WRITER, "mbe-tool": "move_booking", "mbe-confirm-nonce": "n-1" },
      payload: MOVE,
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith({
      tokenId: "tok-2",
      userSub: "auth0|me",
      method: "PATCH",
      route: "/api/v1/reservations/:id",
      venueId: null,
      input: { params: { id: "r1" }, query: {}, body: MOVE },
      tool: "move_booking",
      confirmNonce: "n-1",
    });
    expect(audit.recordStatus).toHaveBeenCalledWith("audit-1", res.statusCode);
  });

  it("answers 503 and runs no handler when the insert fails", async () => {
    audit.record.mockRejectedValue(new Error("db down"));
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/reservations/r1",
      headers: WRITER,
      payload: MOVE,
    });
    expect(res.statusCode).toBe(503);
    expect(handlerCalls).not.toHaveBeenCalled();
    expect(audit.recordStatus).not.toHaveBeenCalled();
  });

  it("answers 409 and runs no handler for a replayed confirm nonce", async () => {
    audit.record.mockRejectedValue(new DuplicateConfirmNonceError());
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/reservations/r1",
      headers: { ...WRITER, "mbe-confirm-nonce": "n-1" },
      payload: MOVE,
    });
    expect(res.statusCode).toBe(409);
    expect(handlerCalls).not.toHaveBeenCalled();
  });

  it("writes no row for a write the allowlist refuses", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/reservations/r1",
      headers: WRITER,
      payload: { status: "CANCELLED" },
    });
    expect(res.statusCode).toBe(403);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("writes no row for a read-only token's GET", async () => {
    await app.inject({ method: "GET", url: "/api/v1/venues", headers: READER });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("writes no row for a write-scoped token's GET", async () => {
    await app.inject({ method: "GET", url: "/api/v1/venues", headers: WRITER });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("writes no row for a session caller's write", async () => {
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "auth0|me", iss: "https://test.auth0.com/", aud: "https://api.example.com" },
      protectedHeader: { alg: "RS256" },
    } as never);
    await app.inject({
      method: "PATCH",
      url: "/api/v1/reservations/r1",
      headers: { authorization: "Bearer a.jwt.token" },
      payload: MOVE,
    });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
