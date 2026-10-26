import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  AVAILABILITY_CONFIG_PREFIX,
  AvailabilityConfigProblemSchema,
  ClosureResultSchema,
  ReopenResultSchema,
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

const URL = `${AVAILABILITY_CONFIG_PREFIX}/venue-1/closures`;
const ADMIN = { "x-auth-bypass": "true" };
const commandSvc = { mayClose: vi.fn(), create: vi.fn(), reopen: vi.fn() };
const noticeSvc = { enqueueForClosure: vi.fn(), enqueueForReopen: vi.fn(), callList: vi.fn() };

const rule = {
  id: "dr-new",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-12-24",
  endsOn: "2026-12-24",
};
const BODY = {
  expectedVersion: 4,
  rule,
  decisions: [{ groupKey: "2026-12-24:closed", action: "cancel" }],
};
const RESULT = {
  ruleId: "dr-new",
  version: 5,
  changeId: "chg-1",
  outcomes: { cancel: 2, move: 0, keep_notify: 0, keep_silent: 0 },
};

describe("closure routes", () => {
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
      services: {
        closureCommandService: commandSvc as never,
        closureNoticeService: noticeSvc as never,
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  describe("POST /closures", () => {
    const post = (
      payload: unknown = BODY,
      headers: Record<string, string> = { ...ADMIN, "idempotency-key": "k-1" }
    ) => app.inject({ method: "POST", url: URL, headers, payload: payload as object });

    it("saves with the Idempotency-Key and returns the result", async () => {
      commandSvc.create.mockResolvedValueOnce({ kind: "saved", result: RESULT });

      const res = await post();

      expect(res.statusCode).toBe(200);
      expect(ClosureResultSchema.parse(res.json().data)).toEqual(RESULT);
      expect(commandSvc.create).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: "venue-1",
          idempotencyKey: "k-1",
          caller: expect.objectContaining({ isManager: true }),
          body: BODY,
        })
      );
    });

    it("enqueues the notices for the saved closure, replays included", async () => {
      commandSvc.create.mockResolvedValueOnce({ kind: "saved", result: RESULT });
      await post();
      expect(noticeSvc.enqueueForClosure).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", ruleId: "dr-new" })
      );
    });

    it("enqueues nothing for a refused closure", async () => {
      commandSvc.create.mockResolvedValueOnce({ kind: "forbidden" });
      await post();
      expect(noticeSvc.enqueueForClosure).not.toHaveBeenCalled();
    });

    it("still answers 200 when the queue is down (the closure is committed)", async () => {
      commandSvc.create.mockResolvedValueOnce({ kind: "saved", result: RESULT });
      noticeSvc.enqueueForClosure.mockRejectedValueOnce(new Error("redis down"));
      expect((await post()).statusCode).toBe(200);
    });

    it("400s without an Idempotency-Key", async () => {
      const res = await post(BODY, ADMIN);
      expect(res.statusCode).toBe(400);
      expect(commandSvc.create).not.toHaveBeenCalled();
    });

    it("rejects a malformed body", async () => {
      expect((await post({ rule })).statusCode).toBe(400);
      expect(commandSvc.create).not.toHaveBeenCalled();
    });

    it.each([
      [{ kind: "forbidden" }, 403, undefined],
      [{ kind: "not_found" }, 404, undefined],
      [{ kind: "too_long" }, 400, undefined],
      [{ kind: "version_conflict", winningChange: null }, 409, "version-conflict"],
      [{ kind: "key_reused" }, 409, "idempotency-key-reused"],
      [{ kind: "closure_exists" }, 409, "closure-exists"],
      [{ kind: "decision_required", groupKeys: ["g"] }, 422, "decision-required"],
      [{ kind: "invalid_decision", groupKeys: ["g"] }, 422, "invalid-decision"],
      [{ kind: "move_unavailable", reservationIds: ["r"] }, 422, "move-unavailable"],
      [{ kind: "invalid", issues: [] }, 422, "invalid-config"],
    ])("maps %j to %i", async (outcome, status, code) => {
      commandSvc.create.mockResolvedValueOnce(outcome);

      const res = await post();

      expect(res.statusCode).toBe(status);
      if (code) expect(AvailabilityConfigProblemSchema.parse(res.json()).code).toBe(code);
    });
  });

  describe("DELETE /closures/:ruleId", () => {
    const del = (payload: unknown = { tellCancelledGuests: true }) =>
      app.inject({
        method: "DELETE",
        url: `${URL}/dr-new`,
        headers: ADMIN,
        payload: payload as object,
      });

    it("reopens and returns the new version", async () => {
      commandSvc.reopen.mockResolvedValueOnce({
        kind: "reopened",
        result: { version: 6, changeId: "chg-2" },
      });

      const res = await del();

      expect(res.statusCode).toBe(200);
      expect(ReopenResultSchema.parse(res.json().data)).toEqual({ version: 6, changeId: "chg-2" });
      expect(commandSvc.reopen).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", ruleId: "dr-new", tellCancelledGuests: true })
      );
    });

    it("enqueues reopen notices only when the Manager chose to tell cancelled guests", async () => {
      const reopened = { kind: "reopened", result: { version: 6, changeId: "chg-2" } };
      commandSvc.reopen.mockResolvedValueOnce(reopened);
      await del({ tellCancelledGuests: true });
      expect(noticeSvc.enqueueForReopen).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", ruleId: "dr-new" })
      );
      noticeSvc.enqueueForReopen.mockClear();
      commandSvc.reopen.mockResolvedValueOnce(reopened);
      await del({ tellCancelledGuests: false });
      expect(noticeSvc.enqueueForReopen).not.toHaveBeenCalled();
    });

    it("404s an unknown closure and 403s a Host outside the limits", async () => {
      commandSvc.reopen.mockResolvedValueOnce({ kind: "not_found" });
      expect((await del()).statusCode).toBe(404);
      commandSvc.reopen.mockResolvedValueOnce({ kind: "forbidden" });
      expect((await del()).statusCode).toBe(403);
    });

    it("rejects a body without tellCancelledGuests", async () => {
      expect((await del({})).statusCode).toBe(400);
    });
  });
});
