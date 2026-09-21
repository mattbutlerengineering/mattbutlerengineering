import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReservationDb } = vi.hoisted(() => ({
  mockReservationDb: { findUnique: vi.fn() },
}));

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({ prisma: { reservation: mockReservationDb } });
});

import { resolveReservationVenueId } from "./deposit-venue.js";

describe("resolveReservationVenueId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the venue owning the reservation, selecting only venue_id", async () => {
    mockReservationDb.findUnique.mockResolvedValueOnce({ venueId: "venue-1" });

    await expect(resolveReservationVenueId("res-123")).resolves.toBe("venue-1");
    expect(mockReservationDb.findUnique).toHaveBeenCalledWith({
      where: { id: "res-123" },
      select: { venueId: true },
    });
  });

  it("returns null when the reservation does not exist (fail closed, never venue-less)", async () => {
    mockReservationDb.findUnique.mockResolvedValueOnce(null);

    await expect(resolveReservationVenueId("res-missing")).resolves.toBeNull();
  });

  it("returns null when the reservation carries no venue (ADR-026 §2 NULL venue_id)", async () => {
    mockReservationDb.findUnique.mockResolvedValueOnce({ venueId: null });

    await expect(resolveReservationVenueId("res-123")).resolves.toBeNull();
  });
});
