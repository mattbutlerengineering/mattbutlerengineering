import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveVenueId } = vi.hoisted(() => ({
  mockResolveVenueId: vi.fn(),
}));

vi.mock("./resolve-venue.js", () => ({
  resolveVenueId: mockResolveVenueId,
}));

import { resolveReservationVenueId } from "./deposit-venue.js";

describe("resolveReservationVenueId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the venue owning the reservation via the SECURITY DEFINER resolver", async () => {
    mockResolveVenueId.mockResolvedValueOnce("venue-1");

    await expect(resolveReservationVenueId("res-123")).resolves.toBe("venue-1");
    expect(mockResolveVenueId).toHaveBeenCalledWith("reservation", "res-123");
  });

  it("returns null when the reservation does not exist (fail closed, never venue-less)", async () => {
    mockResolveVenueId.mockResolvedValueOnce(null);

    await expect(resolveReservationVenueId("res-missing")).resolves.toBeNull();
  });

  it("returns null when the reservation carries no venue (ADR-026 §2 NULL venue_id)", async () => {
    mockResolveVenueId.mockResolvedValueOnce(null);

    await expect(resolveReservationVenueId("res-123")).resolves.toBeNull();
  });
});
