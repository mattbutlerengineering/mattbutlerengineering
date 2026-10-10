import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { requireOwnershipOrAdmin, requireVenueAccess, type AuthUser } from "@mbe/auth/fastify";
import { getCurrentVenueId } from "../services/venue-context-store.js";
import { resolveCurrentUserEmail } from "./reservation-owner.js";

vi.mock("../services/resolve-venue.js", () => ({ resolveVenueId: vi.fn() }));

const { resolveVenueId } = await import("../services/resolve-venue.js");
const { venueScoped, venueScopeOf, venueScopeHooks } = await import("./venue-scope.js");

const resolveVenueIdMock = vi.mocked(resolveVenueId);

const VENUE_A = "venue-a";
const VENUE_B = "venue-b";

/** A JWT payload with the registered claims `JWTPayload` requires. */
const claims = (sub: string, permissions: string[]) => ({
  sub,
  permissions,
  iss: "https://test.local/",
  aud: "test",
  exp: 9_999_999_999,
  iat: 0,
});

/** Identities selected per request by the `x-user` header. */
const USERS: Record<string, AuthUser> = {
  member: {
    id: "member-sub",
    email: "member@example.com",
    emailVerified: true,
    raw: claims("member-sub", []),
  },
  admin: {
    id: "admin-sub",
    email: "admin@example.com",
    emailVerified: true,
    raw: claims("admin-sub", ["admin"]),
  },
  guest: {
    id: "guest-sub",
    email: "owner@example.com",
    emailVerified: true,
    raw: claims("guest-sub", []),
  },
  unverified: {
    id: "unverified-sub",
    email: "owner@example.com",
    emailVerified: false,
    raw: claims("unverified-sub", []),
  },
};

/** `member-sub` belongs to VENUE_A only. */
const lookup = vi.fn(
  async (sub: string, venueId: string) => sub === "member-sub" && venueId === VENUE_A
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function buildTestApp(register: (app: FastifyInstance) => void): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("venueMembershipLookup", lookup);
  app.addHook("preHandler", async (request) => {
    const key = request.headers["x-user"];
    if (typeof key === "string" && USERS[key]) request.user = USERS[key];
  });
  register(app);
  await app.ready();
  return app;
}

/** Bodies the reused guards produce, for byte-equality checks. */
async function guardBodies() {
  const app = await buildTestApp((a) => {
    a.get("/venue-guard", { preHandler: requireVenueAccess(lookup, () => null) }, async () => ({}));
    a.get(
      "/owner-guard",
      { preHandler: requireOwnershipOrAdmin(async () => "someone-else", resolveCurrentUserEmail) },
      async () => ({})
    );
  });
  const venue401 = (await app.inject({ url: "/venue-guard" })).body;
  const venue403 = (await app.inject({ url: "/venue-guard", headers: { "x-user": "member" } }))
    .body;
  const owner401 = (await app.inject({ url: "/owner-guard", headers: { "x-user": "unverified" } }))
    .body;
  const owner403 = (await app.inject({ url: "/owner-guard", headers: { "x-user": "guest" } })).body;
  await app.close();
  return { venue401, venue403, owner401, owner403 };
}

let bodies: Awaited<ReturnType<typeof guardBodies>>;

