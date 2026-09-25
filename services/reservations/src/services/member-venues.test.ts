import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/index.js";
import { getMemberVenueIds } from "./member-venues.js";

function makeFakePrismaClient(rows: Array<{ venueId: string }>) {
  return {
    venueMembership: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  } as unknown as PrismaClient;
}

describe("getMemberVenueIds", () => {
  it("returns the distinct venue ids the user holds a membership for", async () => {
    const client = makeFakePrismaClient([{ venueId: "venue-1" }, { venueId: "venue-2" }]);

    const result = await getMemberVenueIds("auth0|user-1", client);

    expect(result).toEqual(["venue-1", "venue-2"]);
  });

  it("returns an empty array when the user holds no membership at all", async () => {
    const client = makeFakePrismaClient([]);

    const result = await getMemberVenueIds("auth0|no-memberships", client);

    expect(result).toEqual([]);
  });

  it("queries venue_memberships directly — not the RLS-protected venues table", async () => {
    const client = makeFakePrismaClient([{ venueId: "venue-1" }]);

    await getMemberVenueIds("auth0|user-1", client);

    expect(client.venueMembership.findMany).toHaveBeenCalledTimes(1);
    expect(client.venueMembership.findMany).toHaveBeenCalledWith({
      where: { userSub: "auth0|user-1" },
      select: { venueId: true },
      distinct: ["venueId"],
    });
  });
});
