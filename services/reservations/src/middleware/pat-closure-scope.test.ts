import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { AVAILABILITY_CONFIG_PREFIX } from "@mbe/types";
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

/**
 * A write-scoped token may only pause and resume tables (#9778): the closure
 * routes accept exactly the table-pause shape `pause_tables` sends, and a
 * reopen only of a rule stored as a table pause.
 */
const WRITER = { authorization: "Bearer mbe_pat_writer", "idempotency-key": "k-1" };
const SESSION = { authorization: "Bearer a.jwt.token", "idempotency-key": "k-1" };
const READ_ONLY_TYPE = "urn:mbe:problem:token-read-only";
const URL = `${AVAILABILITY_CONFIG_PREFIX}/venue-1/closures`;

const tokens = {
  mint: vi.fn(),
  list: vi.fn(async () => []),
  revoke: vi.fn(),
  authenticate: vi.fn(),
};
const commandSvc = {
  mayClose: vi.fn(async () => true),
  create: vi.fn(),
  createMany: vi.fn(),
  reopen: vi.fn(),
  isTablePause: vi.fn(),
};
const impactSvc = { impact: vi.fn() };

const tablePause = {
  id: "dr-pause",
  kind: "closure",
  targetKind: "tables",
  tableIds: ["t-patio-1", "t-patio-2"],
  startsOn: "2026-12-01",
  endsOn: "2026-12-03",
  window: null,
};
const pauseBody = { expectedVersion: 4, rule: tablePause, decisions: [] };
const SAVED = {
  kind: "saved",
  result: {
    ruleId: "dr-pause",
    version: 5,
    changeId: "chg-1",
    outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
  },
  postCommit: null,
};
const REOPENED = {
  kind: "reopened",
  result: { version: 6, changeId: "chg-2", notified: 0, stillClosed: null },
  notice: null,
};

