import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  AVAILABILITY_CONFIG_PREFIX,
  AvailabilityConfigProblemSchema,
  ReopenResultSchema,
  TonightResultSchema,
} from "@mbe/types";
import { buildApp } from "../app.js";

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

const URL = `${AVAILABILITY_CONFIG_PREFIX}/venue-1/tonight`;
const ADMIN = { "x-auth-bypass": "true" };
const tonightSvc = { set: vi.fn(), end: vi.fn() };

const BODY = { expectedVersion: 4, ruleId: "t-new", change: { type: "pause_online" } };
const RESULT = {
  ruleId: "t-new",
  version: 5,
  changeId: "chg-1",
  serviceDate: "2026-10-25",
  expiresAt: "2026-10-26T07:00:00.000Z",
  outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
};

describe("tonight routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await buildApp({
      logger: false,
      services: { tonightCommandService: tonightSvc as never },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  describe("POST /tonight", () => {
    const post = (payload: unknown = BODY) =>
      app.inject({ method: "POST", url: URL, headers: ADMIN, payload: payload as object });

    it("applies the change and returns the result", async () => {
      tonightSvc.set.mockResolvedValueOnce({ kind: "saved", result: RESULT });

      const res = await post();

      expect(res.statusCode).toBe(200);
      expect(TonightResultSchema.parse(res.json().data)).toEqual(RESULT);
      expect(tonightSvc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: "venue-1",
          caller: expect.objectContaining({ isManager: true }),
          body: { ...BODY, decisions: [] },
        })
      );
    });

    it.each([
      [{ expectedVersion: 4, ruleId: "t", change: { type: "nope" } }],
      [{ expectedVersion: 4, ruleId: "t", change: { type: "block_tables", tableIds: [] } }],
      [{ expectedVersion: 4, ruleId: "t", change: { type: "pacing", covers: 0 } }],
      [{ ruleId: "t", change: { type: "pause_online" } }],
    ])("rejects a malformed body %j", async (payload) => {
      expect((await post(payload)).statusCode).toBe(400);
      expect(tonightSvc.set).not.toHaveBeenCalled();
    });

    it.each([
      [{ kind: "forbidden" }, 403, undefined],
      [{ kind: "not_found" }, 404, undefined],
      [{ kind: "version_conflict", winningChange: null }, 409, "version-conflict"],
      [{ kind: "rule_exists" }, 409, "closure-exists"],
      [{ kind: "closure_exists" }, 409, "closure-exists"],
      [{ kind: "decision_required", groupKeys: ["g"] }, 422, "decision-required"],
      [{ kind: "invalid", issues: [] }, 422, "invalid-config"],
    ])("maps %j to %i", async (outcome, status, code) => {
      tonightSvc.set.mockResolvedValueOnce(outcome);

      const res = await post();

      expect(res.statusCode).toBe(status);
      if (code) expect(AvailabilityConfigProblemSchema.parse(res.json()).code).toBe(code);
    });
  });

  describe("DELETE /tonight/:ruleId", () => {
    const del = () => app.inject({ method: "DELETE", url: `${URL}/t-new`, headers: ADMIN });

    it("ends the change and returns the new version", async () => {
      tonightSvc.end.mockResolvedValueOnce({
        kind: "ended",
        result: { version: 6, changeId: "chg-2" },
      });

      const res = await del();

      expect(res.statusCode).toBe(200);
      expect(ReopenResultSchema.parse(res.json().data)).toEqual({ version: 6, changeId: "chg-2" });
      expect(tonightSvc.end).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", ruleId: "t-new" })
      );
    });

    it("404s an unknown change", async () => {
      tonightSvc.end.mockResolvedValueOnce({ kind: "not_found" });
      expect((await del()).statusCode).toBe(404);
    });
  });
});
