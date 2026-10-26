import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import {
  createHasAnyVenueMembership,
  createVenueMembershipLookup,
  createVenueRoleLookup,
} from "./venue-membership.js";

function makeFakePrismaClient(count: number) {
  return {
    venueMembership: {
      count: vi.fn().mockResolvedValue(count),
    },
  } as unknown as PrismaClient;
}

describe("createVenueMembershipLookup", () => {
  it("resolves true when a membership row exists for the userSub/venueId pair", async () => {
    const client = makeFakePrismaClient(1);
    const lookup = createVenueMembershipLookup(client);

    const result = await lookup("auth0|user-1", "venue-1");

    expect(result).toBe(true);
  });

  it("resolves false when no membership row exists for the userSub/venueId pair", async () => {
    const client = makeFakePrismaClient(0);
    const lookup = createVenueMembershipLookup(client);

    const result = await lookup("auth0|user-1", "venue-1");

    expect(result).toBe(false);
  });

  it("resolves false when the userSub has a membership for a different venueId (cross-tenant leak guard)", async () => {
    // The fake client only knows about the exact (userSub, venueId) pair it was
    // configured with — any other venueId for the same user must count 0 rows.
    const client = {
      venueMembership: {
        count: vi.fn(async ({ where }: { where: { userSub: string; venueId: string } }) =>
          where.userSub === "auth0|user-1" && where.venueId === "venue-1" ? 1 : 0
        ),
      },
    } as unknown as PrismaClient;
    const lookup = createVenueMembershipLookup(client);

    const result = await lookup("auth0|user-1", "venue-2");

    expect(result).toBe(false);
  });

  it("queries venueMembership.count with exactly { where: { userSub, venueId } }", async () => {
    const client = makeFakePrismaClient(1);
    const lookup = createVenueMembershipLookup(client);

    await lookup("auth0|user-1", "venue-1");

    expect(client.venueMembership.count).toHaveBeenCalledTimes(1);
    expect(client.venueMembership.count).toHaveBeenCalledWith({
      where: { userSub: "auth0|user-1", venueId: "venue-1" },
    });
  });
});

describe("createHasAnyVenueMembership", () => {
  it("resolves false when the userSub holds no membership row at all (the bootstrap case)", async () => {
    const client = makeFakePrismaClient(0);
    const hasAny = createHasAnyVenueMembership(client);

    expect(await hasAny("auth0|brand-new-user")).toBe(false);
  });

  it("resolves true when the userSub holds a membership for ANY venue", async () => {
    const client = makeFakePrismaClient(1);
    const hasAny = createHasAnyVenueMembership(client);

    expect(await hasAny("auth0|established-operator")).toBe(true);
  });

  it("scopes the query to userSub only — never to a venueId", async () => {
    // The whole point of this lookup is "any venue". A venueId leaking into the
    // where-clause would make an established operator look like a brand-new
    // user for every venue they are not a member of, re-opening the gate.
    const client = makeFakePrismaClient(1);
    const hasAny = createHasAnyVenueMembership(client);

    await hasAny("auth0|user-1");

    expect(client.venueMembership.count).toHaveBeenCalledTimes(1);
    expect(client.venueMembership.count).toHaveBeenCalledWith({
      where: { userSub: "auth0|user-1" },
    });
  });

  it("propagates a query rejection instead of resolving false", async () => {
    // Fail-closed: resolving false here would mean a database outage grants
    // every authenticated identity permission to create a venue.
    const client = {
      venueMembership: { count: vi.fn().mockRejectedValue(new Error("db is down")) },
    } as unknown as PrismaClient;
    const hasAny = createHasAnyVenueMembership(client);

    await expect(hasAny("auth0|user-1")).rejects.toThrow("db is down");
  });
});

describe("createVenueRoleLookup", () => {
  function makeRoleClient(row: { role: string } | null) {
    const findUnique = vi.fn().mockResolvedValue(row);
    const client = { venueMembership: { findUnique } } as unknown as PrismaClient;
    return { client, findUnique };
  }

  it.each(["owner", "manager", "staff"])("resolves the member's %s role", async (role) => {
    const lookup = createVenueRoleLookup(makeRoleClient({ role }).client);

    await expect(lookup("auth0|user-1", "venue-1")).resolves.toBe(role);
  });

  it("resolves null when no membership row exists", async () => {
    const lookup = createVenueRoleLookup(makeRoleClient(null).client);

    await expect(lookup("auth0|user-1", "venue-1")).resolves.toBeNull();
  });

  it("looks up by the (userSub, venueId) unique key and selects only role", async () => {
    const { client, findUnique } = makeRoleClient({ role: "staff" });

    await createVenueRoleLookup(client)("auth0|user-1", "venue-1");

    expect(findUnique).toHaveBeenCalledWith({
      where: { userSub_venueId: { userSub: "auth0|user-1", venueId: "venue-1" } },
      select: { role: true },
    });
  });

  it("propagates a query rejection", async () => {
    const client = {
      venueMembership: { findUnique: vi.fn().mockRejectedValue(new Error("db is down")) },
    } as unknown as PrismaClient;

    await expect(createVenueRoleLookup(client)("auth0|user-1", "venue-1")).rejects.toThrow(
      "db is down"
    );
  });
});
