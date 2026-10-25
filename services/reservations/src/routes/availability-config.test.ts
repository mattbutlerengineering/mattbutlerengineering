import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { VenueRoleLookup } from "@mbe/auth/fastify";
import {
  AVAILABILITY_CONFIG_PREFIX,
  AvailabilityConfigProblemSchema,
  AvailabilityConfigSaveResultSchema,
  AvailabilityConfigStateSchema,
  AvailabilityDaySummarySchema,
  ClosureImpactSchema,
  PreviewResultSchema,
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

import { jwtVerify } from "jose";

const BASE = `${AVAILABILITY_CONFIG_PREFIX}/venue-1/availability`;
const ADMIN = { "x-auth-bypass": "true" };

const CONFIG = {
  schedules: [{ id: "sch-1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

const PUT_BODY = {
  expectedVersion: 2,
  changes: { upsert: {}, remove: {} },
  scopeConflicts: "keep",
};

const svc = { get: vi.fn(), listDays: vi.fn(), save: vi.fn(), preview: vi.fn() };
const impactSvc = { impact: vi.fn() };

async function appWith(options: { venueRoleLookup?: VenueRoleLookup } = {}) {
  const app = await buildApp({
    logger: false,
    services: { availabilityConfigService: svc as never, closureImpactService: impactSvc as never },
    ...options,
  });
  await app.ready();
  return app;
}

describe("availability config routes", () => {
  let app: FastifyInstance;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    app = await appWith();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  describe("GET /config", () => {
    it("returns the config, its version and source", async () => {
      svc.get.mockResolvedValueOnce({ config: CONFIG, version: 0, source: "legacy" });

      const res = await app.inject({ method: "GET", url: `${BASE}/config`, headers: ADMIN });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(AvailabilityConfigStateSchema.parse(data)).toEqual({
        config: CONFIG,
        version: 0,
        source: "legacy",
      });
      expect(svc.get).toHaveBeenCalledWith("venue-1", expect.any(Date));
    });

    it("404s for an unknown venue", async () => {
      svc.get.mockResolvedValueOnce(null);
      const res = await app.inject({ method: "GET", url: `${BASE}/config`, headers: ADMIN });
      expect(res.statusCode).toBe(404);
    });

    it("401s without auth", async () => {
      const res = await app.inject({ method: "GET", url: `${BASE}/config` });
      expect(res.statusCode).toBe(401);
      expect(svc.get).not.toHaveBeenCalled();
    });
  });

  describe("PUT /config", () => {
    const put = (target: FastifyInstance, payload: unknown = PUT_BODY, headers = ADMIN) =>
      target.inject({ method: "PUT", url: `${BASE}/config`, headers, payload: payload as object });

    it("saves and returns the new version and change id", async () => {
      svc.save.mockResolvedValueOnce({ kind: "saved", version: 3, changeId: "chg-1" });

      const res = await put(app);

      expect(res.statusCode).toBe(200);
      expect(AvailabilityConfigSaveResultSchema.parse(res.json().data)).toEqual({
        version: 3,
        changeId: "chg-1",
      });
      expect(svc.save).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", body: PUT_BODY, actorId: expect.any(String) })
      );
    });

    it("answers a stale version with 409 version-conflict naming the winning change", async () => {
      const winningChange = {
        id: "chg-9",
        actorId: "auth0|ana",
        at: "2026-10-25T18:42:00.000Z",
        kind: "config",
        summary: "Availability updated: 1 added, 0 changed, 0 removed",
      };
      svc.save.mockResolvedValueOnce({ kind: "version_conflict", winningChange });

      const res = await put(app);

      expect(res.statusCode).toBe(409);
      const problem = AvailabilityConfigProblemSchema.parse(res.json());
      expect(problem.code).toBe("version-conflict");
      expect(problem.winningChange).toEqual(winningChange);
    });

    it("answers an invalid config with 422 and the issue paths", async () => {
      const issues = [
        {
          path: "scheduleServices[0].lastSeatingAt",
          code: "last_seating_after_close",
          message: "Last seating can't be after closing.",
        },
      ];
      svc.save.mockResolvedValueOnce({ kind: "invalid", issues });

      const res = await put(app);

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: "invalid-config", issues });
    });

    it("answers a change that strands bookings with 409 stranded-bookings", async () => {
      const reservations = [
        { id: "res-1", startTime: "2026-11-07T03:00:00.000Z", partySize: 4, reason: "closed" },
      ];
      svc.save.mockResolvedValueOnce({ kind: "stranded", reservations });

      const res = await put(app);

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: "stranded-bookings", reservations });
    });

    it("rejects a malformed body before the store", async () => {
      const res = await put(app, { changes: {} });
      expect(res.statusCode).toBe(400);
      expect(svc.save).not.toHaveBeenCalled();
    });

    it("refuses a staff (Host) member with 403", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: "auth0|host",
          iss: "https://test.auth0.com/",
          aud: "https://api.example.com",
          permissions: [],
        },
        protectedHeader: { alg: "RS256" },
      } as never);
      const scoped = await appWith({ venueRoleLookup: vi.fn(async () => "staff" as const) });

      const res = await put(scoped, PUT_BODY, { authorization: "Bearer host" } as never);

      expect(res.statusCode).toBe(403);
      expect(svc.save).not.toHaveBeenCalled();
      await scoped.close();
    });
  });

  describe("GET /days", () => {
    const day = {
      serviceDate: "2026-11-06",
      label: "Regular",
      scheduleId: "sch-1",
      serviceCount: 1,
      closures: [],
      bookingOpen: { online: true, phone: true, waitlist: true },
    };

    it("returns one summary per date", async () => {
      svc.listDays.mockResolvedValueOnce([day]);

      const res = await app.inject({
        method: "GET",
        url: `${BASE}/days?from=2026-11-06&to=2026-11-06`,
        headers: ADMIN,
      });

      expect(res.statusCode).toBe(200);
      expect(AvailabilityDaySummarySchema.parse(res.json().data[0])).toEqual(day);
      expect(svc.listDays).toHaveBeenCalledWith(
        "venue-1",
        "2026-11-06",
        "2026-11-06",
        expect.any(Date)
      );
    });

    it.each([
      ["to before from", "from=2026-11-06&to=2026-11-05"],
      ["more than 62 days", "from=2026-01-01&to=2026-03-15"],
      ["not a date", "from=2026-13-01&to=2026-11-05"],
    ])("400s for %s", async (_label, query) => {
      const res = await app.inject({ method: "GET", url: `${BASE}/days?${query}`, headers: ADMIN });
      expect(res.statusCode).toBe(400);
      expect(svc.listDays).not.toHaveBeenCalled();
    });
  });

  describe("POST /closures/impact", () => {
    const rule = {
      id: "dr-new",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    };
    const post = (target: FastifyInstance, payload: unknown = { rule }, headers = ADMIN) =>
      target.inject({
        method: "POST",
        url: `${AVAILABILITY_CONFIG_PREFIX}/venue-1/closures/impact`,
        headers,
        payload: payload as object,
      });

    it("returns the affected bookings", async () => {
      const impact = { reservations: 0, covers: 0, depositsHeld: 0, groups: [] };
      impactSvc.impact.mockResolvedValueOnce({ kind: "ok", impact });

      const res = await post(app);

      expect(res.statusCode).toBe(200);
      expect(ClosureImpactSchema.parse(res.json().data)).toEqual(impact);
      expect(impactSvc.impact).toHaveBeenCalledWith(
        "venue-1",
        expect.objectContaining(rule),
        expect.any(Date)
      );
    });

    it("answers a draft that does not validate with 422 invalid-config", async () => {
      const issues = [{ path: "dateRules[0]", code: "unknown_reference", message: "Unknown." }];
      impactSvc.impact.mockResolvedValueOnce({ kind: "invalid", issues });

      const res = await post(app);

      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: "invalid-config", issues });
    });

    it("400s a range that is too long, 404s an unknown venue", async () => {
      impactSvc.impact.mockResolvedValueOnce({ kind: "too_long" });
      expect((await post(app)).statusCode).toBe(400);
      impactSvc.impact.mockResolvedValueOnce({ kind: "not_found" });
      expect((await post(app)).statusCode).toBe(404);
    });

    it("rejects a malformed body before the store", async () => {
      expect((await post(app, {})).statusCode).toBe(400);
      expect(impactSvc.impact).not.toHaveBeenCalled();
    });

    it("refuses a staff (Host) member with 403", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: "auth0|host",
          iss: "https://test.auth0.com/",
          aud: "https://api.example.com",
          permissions: [],
        },
        protectedHeader: { alg: "RS256" },
      } as never);
      const scoped = await appWith({ venueRoleLookup: vi.fn(async () => "staff" as const) });

      const res = await post(scoped, { rule }, { authorization: "Bearer host" } as never);

      expect(res.statusCode).toBe(403);
      expect(impactSvc.impact).not.toHaveBeenCalled();
      await scoped.close();
    });
  });

  describe("POST /preview", () => {
    const PREVIEW = {
      draft: { changes: { upsert: {}, remove: {} } },
      scope: { from: "2026-11-01" },
      focusDate: "2026-11-02",
    };
    const result = {
      version: 3,
      days: [{ serviceDate: "2026-11-02", added: [1050], removed: [] }],
      focusDay: {
        serviceDate: "2026-11-02",
        label: "Regular",
        scheduleId: "sch-1",
        serviceCount: 0,
        closures: [],
        bookingOpen: { online: true, phone: true, waitlist: true },
        services: [],
      },
      stranded: { total: 0, offset: 0, items: [] },
    };
    const post = (a: FastifyInstance, payload: unknown = PREVIEW) =>
      a.inject({
        method: "POST",
        url: `${BASE}/preview`,
        headers: ADMIN,
        payload: payload as never,
      });

    it("returns the preview, defaulting the scope conflict mode and page offset", async () => {
      svc.preview.mockResolvedValueOnce({ kind: "ok", result });

      const res = await post(app);

      expect(res.statusCode).toBe(200);
      expect(PreviewResultSchema.parse(res.json().data)).toEqual(result);
      expect(svc.preview).toHaveBeenCalledWith({
        venueId: "venue-1",
        body: expect.objectContaining({ strandedOffset: 0 }),
        now: expect.any(Date),
      });
      expect(svc.preview.mock.calls[0]?.[0].body.draft.scopeConflicts).toBe("keep");
    });

    it("answers a timeout with 503 preview-timeout", async () => {
      svc.preview.mockResolvedValueOnce({ kind: "timeout" });
      const res = await post(app);
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ code: "preview-timeout" });
    });

    it("answers an invalid draft with 422 and the issue paths", async () => {
      const issues = [{ path: "schedules[0]", code: "x", message: "m" }];
      svc.preview.mockResolvedValueOnce({ kind: "invalid", issues });
      const res = await post(app);
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: "invalid-config", issues });
    });

    it("answers an unknown venue with 404", async () => {
      svc.preview.mockResolvedValueOnce({ kind: "not_found" });
      expect((await post(app)).statusCode).toBe(404);
    });

    it("rejects a malformed body before the store", async () => {
      const res = await post(app, { ...PREVIEW, scope: [] });
      expect(res.statusCode).toBe(400);
      expect(svc.preview).not.toHaveBeenCalled();
    });
  });
});
