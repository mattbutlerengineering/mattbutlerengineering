import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { AuthUser, VenueRole } from "@mbe/auth/fastify";
import { getCurrentVenueId } from "../services/venue-context-store.js";

vi.mock("../services/resolve-venue.js", () => ({ resolveVenueId: vi.fn() }));

const { venueScoped, venueScopeOf } = await import("./venue-scope.js");

const VENUE_A = "venue-a";

const user = (sub: string, permissions: string[]): AuthUser => ({
  id: sub,
  raw: { sub, permissions, iss: "https://test.local/", aud: "test", exp: 9_999_999_999, iat: 0 },
});

/** `x-user` selects the caller; the sub doubles as their role in VENUE_A. */
const USERS: Record<string, AuthUser> = {
  owner: user("owner", []),
  manager: user("manager", []),
  staff: user("staff", []),
  outsider: user("outsider", []),
  admin: user("admin", ["admin"]),
};

const roleLookup = vi.fn(async (sub: string, venueId: string): Promise<VenueRole | null> =>
  venueId === VENUE_A && ["owner", "manager", "staff"].includes(sub) ? (sub as VenueRole) : null
);

let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
  const built = Fastify({ logger: false });
  built.decorate("venueRoleLookup", roleLookup);
  built.addHook("preHandler", async (request) => {
    const key = request.headers["x-user"];
    if (typeof key === "string" && USERS[key]) request.user = USERS[key];
  });
  built.patch<{ Params: { id: string } }>(
    "/venues/:id",
    venueScoped(
      { venue: { from: "params", field: "id" }, access: "manager" },
      async (_request, _reply, scope) => ({ venueId: scope.venueId, context: getCurrentVenueId() })
    )
  );
  await built.ready();
  return built;
}

const patchAs = (who: string, venue = VENUE_A) =>
  app.inject({ method: "PATCH", url: `/venues/${venue}`, headers: { "x-user": who } });

afterEach(async () => {
  await app?.close();
  roleLookup.mockClear();
});

describe("venueScoped — manager access", () => {
  it.each(["owner", "manager"])("admits a venue %s inside the venue context", async (who) => {
    app = await buildApp();

    const response = await patchAs(who);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ venueId: VENUE_A, context: VENUE_A });
  });

  it("refuses a staff member with 403", async () => {
    app = await buildApp();

    const response = await patchAs("staff");

    expect(response.statusCode).toBe(403);
    expect(response.json().detail).toBe("Manager role required for this venue");
  });

  it("refuses a non-member with the membership 403", async () => {
    app = await buildApp();

    const response = await patchAs("outsider");

    expect(response.statusCode).toBe(403);
    expect(response.json().detail).toBe("You do not have access to this venue");
  });

  it("lets a platform admin bypass without a role lookup", async () => {
    app = await buildApp();

    expect((await patchAs("admin", "venue-z")).statusCode).toBe(200);
    expect(roleLookup).not.toHaveBeenCalled();
  });

  it("records the access kind in the route descriptor", async () => {
    const handler = venueScoped(
      { venue: { from: "params", field: "id" }, access: "manager" },
      async () => ({})
    );

    expect(venueScopeOf(handler)).toBe("params.id/manager");
  });
});
