import { describe, it, expect, vi } from "vitest";
import { resolveReservationGuestEmail, resolveCurrentUserEmail } from "./reservation-owner.js";
import type { FastifyRequest } from "fastify";

describe("resolveReservationGuestEmail", () => {
  it("returns guestEmail when reservation exists", async () => {
    const mockGetById = vi.fn().mockResolvedValue({
      id: "res-123",
      guestEmail: "owner@example.com",
    });

    const request = {
      params: { id: "res-123" },
      server: {},
    } as unknown as FastifyRequest;

    const result = await resolveReservationGuestEmail(mockGetById)(request);

    expect(mockGetById).toHaveBeenCalledWith("res-123");
    expect(result).toBe("owner@example.com");
  });

  it("returns null when reservation does not exist", async () => {
    const mockGetById = vi.fn().mockResolvedValue(null);

    const request = {
      params: { id: "res-missing" },
      server: {},
    } as unknown as FastifyRequest;

    const result = await resolveReservationGuestEmail(mockGetById)(request);

    expect(result).toBe(null);
  });

  it("returns null when reservation has no guestEmail", async () => {
    const mockGetById = vi.fn().mockResolvedValue({
      id: "res-123",
      guestEmail: null,
    });

    const request = {
      params: { id: "res-123" },
      server: {},
    } as unknown as FastifyRequest;

    const result = await resolveReservationGuestEmail(mockGetById)(request);

    expect(result).toBe(null);
  });
});

describe("resolveCurrentUserEmail", () => {
  it("returns the authenticated user email", async () => {
    const request = {
      user: { id: "auth0|123", email: "user@example.com" },
    } as unknown as FastifyRequest;

    const result = await resolveCurrentUserEmail(request);

    expect(result).toBe("user@example.com");
  });

  it("returns null when user has no email", async () => {
    const request = {
      user: { id: "auth0|123" },
    } as unknown as FastifyRequest;

    const result = await resolveCurrentUserEmail(request);

    expect(result).toBe(null);
  });

  it("returns null when user is undefined", async () => {
    const request = {
      user: undefined,
    } as unknown as FastifyRequest;

    const result = await resolveCurrentUserEmail(request);

    expect(result).toBe(null);
  });
});
