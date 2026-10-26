import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import type { DomainServices } from "../services/domain-services.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken, verifyManageToken } from "./public-reservations.js";

vi.mock("../notifications/index.js", () => {
  class Mock {
    sendBookingConfirmation = vi.fn().mockResolvedValue(undefined);
    sendBookingReminder = vi.fn().mockResolvedValue(undefined);
    sendBookingModified = vi.fn().mockResolvedValue(undefined);
    sendBookingCancelled = vi.fn().mockResolvedValue(undefined);
  }
  return {
    ResendNotificationAdapter: Mock,
    TwilioSmsAdapter: class {},
    NotificationDispatcher: Mock,
  };
});

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: "email_1" }) },
  })),
}));

vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue_1"),
}));

vi.mock("../services/manage-rebook.js", () => ({
  loadVenueCancellation: vi.fn().mockResolvedValue(null),
  rebookVenueCancelled: vi.fn(),
}));

import { rebookVenueCancelled } from "../services/manage-rebook.js";

const reservationService = {
  getById: vi.fn(),
} as unknown as DomainServices["reservationService"];

const cancelled = {
  id: "res_1",
  venueId: "venue_1",
  status: "CANCELLED",
  partySize: 2,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+15550001111",
};

const OFFER = "2026-11-06T02:00:00.000Z";

describe("POST /public/v1/reservations/manage/rebook", () => {
  let app: FastifyInstance;
  const token = generateManageToken("res_1", "jane@example.com");

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({ logger: false, services: { reservationService } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  beforeEach(() => {
    vi.mocked(reservationService.getById).mockResolvedValue(cancelled as never);
    vi.mocked(rebookVenueCancelled).mockReset();
  });

  const post = (body: unknown, auth = token) =>
    app.inject({
      method: "POST",
      url: "/public/v1/reservations/manage/rebook",
      headers: { authorization: `Bearer ${auth}` },
      payload: body as object,
    });

  it("rebooks and returns the new reservation's manage token", async () => {
    vi.mocked(rebookVenueCancelled).mockResolvedValueOnce({
      ok: true,
      reservation: { id: "res_2", guestEmail: "jane@example.com", startTime: OFFER } as never,
    });

    const response = await post({ offerId: OFFER });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.reservationId).toBe("res_2");
    const verified = verifyManageToken(body.manageToken);
    expect(verified).toMatchObject({ valid: true, reservationId: "res_2" });
    expect(rebookVenueCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "res_1" }),
      "venue_1",
      OFFER,
      expect.any(Date),
      expect.anything()
    );
  });

  it("returns a manage token for a phone-only guest, signed with an empty email", async () => {
    const phoneOnly = { ...cancelled, guestEmail: null };
    const phoneToken = generateManageToken("res_1", "");
    vi.mocked(reservationService.getById).mockResolvedValue(phoneOnly as never);
    vi.mocked(rebookVenueCancelled).mockResolvedValueOnce({
      ok: true,
      reservation: { id: "res_2", guestEmail: null, startTime: OFFER } as never,
    });

    const response = await post({ offerId: OFFER }, phoneToken);

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(typeof body.manageToken).toBe("string");
    expect(verifyManageToken(body.manageToken)).toMatchObject({
      valid: true,
      reservationId: "res_2",
      guestEmail: "",
    });
  });

  it("refuses with 422 where the venue would need a deposit", async () => {
    vi.mocked(rebookVenueCancelled).mockResolvedValueOnce({
      ok: false,
      reason: "deposit-required",
    });
    const response = await post({ offerId: OFFER });
    expect(response.statusCode).toBe(422);
    expect(response.json().detail).toMatch(/deposit/i);
  });

  it("answers 409 when the booking is already rebooked", async () => {
    vi.mocked(rebookVenueCancelled).mockResolvedValueOnce({
      ok: false,
      reason: "already-rebooked",
    });
    const response = await post({ offerId: OFFER });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ALREADY_REBOOKED");
  });

  it("answers 409 for a slot that is no longer offered or free", async () => {
    vi.mocked(rebookVenueCancelled).mockResolvedValueOnce({ ok: false, reason: "slot-taken" });
    expect((await post({ offerId: OFFER })).statusCode).toBe(409);
    vi.mocked(rebookVenueCancelled).mockResolvedValueOnce({
      ok: false,
      reason: "offer-unavailable",
    });
    expect((await post({ offerId: OFFER })).statusCode).toBe(409);
  });

  it("answers 422 when the booking gate refuses the time", async () => {
    vi.mocked(rebookVenueCancelled).mockResolvedValueOnce({
      ok: false,
      reason: "rejected",
      rejection: { code: "outside-availability", reason: "closed" } as never,
    });
    expect((await post({ offerId: OFFER })).statusCode).toBe(422);
  });

  it("rejects a missing offerId and an invalid token", async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ offerId: OFFER }, "garbage")).statusCode).toBe(401);
  });
});
