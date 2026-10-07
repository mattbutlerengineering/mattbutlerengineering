import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      table: {
        findUnique: vi.fn(),
      },
    },
  });
});

import { isTableInVenue } from "./table-venue.js";
import { prisma } from "./database.js";

describe("isTableInVenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the table belongs to the given venue", async () => {
    vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({ venueId: "venue-1" } as never);

    await expect(isTableInVenue("table-1", "venue-1")).resolves.toBe(true);
  });

  it("returns false when the table belongs to a different venue", async () => {
    vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({ venueId: "venue-2" } as never);

    await expect(isTableInVenue("table-1", "venue-1")).resolves.toBe(false);
  });

  it("returns false (never throws) when the table does not exist", async () => {
    vi.mocked(prisma.table.findUnique).mockResolvedValueOnce(null);

    await expect(isTableInVenue("table-missing", "venue-1")).resolves.toBe(false);
  });

  it("calls findUnique with only the id filter and the venueId select", async () => {
    vi.mocked(prisma.table.findUnique).mockResolvedValueOnce({ venueId: "venue-1" } as never);

    await isTableInVenue("table-1", "venue-1");

    expect(prisma.table.findUnique).toHaveBeenCalledWith({
      where: { id: "table-1" },
      select: { venueId: true },
    });
  });
});
