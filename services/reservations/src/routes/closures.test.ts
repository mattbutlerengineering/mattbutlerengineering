import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  AVAILABILITY_CONFIG_PREFIX,
  AvailabilityConfigProblemSchema,
  ClosureNoticePreviewSchema,
  ClosureResultSchema,
  ClosuresResultSchema,
  ClosureSummariesSchema,
  ReopenResultSchema,
  type CreateClosureBody,
  type DateRule,
} from "@mbe/types";
import { buildApp } from "../app.js";
import { checkAlongside, seriesChangedSinceRead } from "../services/closure-alongside.js";
import { ClosureRefundEnqueueError } from "../services/closure-refund.js";
import { jwtVerify } from "jose";

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
const commandSvc = { mayClose: vi.fn(), create: vi.fn(), createMany: vi.fn(), reopen: vi.fn() };
const noticeSvc = {
  enqueueForClosure: vi.fn(),
  enqueueForReopen: vi.fn(),
  callList: vi.fn(),
  summaries: vi.fn(),
};
const closureRefunds = { enqueue: vi.fn(), retry: vi.fn() };

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
/** The work the command decided the save owes after commit. */
const PLAN = { venueId: "venue-1", ruleId: "dr-new", carried: [], refunds: true, givenBack: null };
const SAVED = { kind: "saved", result: RESULT, postCommit: PLAN };

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
      closureRefunds,
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
      commandSvc.create.mockResolvedValueOnce(SAVED);

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

    describe("a series edit of rows with no guest message or staff note (#8028)", () => {
      // GET answers these as null; Ajv coerces a null in the body to "", so the stored row and the
      // row the command receives must still compare equal.
      const text = { guestMessage: null, staffNote: null };
      const series = {
        id: "s1",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-12-01",
        endsOn: null,
        repeat: { version: 1, weekdays: [4] },
        ...text,
      };
      const skip = {
        id: "k1",
        kind: "skip",
        targetKind: "venue",
        startsOn: "2026-12-03",
        endsOn: "2026-12-03",
        seriesId: "s1",
        ...text,
      };
      const draft = { ...series, id: "s2", repeat: { version: 1, weekdays: [4, 5] } };
      const stored = [series, skip] as DateRule[];

      /** What the command receives after the route's real validation. */
      const received = async (alongside: unknown) => {
        commandSvc.create.mockResolvedValueOnce(SAVED);
        const res = await post({ expectedVersion: 4, rule: draft, alongside, decisions: [] });
        expect(res.statusCode).toBe(200);
        return commandSvc.create.mock.calls[0]![0].body as CreateClosureBody;
      };
      const moved = { ...skip, seriesId: "s2" };

      it.each([
        ["names the series it replaces", { replaces: series }],
        ["is from an older client that names none", {}],
      ])("accepts a remove-path edit that %s", async (_name, extra) => {
        const body = await received({ upsert: [moved], remove: ["s1"], ...extra });
        expect(seriesChangedSinceRead(stored, body.rule, body.alongside!)).toBe(false);
        expect(checkAlongside(stored, body.rule, body.alongside!)).toBeNull();
      });

      it("accepts a this-and-following edit, which ends the series", async () => {
        const ended = { ...series, endsOn: "2026-12-09" };
        const body = await received({ upsert: [ended, moved], remove: [] });
        expect(checkAlongside(stored, body.rule, body.alongside!)).toBeNull();
      });

      it("accepts moving a skip beside a series that is removed", async () => {
        const body = await received({ upsert: [moved], remove: ["s1"] });
        expect(checkAlongside(stored, body.rule, body.alongside!)).toBeNull();
      });
    });

    it("runs the post-commit work the command decided: refund jobs and notices", async () => {
      commandSvc.create.mockResolvedValueOnce({
        ...SAVED,
        postCommit: { ...PLAN, carried: ["o-old"] },
      });

      await post();

      expect(closureRefunds.enqueue).toHaveBeenCalledWith("venue-1", "dr-new", ["o-old"]);
      expect(noticeSvc.enqueueForClosure).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", ruleId: "dr-new", carried: ["o-old"] })
      );
    });

    it("runs nothing after a save that owes nothing", async () => {
      commandSvc.create.mockResolvedValueOnce({ ...SAVED, postCommit: null });

      expect((await post()).statusCode).toBe(200);

      expect(closureRefunds.enqueue).not.toHaveBeenCalled();
      expect(noticeSvc.enqueueForClosure).not.toHaveBeenCalled();
    });

    it("still answers 200 when the queue is down (the closure is committed)", async () => {
      commandSvc.create.mockResolvedValueOnce(SAVED);
      closureRefunds.enqueue.mockRejectedValueOnce(new Error("redis down"));
      noticeSvc.enqueueForClosure.mockRejectedValueOnce(new Error("redis down"));
      expect((await post()).statusCode).toBe(200);
    });

    it("enqueues nothing for a refusal", async () => {
      const settle = vi.spyOn(app.transitions, "settleClosure");
      commandSvc.create.mockResolvedValueOnce({ kind: "forbidden" });
      await post();
      expect(settle).not.toHaveBeenCalled();
      expect(closureRefunds.enqueue).not.toHaveBeenCalled();
      expect(noticeSvc.enqueueForClosure).not.toHaveBeenCalled();
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

  describe("POST /closures/batch", () => {
    const BATCH_URL = `${URL}/batch`;
    const second = { ...rule, id: "dr-25", startsOn: "2026-12-25", endsOn: "2026-12-25" };
    const BATCH = {
      expectedVersion: 4,
      items: [
        { rule, decisions: [{ groupKey: "2026-12-24:closed", action: "cancel" }] },
        { rule: second, decisions: [] },
      ],
    };
    const BATCH_RESULT = {
      version: 6,
      results: [
        RESULT,
        { ...RESULT, ruleId: "dr-25", version: 6, outcomes: { ...RESULT.outcomes, cancel: 0 } },
      ],
    };
    const BATCH_SAVED = {
      kind: "saved",
      result: BATCH_RESULT,
      postCommit: [PLAN, { ...PLAN, ruleId: "dr-25", refunds: false }],
    };
    const post = (
      payload: unknown = BATCH,
      headers: Record<string, string> = { ...ADMIN, "idempotency-key": "k-1" }
    ) => app.inject({ method: "POST", url: BATCH_URL, headers, payload: payload as object });

    it("saves every item with the Idempotency-Key and returns each result", async () => {
      commandSvc.createMany.mockResolvedValueOnce(BATCH_SAVED);

      const res = await post();

      expect(res.statusCode).toBe(200);
      expect(ClosuresResultSchema.parse(res.json().data)).toEqual(BATCH_RESULT);
      expect(commandSvc.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", idempotencyKey: "k-1", body: BATCH })
      );
    });

    it("runs each item's post-commit work, as the command decided it, after the commit", async () => {
      commandSvc.createMany.mockResolvedValueOnce(BATCH_SAVED);

      await post();

      expect(noticeSvc.enqueueForClosure).toHaveBeenCalledTimes(2);
      expect(noticeSvc.enqueueForClosure).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", ruleId: "dr-25" })
      );
      expect(closureRefunds.enqueue).toHaveBeenCalledTimes(1);
      expect(closureRefunds.enqueue).toHaveBeenCalledWith("venue-1", "dr-new", []);
    });

    it("enqueues nothing for a refusal", async () => {
      commandSvc.createMany.mockResolvedValueOnce({
        kind: "decision_required",
        groupKeys: ["2026-12-25:closed"],
      });

      const res = await post();

      expect(res.statusCode).toBe(422);
      expect(AvailabilityConfigProblemSchema.parse(res.json()).code).toBe("decision-required");
      expect(closureRefunds.enqueue).not.toHaveBeenCalled();
      expect(noticeSvc.enqueueForClosure).not.toHaveBeenCalled();
    });

    it("400s without an Idempotency-Key and for an empty or malformed batch", async () => {
      expect((await post(BATCH, ADMIN)).statusCode).toBe(400);
      expect((await post({ expectedVersion: 4, items: [] })).statusCode).toBe(400);
      expect(commandSvc.createMany).not.toHaveBeenCalled();
    });

    it("answers a Host with 403", async () => {
      commandSvc.createMany.mockResolvedValueOnce({ kind: "forbidden" });
      expect((await post()).statusCode).toBe(403);
    });
  });

  describe("GET /closures", () => {
    it("lists the outcome summary of every closure", async () => {
      const summary = {
        ruleId: "dr-new",
        total: 14,
        cancelled: 14,
        sent: 11,
        rebooked: 1,
        unreachable: 2,
        refundFailed: 1,
        refundFailures: [
          { outcomeId: "o-1", guestName: "Rivera", amountCents: 4000, currency: "usd" },
        ],
        refundPending: 0,
      };
      noticeSvc.summaries.mockResolvedValueOnce([summary]);

      const res = await app.inject({ method: "GET", url: URL, headers: ADMIN });

      expect(res.statusCode).toBe(200);
      expect(ClosureSummariesSchema.parse(res.json().data)).toEqual([summary]);
      expect(noticeSvc.summaries).toHaveBeenCalledWith("venue-1");
    });
  });

  describe("GET /closures/:ruleId/call-list", () => {
    it("returns only the guests the service puts on the call list", async () => {
      noticeSvc.callList.mockResolvedValueOnce([
        {
          outcomeId: "o-1",
          reservationId: "r-1",
          guestName: "Rivera",
          partySize: 4,
          startTime: new Date("2026-12-24T22:30:00Z"),
          guestPhone: "+15555550100",
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `${URL}/dr-new/call-list`,
        headers: ADMIN,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([
        {
          outcomeId: "o-1",
          reservationId: "r-1",
          guestName: "Rivera",
          partySize: 4,
          startTime: "2026-12-24T22:30:00.000Z",
          guestPhone: "+15555550100",
        },
      ]);
      expect(noticeSvc.callList).toHaveBeenCalledWith("venue-1", "dr-new");
    });
  });

  describe("POST /closures/:ruleId/refunds/retry", () => {
    const retry = () =>
      app.inject({ method: "POST", url: `${URL}/dr-new/refunds/retry`, headers: ADMIN });

    it("re-enqueues through closureRefunds.retry, which only takes pending and failed rows", async () => {
      closureRefunds.retry.mockResolvedValueOnce(2);

      const res = await retry();

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ enqueued: 2 });
      expect(closureRefunds.retry).toHaveBeenCalledWith("venue-1", "dr-new");
    });

    it("answers 503 saying how many were queued before the queue failed", async () => {
      closureRefunds.retry.mockRejectedValueOnce(new ClosureRefundEnqueueError(2, new Error("x")));

      const res = await retry();

      expect(res.statusCode).toBe(503);
      expect(res.json().detail).toContain("2 queued");
    });

    it("answers 503 when the queue fails before anything was queued", async () => {
      closureRefunds.retry.mockRejectedValueOnce(new Error("redis down"));
      expect((await retry()).statusCode).toBe(503);
    });

    it("403s a Host without calling closureRefunds.retry", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: "auth0|host",
          iss: "https://test.auth0.com/",
          aud: "https://api.example.com",
          permissions: [],
        },
        protectedHeader: { alg: "RS256" },
      } as never);
      const scoped = await buildApp({
        logger: false,
        services: { closureCommandService: commandSvc as never },
        closureRefunds,
        venueMembershipLookup: vi.fn(async () => true),
        venueRoleLookup: vi.fn(async () => "staff" as const),
      });
      await scoped.ready();

      const res = await scoped.inject({
        method: "POST",
        url: `${URL}/dr-new/refunds/retry`,
        headers: { authorization: "Bearer host" },
      });

      expect(res.body).toContain("Manager");
      expect(res.statusCode).toBe(403);
      expect(closureRefunds.retry).not.toHaveBeenCalled();
      await scoped.close();
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

    describe("one date of a range (#7984)", () => {
      it("hands the date to the store through Ajv, and refuses one that is not a date", async () => {
        commandSvc.reopen.mockResolvedValue({
          kind: "reopened",
          result: { version: 6, changeId: "chg-2" },
        });
        const seen = { rule, children: [] };

        await del({ tellCancelledGuests: false, seen, date: "2026-12-26" });
        expect(commandSvc.reopen).toHaveBeenLastCalledWith(
          expect.objectContaining({ date: "2026-12-26", seen })
        );

        commandSvc.reopen.mockClear();
        const bad = await del({ tellCancelledGuests: false, seen, date: "Dec 26" });
        expect(bad.statusCode).toBe(400);
        expect(commandSvc.reopen).not.toHaveBeenCalled();
        commandSvc.reopen.mockReset();
      });

      it("hands an impossible date through Ajv to the store, which refuses it", async () => {
        commandSvc.reopen.mockResolvedValueOnce({
          kind: "invalid",
          issues: [{ path: "date", code: "invalid_date", message: "Not on the calendar." }],
        });
        const res = await del({
          tellCancelledGuests: false,
          seen: { rule, children: [] },
          date: "2027-02-31",
        });
        // The date schema is a pattern, so Ajv cannot tell: the store is the one that refuses.
        expect(commandSvc.reopen).toHaveBeenLastCalledWith(
          expect.objectContaining({ date: "2027-02-31" })
        );
        expect(res.statusCode).toBe(422);
      });

      it("answers an invalid split as 422 invalid-config naming the issue", async () => {
        commandSvc.reopen.mockResolvedValueOnce({
          kind: "invalid",
          issues: [{ path: "date", code: "invalid_date", message: "Not one of its dates." }],
        });
        const res = await del({
          tellCancelledGuests: false,
          seen: { rule, children: [] },
          date: "2027-01-02",
        });
        expect(res.statusCode).toBe(422);
        expect(res.json()).toMatchObject({
          code: "invalid-config",
          issues: [{ path: "date", code: "invalid_date" }],
        });
      });
    });

    describe("what the caller saw of the rule (#8121)", () => {
      const seen = { rule, children: [] };

      it("hands the rule and children it saw to the store, and nothing when it sent none", async () => {
        commandSvc.reopen.mockResolvedValue({
          kind: "reopened",
          result: { version: 6, changeId: "chg-2" },
        });

        await del({ tellCancelledGuests: false, seen });
        expect(commandSvc.reopen).toHaveBeenLastCalledWith(expect.objectContaining({ seen }));

        await del({ tellCancelledGuests: false });
        expect(commandSvc.reopen.mock.lastCall?.[0].seen).toBeUndefined();
        commandSvc.reopen.mockReset();
      });

      it("accepts null messages through Ajv, which hands them on as empty strings", async () => {
        commandSvc.reopen.mockResolvedValueOnce({
          kind: "reopened",
          result: { version: 6, changeId: "chg-2" },
        });

        const response = await del({
          tellCancelledGuests: false,
          seen: { rule: { ...rule, guestMessage: null, staffNote: null }, children: [] },
        });

        expect(response.statusCode).toBe(200);
        expect(commandSvc.reopen.mock.lastCall?.[0].seen.rule).toMatchObject({
          guestMessage: "",
          staffNote: "",
        });
      });

      it("refuses a seen that is not a rule row, before the store", async () => {
        commandSvc.reopen.mockClear();

        const response = await del({ tellCancelledGuests: false, seen: { rule: { id: "x" } } });

        expect(response.statusCode).toBe(400);
        expect(commandSvc.reopen).not.toHaveBeenCalled();
      });

      it("409s a changed rule as a version conflict naming the change, and tells no guest", async () => {
        noticeSvc.enqueueForReopen.mockClear();
        const winningChange = {
          id: "chg-9",
          actorId: "auth0|ana",
          at: "2026-11-01T12:00:00.000Z",
          kind: "closure",
          summary: "Closure extended",
        };
        commandSvc.reopen.mockResolvedValueOnce({ kind: "version_conflict", winningChange });

        const response = await del({ tellCancelledGuests: true, seen });

        expect(response.statusCode).toBe(409);
        expect(AvailabilityConfigProblemSchema.parse(response.json())).toMatchObject({
          code: "version-conflict",
          winningChange,
        });
        expect(noticeSvc.enqueueForReopen).not.toHaveBeenCalled();
      });
    });

    it("enqueues the reopen notice the command decided, and none when it decided none", async () => {
      const result = { version: 6, changeId: "chg-2" };
      const notice = { venueId: "venue-1", ruleId: "dr-new", date: "2026-12-26" };
      commandSvc.reopen.mockResolvedValueOnce({ kind: "reopened", result, notice });
      await del({ tellCancelledGuests: true });
      expect(noticeSvc.enqueueForReopen).toHaveBeenCalledWith(expect.objectContaining(notice));

      noticeSvc.enqueueForReopen.mockClear();
      commandSvc.reopen.mockResolvedValueOnce({ kind: "reopened", result, notice: null });
      expect((await del({ tellCancelledGuests: true })).statusCode).toBe(200);
      expect(noticeSvc.enqueueForReopen).not.toHaveBeenCalled();
    });

    it("404s an unknown closure and 403s a Host outside the limits", async () => {
      commandSvc.reopen.mockResolvedValueOnce({ kind: "not_found" });
      expect((await del()).statusCode).toBe(404);
      commandSvc.reopen.mockResolvedValueOnce({ kind: "forbidden" });
      expect((await del()).statusCode).toBe(403);
    });

    it("422s a reopen that would leave bookings without service, and sends no notices (#7975)", async () => {
      commandSvc.reopen.mockResolvedValueOnce({
        kind: "invalid",
        issues: [{ path: "reservations.r1", code: "strands_booking", message: "no service" }],
      });
      noticeSvc.enqueueForReopen.mockClear();

      const res = await del();

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({
        code: "invalid-config",
        issues: [{ path: "reservations.r1", code: "strands_booking" }],
      });
      expect(noticeSvc.enqueueForReopen).not.toHaveBeenCalled();
    });

    it("sends each stranded booking on its issue, and no guest name reaches a log (#8043)", async () => {
      const lines: string[] = [];
      const logged = await buildApp({
        logger: { level: "trace", stream: { write: (line: string) => void lines.push(line) } },
        services: {
          closureCommandService: commandSvc as never,
          closureNoticeService: noticeSvc as never,
        },
        closureRefunds,
      });
      await logged.ready();
      const reservation = {
        id: "r1",
        startTime: "2026-12-25T03:00:00.000Z",
        partySize: 4,
        reason: "closed",
        guestName: "Okafor-Zielinski",
        serviceDate: "2026-12-24",
      };
      commandSvc.reopen.mockResolvedValueOnce({
        kind: "invalid",
        issues: [
          { path: "reservations.r1", code: "strands_booking", message: "no service", reservation },
        ],
      });

      const res = await logged.inject({
        method: "DELETE",
        url: `${URL}/dr-1`,
        headers: ADMIN,
        payload: { tellCancelledGuests: false },
      });
      await logged.close();

      expect(res.statusCode).toBe(422);
      expect(AvailabilityConfigProblemSchema.parse(res.json()).issues?.[0]?.reservation).toEqual(
        reservation
      );
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join("")).not.toContain("Okafor-Zielinski");
    });

    it("rejects a body without tellCancelledGuests", async () => {
      expect((await del({})).statusCode).toBe(400);
    });
  });

  describe("POST /closures/notice-preview", () => {
    const venueSvc = { getById: vi.fn() };
    const PREVIEW = `${URL}/notice-preview`;
    const body = {
      action: "cancel",
      closureDate: "2026-12-24",
      startTime: "2026-12-25T02:30:00.000Z",
      partySize: 4,
      guestName: "Okafor-Zielinski",
      message: "Closed for a private event",
      refund: { amountCents: 4000, currency: "usd" },
    };
    let previewApp: FastifyInstance;
    const lines: string[] = [];

    beforeEach(async () => {
      lines.length = 0;
      venueSvc.getById.mockResolvedValue({
        name: "Rivera Bistro",
        ianaTimezone: "America/Los_Angeles",
      });
      previewApp = await buildApp({
        logger: { level: "trace", stream: { write: (line: string) => void lines.push(line) } },
        services: {
          closureCommandService: commandSvc as never,
          closureNoticeService: noticeSvc as never,
          venueService: venueSvc as never,
        },
        closureRefunds,
      });
      await previewApp.ready();
    });

    afterEach(async () => {
      await previewApp.close();
    });

    const post = (payload: unknown = body) =>
      previewApp.inject({
        method: "POST",
        url: PREVIEW,
        headers: ADMIN,
        payload: payload as object,
      });

    it("answers with the notice the job would send, in the venue's name and zone", async () => {
      const res = await post();

      expect(res.statusCode).toBe(200);
      const data = ClosureNoticePreviewSchema.parse(res.json().data);
      expect(data.sms).toContain("Rivera Bistro is closed Thu Dec 24");
      expect(data.sms).toContain("6:30 PM table for 4 is cancelled");
      expect(data.email.text).toContain("Hi Okafor-Zielinski,");
      expect(data.email.text).toContain("Closed for a private event");
      expect(venueSvc.getById).toHaveBeenCalledWith("venue-1");
    });

    it("takes a booking with no name, no message and no deposit (null survives Ajv)", async () => {
      const res = await post({ ...body, guestName: null, message: null, refund: null });

      expect(res.statusCode).toBe(200);
      const text = res.json().data.email.text as string;
      expect(text).not.toContain("Hi ");
      expect(text).not.toContain("deposit");
    });

    // #8131: the impact's deposit is the estimate of what is still owed and can be 0 (a refund
    // already made in the Stripe dashboard). The preview must say nothing of a refund then, as the
    // notice the job sends does.
    it("says nothing of a refund when the estimate is 0, as the notice does", async () => {
      const res = await post({ ...body, refund: { amountCents: 0, currency: "usd" } });

      expect(res.statusCode).toBe(200);
      const data = ClosureNoticePreviewSchema.parse(res.json().data);
      expect(data.email.text).not.toContain("deposit");
      expect(data.email.text).not.toContain("$0");
      expect(data.sms).not.toContain("deposit");
      expect(data.sms).not.toContain("$0");
      const withRefund = await post();
      expect(withRefund.json().data.sms).toContain("$40 deposit will be refunded");
    });

    it("sends from, and links to, the brand of the host the booking came from (#8013)", async () => {
      const eat = await post({ ...body, originHost: "eat-sheet.com" });
      const home = await post({ ...body, originHost: null });
      const none = await post(body);

      expect(eat.statusCode).toBe(200);
      expect(eat.json().data.email.from).toMatch(/^eat-sheet <.+@.+>$/);
      expect(home.json().data.email.from).toMatch(/^Matt Butler Engineering|^[^<]+@/);
      expect(home.json().data.email.from).not.toContain("eat-sheet");
      expect(none.json().data.email.from).toBe(home.json().data.email.from);
    });

    it("words the preview in the language the booking was made in (#8388)", async () => {
      const fr = (await post({ ...body, locale: "fr-CA" })).json().data;
      const none = (await post(body)).json().data;

      expect(fr.email.subject).toContain("est annulée");
      expect(fr.sms).toContain("[le lien propre au client]");
      expect(none.email.subject).toContain("is cancelled");
      expect((await post({ ...body, locale: "en-GB" })).statusCode).toBe(400);
    });

    it("refuses a host outside the allowlist, and a currency Intl cannot format", async () => {
      expect((await post({ ...body, originHost: "evil.example" })).statusCode).toBe(400);
      expect(
        (await post({ ...body, refund: { amountCents: 4000, currency: "$$$" } })).statusCode
      ).toBe(400);
      expect(
        (await post({ ...body, refund: { amountCents: 4000, currency: "us" } })).statusCode
      ).toBe(400);
    });

    it("drops a long venue message from a kept notice's text as the real, longer link makes it (#7983)", async () => {
      const message = "m".repeat(150);
      const res = await post({ ...body, action: "keep_notify", refund: null, message });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.sms).not.toContain(message);
      expect(res.json().data.sms).toContain("[the guest's own link]");
    });

    it("404s an unknown venue and 400s an unknown action", async () => {
      venueSvc.getById.mockResolvedValueOnce(null);
      expect((await post()).statusCode).toBe(404);
      expect((await post({ ...body, action: "keep_silent" })).statusCode).toBe(400);
    });

    it("keeps the guest's name out of every log line (#8099)", async () => {
      await post();
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join("")).not.toContain("Okafor-Zielinski");
    });
  });
});
