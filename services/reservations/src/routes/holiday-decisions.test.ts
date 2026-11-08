import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { VenueRoleLookup } from "@mbe/auth/fastify";
import {
  AVAILABILITY_CONFIG_PREFIX,
  HolidayDecisionSchema,
  ProblemDetailsSchema,
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

const BASE = `${AVAILABILITY_CONFIG_PREFIX}/venue-1/availability/holiday-decisions`;
const ADMIN = { "x-auth-bypass": "true" };
const HOST = { authorization: "Bearer host" };

const svc = { list: vi.fn(), set: vi.fn(), clear: vi.fn() };

const DECISION = {
  serviceDate: "2026-11-26",
  decision: "open_as_usual",
  createdAt: "2026-11-08T10:00:00.000Z",
};

async function appWith(
  options: {
    venueRoleLookup?: VenueRoleLookup;
    venueMembershipLookup?: () => Promise<boolean>;
  } = {}
) {
  const app = await buildApp({
    logger: false,
    services: { holidayDecisionService: svc as never },
    ...options,
  });
  await app.ready();
  return app;
}

/** A signed-in venue member who is not a Manager (a Host), or a stranger to the venue. */
async function asCaller(member: boolean) {
  vi.mocked(jwtVerify).mockResolvedValueOnce({
    payload: {
      sub: "auth0|host",
      iss: "https://test.auth0.com/",
      aud: "https://api.example.com",
      permissions: [],
    },
    protectedHeader: { alg: "RS256" },
  } as never);
  return appWith({
    venueRoleLookup: vi.fn(async () => (member ? ("staff" as const) : null)),
    venueMembershipLookup: vi.fn(async () => member),
  });
}

describe("holiday decision routes", () => {
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

  const put = (
    target: FastifyInstance,
    date = "2026-11-26",
    headers: Record<string, string> = ADMIN,
    payload: unknown = { decision: "open_as_usual" }
  ) => target.inject({ method: "PUT", url: `${BASE}/${date}`, headers, payload: payload as never });
  const del = (
    target: FastifyInstance,
    date = "2026-11-26",
    headers: Record<string, string> = ADMIN
  ) => target.inject({ method: "DELETE", url: `${BASE}/${date}`, headers });
  const list = (
    target: FastifyInstance,
    query = "from=2026-11-08&to=2027-11-08",
    headers: Record<string, string> = ADMIN
  ) => target.inject({ method: "GET", url: `${BASE}?${query}`, headers });

  describe("GET", () => {
    it("returns the range, passing the venue and dates to the service", async () => {
      svc.list.mockResolvedValueOnce([DECISION]);

      const res = await list(app);

      expect(res.statusCode).toBe(200);
      expect(res.json().data.map((d: unknown) => HolidayDecisionSchema.parse(d))).toEqual([
        DECISION,
      ]);
      expect(svc.list).toHaveBeenCalledWith(
        "venue-1",
        { from: "2026-11-08", to: "2027-11-08" },
        expect.anything()
      );
    });

    it("accepts the longest range and refuses one day more with a problem-details 400", async () => {
      svc.list.mockResolvedValue([]);
      expect((await list(app, "from=2026-01-01&to=2027-02-04")).statusCode).toBe(200);

      const tooLong = await list(app, "from=2026-01-01&to=2027-02-05");
      expect(tooLong.statusCode).toBe(400);
      expect(ProblemDetailsSchema.safeParse(tooLong.json()).success).toBe(true);
      expect(svc.list).toHaveBeenCalledTimes(1);
    });

    it("400s to before from, a bad date and a missing bound", async () => {
      expect((await list(app, "from=2026-11-09&to=2026-11-08")).statusCode).toBe(400);
      expect((await list(app, "from=nope&to=2026-11-08")).statusCode).toBe(400);
      expect((await list(app, "from=2026-11-08")).statusCode).toBe(400);
      expect(svc.list).not.toHaveBeenCalled();
    });

    it("404s for a venue the service does not know", async () => {
      svc.list.mockResolvedValueOnce(null);
      const res = await list(app);
      expect(res.statusCode).toBe(404);
      expect(ProblemDetailsSchema.safeParse(res.json()).success).toBe(true);
    });

    it("lets a Host read", async () => {
      svc.list.mockResolvedValueOnce([DECISION]);
      const host = await asCaller(true);
      const res = await list(host, undefined, HOST);
      expect(res.statusCode).toBe(200);
      await host.close();
    });

    it("401s without auth and 403s a non-member", async () => {
      expect(
        (await app.inject({ method: "GET", url: `${BASE}?from=2026-11-08&to=2026-11-09` }))
          .statusCode
      ).toBe(401);
      const stranger = await asCaller(false);
      expect((await list(stranger, undefined, HOST)).statusCode).toBe(403);
      expect(svc.list).not.toHaveBeenCalled();
      await stranger.close();
    });
  });

  describe("PUT", () => {
    it("sets the decision and returns the row", async () => {
      svc.set.mockResolvedValueOnce(DECISION);

      const res = await put(app);

      expect(res.statusCode).toBe(200);
      expect(HolidayDecisionSchema.parse(res.json().data)).toEqual(DECISION);
      expect(svc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: "venue-1",
          serviceDate: "2026-11-26",
          decision: "open_as_usual",
        })
      );
    });

    it("400s a bad date, an unknown decision and a missing body", async () => {
      expect((await put(app, "26-11-2026")).statusCode).toBe(400);
      expect((await put(app, "2026-02-31")).statusCode).toBe(400);
      expect((await put(app, "2026-11-26", ADMIN, { decision: "closed" })).statusCode).toBe(400);
      expect((await put(app, "2026-11-26", ADMIN, {})).statusCode).toBe(400);
      expect(svc.set).not.toHaveBeenCalled();
    });

    it("404s for a venue the service does not know", async () => {
      svc.set.mockResolvedValueOnce(null);
      expect((await put(app)).statusCode).toBe(404);
    });

    it("403s a Host and a non-member, 401s without auth", async () => {
      const host = await asCaller(true);
      expect((await put(host, "2026-11-26", HOST)).statusCode).toBe(403);
      await host.close();
      const stranger = await asCaller(false);
      expect((await put(stranger, "2026-11-26", HOST)).statusCode).toBe(403);
      await stranger.close();
      expect((await put(app, "2026-11-26", {})).statusCode).toBe(401);
      expect(svc.set).not.toHaveBeenCalled();
    });
  });

  describe("DELETE", () => {
    it("clears the decision with 204 and no body, every time", async () => {
      svc.clear.mockResolvedValue(true);

      const first = await del(app);
      const second = await del(app);

      expect(first.statusCode).toBe(204);
      expect(first.body).toBe("");
      expect(second.statusCode).toBe(204);
      expect(svc.clear).toHaveBeenCalledWith("venue-1", "2026-11-26");
    });

    it("400s a bad date and 404s an unknown venue", async () => {
      expect((await del(app, "nope")).statusCode).toBe(400);
      expect((await del(app, "2026-02-31")).statusCode).toBe(400);
      expect(svc.clear).not.toHaveBeenCalled();
      svc.clear.mockResolvedValueOnce(false);
      expect((await del(app)).statusCode).toBe(404);
    });

    it("403s a Host and a non-member, 401s without auth", async () => {
      const host = await asCaller(true);
      expect((await del(host, "2026-11-26", HOST)).statusCode).toBe(403);
      await host.close();
      const stranger = await asCaller(false);
      expect((await del(stranger, "2026-11-26", HOST)).statusCode).toBe(403);
      await stranger.close();
      expect((await del(app, "2026-11-26", {})).statusCode).toBe(401);
      expect(svc.clear).not.toHaveBeenCalled();
    });
  });
});