describe("write-scoped token on the closure routes (#9778)", () => {
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
      t === "mbe_pat_writer" ? { id: "tok-2", userSub: "auth0|me", write: true } : null
    );
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: { sub: "auth0|me", iss: "https://test.auth0.com/", aud: "https://api.example.com" },
      protectedHeader: { alg: "RS256" },
    } as never);
    commandSvc.mayClose.mockResolvedValue(true);
    commandSvc.create.mockResolvedValue(SAVED);
    commandSvc.reopen.mockResolvedValue(REOPENED);
    app = await buildApp({
      logger: false,
      services: {
        accessTokenService: tokens as never,
        closureCommandService: commandSvc as never,
        closureImpactService: impactSvc as never,
      },
      venueMembershipLookup: vi.fn(async () => true),
      venueRoleLookup: vi.fn(async () => "manager" as const),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  const post = (payload: object, headers: Record<string, string> = WRITER) =>
    app.inject({ method: "POST", url: URL, headers, payload });
  const reopen = (payload: object, headers: Record<string, string> = WRITER) =>
    app.inject({ method: "DELETE", url: `${URL}/dr-pause`, headers, payload });

  describe("POST …/closures", () => {
    it("lets a token pause tables", async () => {
      const res = await post(pauseBody);
      expect(res.statusCode).toBe(200);
      expect(commandSvc.create).toHaveBeenCalledOnce();
    });

    it.each([
      ["a whole-venue closure", { ...tablePause, targetKind: "venue", tableIds: undefined }],
      ["a service-wide closure", { ...tablePause, targetKind: "service", venueServiceId: "svc-1" }],
      ["a section closure", { ...tablePause, sectionId: "sec-patio" }],
      ["no tables", { ...tablePause, tableIds: [] }],
      [
        "special hours",
        { ...tablePause, kind: "special_hours", payload: { version: 1, services: [] } },
      ],
      ["a repeating rule", { ...tablePause, repeat: { version: 1, weekdays: [5, 6] } }],
      ["a time window", { ...tablePause, window: { version: 1, from: 1020, to: 1320 } }],
      ["a guest message", { ...tablePause, guestMessage: "Patio closed" }],
      ["one channel only", { ...tablePause, bookingTypes: ["online"] }],
    ])("refuses %s", async (_label, rule) => {
      const res = await post({ ...pauseBody, rule });
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
      expect(commandSvc.create).not.toHaveBeenCalled();
    });

    it("refuses decisions on affected bookings", async () => {
      const res = await post({
        ...pauseBody,
        decisions: [{ groupKey: "2026-12-01:closed", action: "cancel" }],
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
      expect(commandSvc.create).not.toHaveBeenCalled();
    });

    it("refuses an edit that replaces another rule", async () => {
      const res = await post({ ...pauseBody, alongside: { remove: ["dr-venue"], add: [] } });
      expect(res.statusCode).toBe(403);
      expect(commandSvc.create).not.toHaveBeenCalled();
    });

    it("leaves a session caller's closure unrestricted", async () => {
      const res = await post(
        {
          ...pauseBody,
          rule: { ...tablePause, targetKind: "venue", tableIds: undefined },
          decisions: [{ groupKey: "2026-12-01:closed", action: "cancel" }],
        },
        SESSION
      );
      expect(res.body).not.toContain(READ_ONLY_TYPE);
      expect(commandSvc.create).toHaveBeenCalledOnce();
    });
  });

  describe("DELETE …/closures/:ruleId", () => {
    const seen = { rule: tablePause, children: [] };

    it("lets a token resume a stored table pause", async () => {
      commandSvc.isTablePause.mockResolvedValue(true);
      const res = await reopen({ tellCancelledGuests: false, seen });
      expect(res.statusCode).toBe(200);
      expect(commandSvc.isTablePause).toHaveBeenCalledWith("venue-1", "dr-pause");
      expect(commandSvc.reopen).toHaveBeenCalledOnce();
    });

    it("refuses to reopen a stored rule that is not a table pause", async () => {
      commandSvc.isTablePause.mockResolvedValue(false);
      const res = await reopen({ tellCancelledGuests: false, seen });
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
      expect(commandSvc.reopen).not.toHaveBeenCalled();
    });

    it("refuses when the stored rule cannot be checked", async () => {
      commandSvc.isTablePause.mockRejectedValue(new Error("db down"));
      const res = await reopen({ tellCancelledGuests: false, seen });
      expect(res.statusCode).toBeGreaterThanOrEqual(403);
      expect(commandSvc.reopen).not.toHaveBeenCalled();
    });

    it.each([
      ["telling cancelled guests", { tellCancelledGuests: true, seen }],
      ["a one-date reopen", { tellCancelledGuests: false, seen, date: "2026-12-02" }],
    ])("refuses %s", async (_label, payload) => {
      commandSvc.isTablePause.mockResolvedValue(true);
      const res = await reopen(payload);
      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe(READ_ONLY_TYPE);
      expect(commandSvc.reopen).not.toHaveBeenCalled();
    });

    it("leaves a session caller's reopen unrestricted", async () => {
      const res = await reopen({ tellCancelledGuests: true }, SESSION);
      expect(res.statusCode).toBe(200);
      expect(commandSvc.isTablePause).not.toHaveBeenCalled();
      expect(commandSvc.reopen).toHaveBeenCalledOnce();
    });
  });

  it("previews closure impact for a token without saving anything", async () => {
    impactSvc.impact.mockResolvedValue({
      kind: "ok",
      impact: { reservations: 0, covers: 0, groups: [] },
    });
    await app.inject({
      method: "POST",
      url: `${URL}/impact`,
      headers: WRITER,
      payload: { rule: tablePause },
    });
    expect(impactSvc.impact).toHaveBeenCalledOnce();
    expect(commandSvc.create).not.toHaveBeenCalled();
    expect(commandSvc.createMany).not.toHaveBeenCalled();
    expect(commandSvc.reopen).not.toHaveBeenCalled();
  });
});
