import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { generateManageToken } from "./public-reservations.js";
import type { NotificationDispatcher } from "../notifications/index.js";
import type { JobsPort } from "../transitions/ports.js";

vi.mock("../services/reservation.js", () => ({
  reservationService: {
    getById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock("../services/venue.js", () => ({
  venueService: { list: vi.fn(), getById: vi.fn(), getBySlug: vi.fn(), getPolicyById: vi.fn() },
  venueGroupService: {},
}));

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => vi.fn()),
}));

vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue_1"),
}));

vi.mock("../services/reservation-invite.js", () => ({
  getInvitePublicView: vi.fn(),
  createInvite: vi.fn(),
  findLiveInviteByToken: vi.fn(),
  revokeInvitesForReservation: vi.fn(),
  hashInviteToken: vi.fn(),
  addInviteRsvp: vi.fn(),
  getInviteSummaryForReservation: vi.fn(),
}));

import { reservationService } from "../services/reservation.js";
import { createInvite, getInviteSummaryForReservation } from "../services/reservation-invite.js";

const mockReservation = {
  id: "res_1",
  venueId: "venue_1",
  date: "2026-07-10",
  startTime: "2026-07-10T22:00:00.000Z",
  endTime: "2026-07-10T23:30:00.000Z",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+1555000111",
  status: "CONFIRMED",
  notes: null,
  guestId: null,
  userId: null,
  tableId: null,
  table: null,
  guest: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

function stubNotifications(): never {
  return {
    sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
    sendBookingReminder: vi.fn().mockResolvedValue(undefined),
    sendBookingModified: vi.fn().mockResolvedValue(undefined),
    sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
    sendWinBack: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationDispatcher as never;
}

function stubJobs(): JobsPort {
  return {
    schedule: vi.fn().mockResolvedValue("job"),
    cancel: vi.fn().mockResolvedValue(false),
  };
}

describe("manage-token party invite routes", () => {
  let app: FastifyInstance;
  const token = () => generateManageToken("res_1", "jane@example.com");

  beforeAll(async () => {
    process.env.AUTH_BYPASS_IN_TESTS = "true";
    app = await buildApp({
      logger: false,
      notificationPort: stubNotifications(),
      jobs: stubJobs(),
    });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reservationService.getById).mockResolvedValue(mockReservation as never);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  describe("POST /public/v1/reservations/manage/invite", () => {
    const post = (t?: string) =>
      app.inject({
        method: "POST",
        url: `/public/v1/reservations/manage/invite${t === undefined ? "" : `?token=${t}`}`,
      });

    it("creates an invite for the token's reservation and returns only the invite token", async () => {
      vi.mocked(createInvite).mockResolvedValue({ id: "inv_1", token: "venue_1.secret" });
      const res = await post(token());
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ data: { inviteToken: "venue_1.secret" } });
      expect(createInvite).toHaveBeenCalledWith({ venueId: "venue_1", reservationId: "res_1" });
    });

    it("never derives the invite token from the manage token", async () => {
      vi.mocked(createInvite).mockResolvedValue({ id: "inv_1", token: "venue_1.secret" });
      const t = token();
      const res = await post(t);
      expect(res.body).not.toContain(t);
    });

    it("rejects a missing token", async () => {
      const res = await post();
      expect(res.statusCode).toBe(400);
      expect(createInvite).not.toHaveBeenCalled();
    });

    it("rejects an invalid token", async () => {
      const res = await post("garbage");
      expect(res.statusCode).toBe(401);
      expect(createInvite).not.toHaveBeenCalled();
    });

    it("refuses to invite to a cancelled reservation", async () => {
      vi.mocked(reservationService.getById).mockResolvedValue({
        ...mockReservation,
        status: "CANCELLED",
      } as never);
      const res = await post(token());
      expect(res.statusCode).toBe(409);
      expect(createInvite).not.toHaveBeenCalled();
    });
  });

  describe("GET /public/v1/reservations/manage/invite", () => {
    const get = (t?: string) =>
      app.inject({
        method: "GET",
        url: `/public/v1/reservations/manage/invite${t === undefined ? "" : `?token=${t}`}`,
      });

    it("returns the RSVP counts and nothing else", async () => {
      vi.mocked(getInviteSummaryForReservation).mockResolvedValue({
        invited: true,
        confirmed: 2,
        declined: 1,
      });
      const res = await get(token());
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: { invited: true, confirmed: 2, declined: 1, partySize: 4 },
      });
      expect(getInviteSummaryForReservation).toHaveBeenCalledWith({
        venueId: "venue_1",
        reservationId: "res_1",
      });
    });

    it("rejects a missing token", async () => {
      const res = await get();
      expect(res.statusCode).toBe(400);
    });

    it("rejects an invalid token", async () => {
      const res = await get("garbage");
      expect(res.statusCode).toBe(401);
    });
  });
});
