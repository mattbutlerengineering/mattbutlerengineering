import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      $queryRaw: vi.fn(),
    },
  });
});

import { resolveVenueId } from "./resolve-venue.js";
import { prisma } from "./database.js";

describe("resolveVenueId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the venue id for an entity key via the raw $queryRaw call", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ app_resolve_venue_id: "venue-1" }]);

    await expect(resolveVenueId("table", "table-123")).resolves.toBe("venue-1");
  });

  it("passes kind, key, and group as parameterized values, never string interpolation", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ app_resolve_venue_id: "venue-1" }]);

    await resolveVenueId("venue_slug", "my-slug", "group-1");

    const [strings, ...values] = vi.mocked(prisma.$queryRaw).mock.calls[0]!;
    expect((strings as unknown as string[]).join("?")).not.toContain("my-slug");
    expect(values).toEqual(["venue_slug", "my-slug", "group-1"]);
  });

  it("passes null for an omitted group", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ app_resolve_venue_id: "venue-1" }]);

    await resolveVenueId("venue", "venue-1");

    const [, , , group] = vi.mocked(prisma.$queryRaw).mock.calls[0]!;
    expect(group).toBeNull();
  });

  it("returns null when the function resolves no venue (missing, ambiguous, or NULL venue_id)", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ app_resolve_venue_id: null }]);

    await expect(resolveVenueId("reservation", "res-missing")).resolves.toBeNull();
  });

  it("returns null when the query returns no row", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);

    await expect(resolveVenueId("guest", "guest-missing")).resolves.toBeNull();
  });
});
