import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { VenueRoleLookup } from "@mbe/auth/fastify";
import {
  AVAILABILITY_CONFIG_PREFIX,
  AvailabilityChangesPageSchema,
  AvailabilityConfigProblemSchema,
  AvailabilityConfigSaveResultSchema,
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

const BASE = `${AVAILABILITY_CONFIG_PREFIX}/venue-1/availability/changes`;
const ADMIN = { "x-auth-bypass": "true" };

const svc = { list: vi.fn(), revert: vi.fn() };

async function appWith(options: { venueRoleLookup?: VenueRoleLookup } = {}) {
  const app = await buildApp({
    logger: false,
    services: { availabilityChangesService: svc as never },
    ...options,
  });
  await app.ready();
  return app;
}

const ENTRY = {
  id: "chg-1",
  actorId: "auth0|ana",
  at: "2026-10-25T18:00:00.000Z",
  kind: "config",
  summary: "Availability updated: 1 added, 0 changed, 0 removed",
  affectedFrom: "2026-10-25",
  affectedTo: null,
  notifiedGuests: false,
  revertedById: null,
  revertible: true,
};

describe("availability history routes", () => {
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

  describe("GET /changes", () => {
    it("returns a page, passing the filters and paging defaults", async () => {
      svc.list.mockResolvedValueOnce({ total: 1, offset: 0, items: [ENTRY] });

      const res = await app.inject({
        method: "GET",
        url: `${BASE}?from=2026-10-01&actorId=auth0%7Cana&kind=config`,
        headers: ADMIN,
      });

      expect(res.statusCode).toBe(200);
      expect(AvailabilityChangesPageSchema.parse(res.json().data).items).toEqual([ENTRY]);
      expect(svc.list).toHaveBeenCalledWith("venue-1", {
        from: "2026-10-01",
        actorId: "auth0|ana",
        kind: "config",
        limit: 25,
        offset: 0,
      });
    });

    it("404s for an unknown venue and 400s a bad date", async () => {
      svc.list.mockResolvedValueOnce(null);
      expect((await app.inject({ method: "GET", url: BASE, headers: ADMIN })).statusCode).toBe(404);
      const bad = await app.inject({ method: "GET", url: `${BASE}?from=nope`, headers: ADMIN });
      expect(bad.statusCode).toBe(400);
    });

    it("401s without auth", async () => {
      expect((await app.inject({ method: "GET", url: BASE })).statusCode).toBe(401);
      expect(svc.list).not.toHaveBeenCalled();
    });
  });

  describe("POST /changes/:changeId/revert", () => {
    const post = (target: FastifyInstance, headers: Record<string, string> = ADMIN) =>
      target.inject({
        method: "POST",
        url: `${BASE}/chg-1/revert`,
        headers,
        payload: { expectedVersion: 4 },
      });

    it("reverts and returns the new version and the revert's change id", async () => {
      svc.revert.mockResolvedValueOnce({ kind: "saved", version: 5, changeId: "chg-2" });

      const res = await post(app);

      expect(res.statusCode).toBe(200);
      expect(AvailabilityConfigSaveResultSchema.parse(res.json().data)).toEqual({
        version: 5,
        changeId: "chg-2",
      });
      expect(svc.revert).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: "venue-1", changeId: "chg-1", expectedVersion: 4 })
      );
    });

    it.each([
      ["guests_notified", "guests-notified"],
      ["already_reverted", "already-reverted"],
      ["superseded", "superseded"],
      ["not_revertable", "not-revertable"],
    ])("answers a %s refusal with 409 %s", async (reason, code) => {
      svc.revert.mockResolvedValueOnce({ kind: "refused", reason });

      const res = await post(app);

      expect(res.statusCode).toBe(409);
      expect(AvailabilityConfigProblemSchema.parse(res.json()).code).toBe(code);
    });

    it("answers a stale version with 409 version-conflict", async () => {
      svc.revert.mockResolvedValueOnce({ kind: "version_conflict", winningChange: null });
      const res = await post(app);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("version-conflict");
    });

    it("answers bookings the revert would strand with 409 stranded-bookings", async () => {
      const reservations = [
        { id: "res-1", startTime: "2026-11-07T06:30:00.000Z", partySize: 2, reason: "closed" },
      ];
      svc.revert.mockResolvedValueOnce({ kind: "stranded", reservations });
      const res = await post(app);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: "stranded-bookings", reservations });
    });

    it("answers an inverse that no longer validates with 422, an unknown change with 404", async () => {
      svc.revert.mockResolvedValueOnce({ kind: "invalid", issues: [] });
      expect((await post(app)).statusCode).toBe(422);
      svc.revert.mockResolvedValueOnce({ kind: "change_not_found" });
      expect((await post(app)).statusCode).toBe(404);
      svc.revert.mockResolvedValueOnce({ kind: "not_found" });
      expect((await post(app)).statusCode).toBe(404);
    });

    it("rejects a malformed body before the store", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE}/chg-1/revert`,
        headers: ADMIN,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(svc.revert).not.toHaveBeenCalled();
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

      const res = await post(scoped, { authorization: "Bearer host" });

      expect(res.statusCode).toBe(403);
      expect(svc.revert).not.toHaveBeenCalled();
      await scoped.close();
    });
  });
});