beforeEach(async () => {
  resolveVenueIdMock.mockReset();
  lookup.mockClear();
  bodies ??= await guardBodies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("venueScoped — direct sources (member)", () => {
  async function app() {
    return buildTestApp((a) => {
      a.get<{ Querystring: { venueId?: string } }>(
        "/q",
        venueScoped({ venue: "query" }, async (_request, _reply, scope) => ({
          venueId: scope.venueId,
          isAdmin: scope.isAdmin,
          context: getCurrentVenueId(),
        }))
      );
      a.post<{ Body: { venueId?: string } }>(
        "/b",
        venueScoped({ venue: "body" }, async (_request, _reply, scope) => ({
          venueId: scope.venueId,
        }))
      );
      a.get<{ Params: { venueId: string } }>(
        "/p/:venueId",
        venueScoped({ venue: "params" }, async (_request, _reply, scope) => ({
          venueId: scope.venueId,
        }))
      );
      a.get<{ Params: { id: string } }>(
        "/venues/:id",
        venueScoped(
          { venue: { from: "params", field: "id" } },
          async (_request, _reply, scope) => ({
            venueId: scope.venueId,
          })
        )
      );
    });
  }

  it("admits a member and runs the handler inside the venue's context", async () => {
    const a = await app();
    const res = await a.inject({ url: `/q?venueId=${VENUE_A}`, headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ venueId: VENUE_A, isAdmin: false, context: VENUE_A });
  });

  it("reads venueId from body and params, and a named field", async () => {
    const a = await app();
    const headers = { "x-user": "member" };
    expect(
      (await a.inject({ method: "POST", url: "/b", headers, payload: { venueId: VENUE_A } })).json()
    ).toEqual({ venueId: VENUE_A });
    expect((await a.inject({ url: `/p/${VENUE_A}`, headers })).json()).toEqual({
      venueId: VENUE_A,
    });
    expect((await a.inject({ url: `/venues/${VENUE_A}`, headers })).json()).toEqual({
      venueId: VENUE_A,
    });
  });

  it("denies a non-member with requireVenueAccess's own 403 body", async () => {
    const a = await app();
    const res = await a.inject({ url: `/q?venueId=${VENUE_B}`, headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe(bodies.venue403);
  });

  it("answers 401 with the guard's body when there is no user", async () => {
    const a = await app();
    const res = await a.inject({ url: `/q?venueId=${VENUE_A}` });
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe(bodies.venue401);
  });

  it("missing key: 403 for a non-admin, 400 'venueId is required' for an admin", async () => {
    const a = await app();
    const member = await a.inject({ url: "/q", headers: { "x-user": "member" } });
    expect(member.statusCode).toBe(403);
    expect(member.body).toBe(bodies.venue403);

    const admin = await a.inject({ url: "/q", headers: { "x-user": "admin" } });
    expect(admin.statusCode).toBe(400);
    expect(admin.json()).toMatchObject({
      status: 400,
      title: "Bad Request",
      detail: "venueId is required",
    });
  });

  it("an empty-string key counts as missing", async () => {
    const a = await app();
    const member = await a.inject({ url: "/q?venueId=", headers: { "x-user": "member" } });
    expect(member.statusCode).toBe(403);

    const admin = await a.inject({ url: "/q?venueId=", headers: { "x-user": "admin" } });
    expect(admin.statusCode).toBe(400);
    expect(admin.json()).toMatchObject({ detail: "venueId is required" });
  });

  it("a non-string key counts as missing", async () => {
    const a = await app();
    const res = await a.inject({
      method: "POST",
      url: "/b",
      headers: { "x-user": "member" },
      payload: { venueId: 42 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("names the field in the admin 400 for a named-field source", async () => {
    const a = await buildTestApp((app) => {
      app.post<{ Body: { id?: string } }>(
        "/named",
        venueScoped({ venue: { from: "body", field: "id" } }, async () => ({}))
      );
    });
    const res = await a.inject({
      method: "POST",
      url: "/named",
      headers: { "x-user": "admin" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ detail: "id is required" });
  });

  it("uses a declared `missing` detail for the admin 400, and leaves the non-admin 403 alone", async () => {
    const a = await buildTestApp((app) => {
      app.get<{ Querystring: { venueId?: string } }>(
        "/custom",
        venueScoped(
          {
            venue: {
              from: "query",
              field: "venueId",
              missing: "venueId query parameter is required",
            },
          },
          async () => ({})
        )
      );
    });
    const admin = await a.inject({ url: "/custom", headers: { "x-user": "admin" } });
    expect(admin.statusCode).toBe(400);
    expect(admin.json()).toMatchObject({
      status: 400,
      title: "Bad Request",
      detail: "venueId query parameter is required",
    });

    const member = await a.inject({ url: "/custom", headers: { "x-user": "member" } });
    expect(member.statusCode).toBe(403);
    expect(member.body).toBe(bodies.venue403);
  });

  it("admits an admin to any venue with isAdmin set, without a membership lookup", async () => {
    const a = await app();
    const res = await a.inject({ url: `/q?venueId=${VENUE_B}`, headers: { "x-user": "admin" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ venueId: VENUE_B, isAdmin: true, context: VENUE_B });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("venueScoped — entity source (member)", () => {
  const load = vi.fn(async (id: string) => (id === "gone" ? null : { id, venueId: VENUE_A }));

  async function app() {
    load.mockClear();
    return buildTestApp((a) => {
      a.get<{ Params: { id: string } }>(
        "/tables/:id",
        venueScoped(
          {
            venue: {
              entity: "table",
              key: (request) => request.params.id,
              load: async (id) => {
                const context = getCurrentVenueId();
                const entity = await load(id);
                return entity ? { ...entity, contextDuringLoad: context } : null;
              },
              notFound: "Table not found",
            },
          },
          async (_request, _reply, scope) => {
            await sleep(1);
            await Promise.resolve();
            return { entity: scope.entity, venueId: scope.venueId, context: getCurrentVenueId() };
          }
        )
      );
      a.delete<{ Params: { id: string } }>(
        "/tables/:id",
        venueScoped(
          {
            venue: {
              entity: "table",
              key: (request) => request.params.id,
              notFound: "Table not found",
            },
          },
          async (_request, _reply, scope) => ({
            venueId: scope.venueId,
            entity: scope.entity ?? null,
          })
        )
      );
    });
  }

  it("resolves once, loads inside the context, and keeps it across awaits in the handler", async () => {
    resolveVenueIdMock.mockResolvedValue(VENUE_A);
    const a = await app();
    const res = await a.inject({ url: "/tables/t1", headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      entity: { id: "t1", venueId: VENUE_A, contextDuringLoad: VENUE_A },
      venueId: VENUE_A,
      context: VENUE_A,
    });
    expect(resolveVenueIdMock).toHaveBeenCalledTimes(1);
    expect(resolveVenueIdMock).toHaveBeenCalledWith("table", "t1");
  });

  it("an entity source without load hands the handler no entity", async () => {
    resolveVenueIdMock.mockResolvedValue(VENUE_A);
    const a = await app();
    const res = await a.inject({
      method: "DELETE",
      url: "/tables/t1",
      headers: { "x-user": "member" },
    });
    expect(res.json()).toEqual({ venueId: VENUE_A, entity: null });
  });

  it("denies a non-member without calling load", async () => {
    resolveVenueIdMock.mockResolvedValue(VENUE_B);
    const a = await app();
    const res = await a.inject({ url: "/tables/t1", headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe(bodies.venue403);
    expect(load).not.toHaveBeenCalled();
  });

  it("unresolvable entity: 403 for a non-admin (existence hidden), 404 notFound for an admin", async () => {
    resolveVenueIdMock.mockResolvedValue(null);
    const a = await app();
    const member = await a.inject({ url: "/tables/t1", headers: { "x-user": "member" } });
    expect(member.statusCode).toBe(403);
    expect(member.body).toBe(bodies.venue403);
    expect(load).not.toHaveBeenCalled();

    const admin = await a.inject({ url: "/tables/t1", headers: { "x-user": "admin" } });
    expect(admin.statusCode).toBe(404);
    expect(admin.json()).toMatchObject({
      status: 404,
      title: "Not Found",
      detail: "Table not found",
    });
    expect(resolveVenueIdMock).toHaveBeenCalledTimes(2);
  });

  it("load returning null after a resolve is a 404 notFound", async () => {
    resolveVenueIdMock.mockResolvedValue(VENUE_A);
    const a = await app();
    const res = await a.inject({ url: "/tables/gone", headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ detail: "Table not found" });
  });

  it("a resolver failure propagates as a 500 and never admits", async () => {
    resolveVenueIdMock.mockRejectedValue(new Error("db down"));
    const a = await app();
    const res = await a.inject({ url: "/tables/t1", headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(500);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("venueScoped — resolve source", () => {
  it("calls the resolver once and 404s an admin when it yields null", async () => {
    const resolve = vi.fn(async (request: FastifyRequest<{ Querystring: { guestId?: string } }>) =>
      request.query.guestId === "g1" ? VENUE_A : null
    );
    const a = await buildTestApp((app) => {
      app.get<{ Querystring: { guestId?: string } }>(
        "/reservations",
        venueScoped(
          { venue: { resolve, label: "guest", notFound: "Reservation not found" } },
          async (_request, _reply, scope) => ({
            venueId: scope.venueId,
            context: getCurrentVenueId(),
          })
        )
      );
    });
    const ok = await a.inject({ url: "/reservations?guestId=g1", headers: { "x-user": "member" } });
    expect(ok.json()).toEqual({ venueId: VENUE_A, context: VENUE_A });
    expect(resolve).toHaveBeenCalledTimes(1);

    const admin = await a.inject({
      url: "/reservations?guestId=nope",
      headers: { "x-user": "admin" },
    });
    expect(admin.statusCode).toBe(404);
    expect(admin.json()).toMatchObject({ detail: "Reservation not found" });

    const member = await a.inject({
      url: "/reservations?guestId=nope",
      headers: { "x-user": "member" },
    });
    expect(member.statusCode).toBe(403);
    expect(member.body).toBe(bodies.venue403);
  });
});

describe("venueScoped — authenticated access", () => {
  async function app() {
    return buildTestApp((a) => {
      a.get<{ Querystring: { venueId?: string } }>(
        "/open",
        venueScoped(
          { venue: "query", access: "authenticated" },
          async (_request, _reply, scope) => ({
            venueId: scope.venueId,
            context: getCurrentVenueId(),
          })
        )
      );
      a.get<{ Params: { id: string } }>(
        "/open/:id",
        venueScoped(
          {
            venue: {
              entity: "table",
              key: (request) => request.params.id,
              notFound: "Table not found",
            },
            access: "authenticated",
          },
          async (_request, _reply, scope) => ({ venueId: scope.venueId })
        )
      );
    });
  }

  it("sets context without a membership decision", async () => {
    const a = await app();
    const res = await a.inject({
      url: `/open?venueId=${VENUE_B}`,
      headers: { "x-user": "member" },
    });
    expect(res.json()).toEqual({ venueId: VENUE_B, context: VENUE_B });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("missing key is a 400, unresolvable entity a 404", async () => {
    const a = await app();
    const missing = await a.inject({ url: "/open", headers: { "x-user": "member" } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ detail: "venueId is required" });

    resolveVenueIdMock.mockResolvedValue(null);
    const unknown = await a.inject({ url: "/open/t1", headers: { "x-user": "member" } });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ detail: "Table not found" });
  });
});

describe("venueScoped — owner access", () => {
  const load = vi.fn(async (id: string) =>
    id === "gone" ? null : { id, guestEmail: "owner@example.com" as string | null }
  );

  async function app() {
    load.mockClear();
    return buildTestApp((a) => {
      a.get<{ Params: { id: string } }>(
        "/reservations/:id",
        venueScoped(
          {
            venue: {
              entity: "reservation",
              key: (request) => request.params.id,
              load,
              notFound: "Reservation not found",
            },
            access: { owner: (reservation) => reservation.guestEmail },
          },
          async (_request, _reply, scope) => ({
            id: scope.entity.id,
            isAdmin: scope.isAdmin,
            context: getCurrentVenueId(),
          })
        )
      );
    });
  }

  it("admits the verified-email owner inside the reservation's venue context", async () => {
    resolveVenueIdMock.mockResolvedValue(VENUE_B);
    const a = await app();
    const res = await a.inject({ url: "/reservations/r1", headers: { "x-user": "guest" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "r1", isAdmin: false, context: VENUE_B });
    expect(load).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("denies a non-owner and an unverified email with requireOwnershipOrAdmin's own bodies", async () => {
    resolveVenueIdMock.mockResolvedValue(VENUE_B);
    const a = await app();
    const other = await a.inject({ url: "/reservations/r1", headers: { "x-user": "member" } });
    expect(other.statusCode).toBe(403);
    expect(other.body).toBe(bodies.owner403);

    const unverified = await a.inject({
      url: "/reservations/r1",
      headers: { "x-user": "unverified" },
    });
    expect(unverified.statusCode).toBe(401);
    expect(unverified.body).toBe(bodies.owner401);
  });

  it("unresolvable reservation: ownership guard decides for a non-admin, 404 for an admin", async () => {
    resolveVenueIdMock.mockResolvedValue(null);
    const a = await app();
    const guest = await a.inject({ url: "/reservations/r1", headers: { "x-user": "guest" } });
    expect(guest.statusCode).toBe(403);
    expect(guest.body).toBe(bodies.owner403);
    expect(load).not.toHaveBeenCalled();

    const unverified = await a.inject({
      url: "/reservations/r1",
      headers: { "x-user": "unverified" },
    });
    expect(unverified.statusCode).toBe(401);

    const admin = await a.inject({ url: "/reservations/r1", headers: { "x-user": "admin" } });
    expect(admin.statusCode).toBe(404);
    expect(admin.json()).toMatchObject({ detail: "Reservation not found" });
  });

  it("admits an admin with isAdmin set", async () => {
    resolveVenueIdMock.mockResolvedValue(VENUE_B);
    const a = await app();
    const res = await a.inject({ url: "/reservations/r1", headers: { "x-user": "admin" } });
    expect(res.json()).toEqual({ id: "r1", isAdmin: true, context: VENUE_B });
  });

  it("refuses an owner declaration without load at definition time", () => {
    expect(() =>
      venueScoped(
        {
          venue: { entity: "reservation", key: () => "r1", notFound: "Reservation not found" },
          access: { owner: () => null },
        },
        async () => ({})
      )
    ).toThrow(/owner access needs an entity source with load/);
  });
});

describe("venueScoped — context isolation", () => {
  it("two sequential requests to different venues each see their own", async () => {
    const a = await buildTestApp((app) => {
      app.get<{ Querystring: { venueId?: string } }>(
        "/ctx",
        venueScoped({ venue: "query" }, async () => ({ context: getCurrentVenueId() }))
      );
    });
    const first = await a.inject({
      url: `/ctx?venueId=${VENUE_A}`,
      headers: { "x-user": "admin" },
    });
    const second = await a.inject({
      url: `/ctx?venueId=${VENUE_B}`,
      headers: { "x-user": "admin" },
    });
    expect(first.json()).toEqual({ context: VENUE_A });
    expect(second.json()).toEqual({ context: VENUE_B });
  });

  it("interleaved concurrent requests do not bleed", async () => {
    const gates: Record<string, () => void> = {};
    const a = await buildTestApp((app) => {
      app.get<{ Querystring: { venueId?: string } }>(
        "/slow",
        venueScoped({ venue: "query" }, async (_request, _reply, scope) => {
          const before = getCurrentVenueId();
          await new Promise<void>((resolve) => {
            gates[scope.venueId] = resolve;
          });
          return { before, after: getCurrentVenueId() };
        })
      );
    });
    const headers = { "x-user": "admin" };
    const pA = a.inject({ url: `/slow?venueId=${VENUE_A}`, headers });
    const pB = a.inject({ url: `/slow?venueId=${VENUE_B}`, headers });
    while (!gates[VENUE_A] || !gates[VENUE_B]) await sleep(1);
    gates[VENUE_B]!();
    gates[VENUE_A]!();
    const [rA, rB] = await Promise.all([pA, pB]);
    expect(rA.json()).toEqual({ before: VENUE_A, after: VENUE_A });
    expect(rB.json()).toEqual({ before: VENUE_B, after: VENUE_B });
  });

  it("leaves no context behind outside the handler", async () => {
    const a = await buildTestApp((app) => {
      app.get<{ Querystring: { venueId?: string } }>(
        "/ctx",
        venueScoped({ venue: "query" }, async () => ({}))
      );
    });
    await a.inject({ url: `/ctx?venueId=${VENUE_A}`, headers: { "x-user": "admin" } });
    expect(getCurrentVenueId()).toBeNull();
  });
});

describe("venueScoped — identity hook", () => {
  it("calls admitIdentity once, with the resolved venue, before the membership decision", async () => {
    const calls: string[] = [];
    vi.spyOn(venueScopeHooks, "admitIdentity").mockImplementation(
      (user, venueId, method, routeKey) => {
        calls.push(`admit:${user?.id}:${venueId}:${method}:${routeKey}`);
        return null;
      }
    );
    lookup.mockImplementationOnce(async (sub, venueId) => {
      calls.push(`lookup:${venueId}`);
      return sub === "member-sub" && venueId === VENUE_A;
    });
    resolveVenueIdMock.mockResolvedValue(VENUE_A);
    const a = await buildTestApp((app) => {
      app.get<{ Params: { id: string } }>(
        "/tables/:id",
        venueScoped(
          {
            venue: {
              entity: "table",
              key: (request) => request.params.id,
              notFound: "Table not found",
            },
          },
          async () => ({})
        )
      );
    });
    const res = await a.inject({ url: "/tables/t1", headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([`admit:member-sub:${VENUE_A}:GET:GET /tables/:id`, `lookup:${VENUE_A}`]);
  });

  it("a problem from admitIdentity is sent and nothing else runs", async () => {
    vi.spyOn(venueScopeHooks, "admitIdentity").mockReturnValue({
      type: "about:blank",
      title: "Forbidden",
      status: 403,
      detail: "Demo identities may only act on the demo venue",
    });
    const handler = vi.fn(async () => ({}));
    const a = await buildTestApp((app) => {
      app.get<{ Querystring: { venueId?: string } }>(
        "/x",
        venueScoped({ venue: "query" }, handler)
      );
    });
    const res = await a.inject({ url: `/x?venueId=${VENUE_A}`, headers: { "x-user": "member" } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ detail: "Demo identities may only act on the demo venue" });
    expect(lookup).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("admits everyone today", () => {
    expect(venueScopeHooks.admitIdentity(USERS.member, VENUE_A, "GET", "GET /x")).toBeNull();
  });
});

describe("venueScoped — descriptor stamp", () => {
  it("stamps each returned handler with a readable descriptor", () => {
    const noop = async () => ({});
    expect(venueScopeOf(venueScoped({ venue: "query" }, noop))).toBe("query.venueId/member");
    expect(venueScopeOf(venueScoped({ venue: { from: "params", field: "id" } }, noop))).toBe(
      "params.id/member"
    );
    expect(
      venueScopeOf(
        venueScoped(
          { venue: { entity: "guest", key: () => "g", notFound: "x" }, access: "authenticated" },
          noop
        )
      )
    ).toBe("entity:guest/authenticated");
    expect(
      venueScopeOf(
        venueScoped(
          {
            venue: {
              entity: "reservation",
              key: () => "r",
              load: async () => ({ e: null }),
              notFound: "x",
            },
            access: { owner: () => null },
          },
          noop
        )
      )
    ).toBe("entity:reservation/owner");
    expect(
      venueScopeOf(
        venueScoped({ venue: { resolve: async () => null, label: "guest", notFound: "x" } }, noop)
      )
    ).toBe("resolve:guest/member");
  });

  it("reads null from an unwrapped handler", () => {
    expect(venueScopeOf(async () => ({}))).toBeNull();
  });
});
