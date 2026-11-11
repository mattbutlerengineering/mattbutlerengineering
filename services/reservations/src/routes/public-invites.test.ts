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
  venueService: {
    list: vi.fn(),
    getById: vi.fn(),
    getBySlug: vi.fn(),
    getPolicyById: vi.fn(),
  },
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
}));

import { getInvitePublicView, addInviteRsvp } from "../services/reservation-invite.js";

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

const ALLOWED_TOP = ["date", "partySize", "rsvps", "status", "time", "venue"];
const ALLOWED_VENUE = ["name", "slug"];

describe("GET /public/v1/invites/:token", () => {
  let app: FastifyInstance;

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
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_BYPASS_IN_TESTS;
  });

  const get = (token: string) => app.inject({ method: "GET", url: `/public/v1/invites/${token}` });

  it("returns only the allow-listed fields", async () => {
    vi.mocked(getInvitePublicView).mockResolvedValue({
      kind: "ok",
      view: {
        venue: { name: "The Oak Table", slug: "the-oak-table" },
        date: "2026-07-10",
        time: "18:00",
        partySize: 4,
        rsvps: [],
        status: "CONFIRMED",
        // Fields a leaky service could hand over; the route must drop them.
        ...({
          id: "res_1",
          guestName: "Jane Doe",
          guestEmail: "jane@example.com",
          guestPhone: "+1555000111",
          notes: "Window seat",
        } as object),
      },
    });
    const res = await get("venue_1.secret");
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Record<string, unknown> };
    expect(Object.keys(body.data).sort()).toEqual(ALLOWED_TOP);
    expect(Object.keys(body.data.venue as object).sort()).toEqual(ALLOWED_VENUE);
    expect(body.data).toEqual({
      venue: { name: "The Oak Table", slug: "the-oak-table" },
      date: "2026-07-10",
      time: "18:00",
      partySize: 4,
      rsvps: [],
      status: "CONFIRMED",
    });
    expect(res.body).not.toMatch(/jane|1555000111|Window seat|res_1/i);
  });

  it("answers 404 for an unknown token", async () => {
    vi.mocked(getInvitePublicView).mockResolvedValue({ kind: "missing" });
    const res = await get("nope");
    expect(res.statusCode).toBe(404);
  });

  it("answers 410 with a friendly body for a revoked, cancelled or past invite", async () => {
    vi.mocked(getInvitePublicView).mockResolvedValue({ kind: "gone" });
    const res = await get("venue_1.secret");
    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ status: 410 });
    expect(JSON.stringify(res.json())).toMatch(/no longer available/i);
  });

  it("never lets an invite token act as a manage token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/public/v1/reservations/manage/signal?token=venue_1.secret",
      payload: { kind: "arrived" },
    });
    expect([401, 403, 404]).toContain(res.statusCode);
    expect(getInvitePublicView).not.toHaveBeenCalled();
    // And a manage token does not open the invite route either.
    vi.mocked(getInvitePublicView).mockResolvedValue({ kind: "missing" });
    const reverse = await get(generateManageToken("res_1", "jane@example.com"));
    expect([404, 414]).toContain(reverse.statusCode);
  });

  describe("POST /public/v1/invites/:token/rsvp", () => {
    const post = (payload: object, token = "venue_1.secret") =>
      app.inject({ method: "POST", url: `/public/v1/invites/${token}/rsvp`, payload });

    it("stores a valid RSVP", async () => {
      vi.mocked(addInviteRsvp).mockResolvedValue({ kind: "ok" });
      const res = await post({ firstName: "Sam", status: "IN" });
      expect(res.statusCode).toBe(201);
      expect(addInviteRsvp).toHaveBeenCalledWith("venue_1.secret", {
        firstName: "Sam",
        status: "IN",
      });
    });

    it.each([
      [{ firstName: "x".repeat(41), status: "IN" }],
      [{ firstName: "", status: "IN" }],
      [{ firstName: "   ", status: "IN" }],
      [{ firstName: "<script>", status: "IN" }],
      [{ firstName: "Sam", status: "MAYBE" }],
      [{ status: "IN" }],
    ])("rejects invalid body %j with 400", async (body) => {
      const res = await post(body);
      expect(res.statusCode).toBe(400);
      expect(addInviteRsvp).not.toHaveBeenCalled();
    });

    it("drops unknown body fields instead of storing them", async () => {
      vi.mocked(addInviteRsvp).mockResolvedValue({ kind: "ok" });
      await post({ firstName: "Sam", status: "IN", email: "a@b.co" });
      expect(addInviteRsvp).toHaveBeenCalledWith("venue_1.secret", {
        firstName: "Sam",
        status: "IN",
      });
    });

    it("answers 404 for an unknown token", async () => {
      vi.mocked(addInviteRsvp).mockResolvedValue({ kind: "missing" });
      expect((await post({ firstName: "Sam", status: "IN" })).statusCode).toBe(404);
    });

    it("answers 410 for a revoked or cancelled invite", async () => {
      vi.mocked(addInviteRsvp).mockResolvedValue({ kind: "gone" });
      expect((await post({ firstName: "Sam", status: "IN" })).statusCode).toBe(410);
    });

    it("answers 409 once the RSVP cap is reached", async () => {
      vi.mocked(addInviteRsvp).mockResolvedValue({ kind: "full" });
      expect((await post({ firstName: "Sam", status: "IN" })).statusCode).toBe(409);
    });
  });

  it("rate limits the RSVP write with 429", async () => {
    vi.mocked(addInviteRsvp).mockResolvedValue({ kind: "ok" });
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      last = (
        await app.inject({
          method: "POST",
          url: "/public/v1/invites/venue_1.other/rsvp",
          payload: { firstName: "Sam", status: "IN" },
        })
      ).statusCode;
    }
    expect(last).toBe(429);
  });

  // Last: it spends the per-IP budget the other cases share.
  it("is rate limited", async () => {
    vi.mocked(getInvitePublicView).mockResolvedValue({ kind: "missing" });
    let last = 0;
    for (let i = 0; i < 31; i += 1) last = (await get("venue_1.secret")).statusCode;
    expect(last).toBe(429);
  });
});
