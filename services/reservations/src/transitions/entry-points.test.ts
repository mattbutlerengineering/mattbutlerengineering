/**
 * Reservation-transition suite (maintenance run reservation-transition-effects).
 *
 * Drives every entry point that changes a reservation's state through
 * `buildApp` + `inject` and asserts what the transition SETS OFF — live SSE
 * events, guest messages, reminder jobs and deposit money operations — via
 * the effects harness (`src/test/effects-harness.ts`).
 *
 * Written FIRST, against today's code. Every money and guest-messaging row
 * pins today's behaviour exactly (plain `it`). The deltas Matt ruled on
 * 2026-10-04 (defect.md "Divergence ruling": live updates everywhere, one
 * fix D8) fail on today's code and are written as `it.fails`; each flips to
 * `it` in the PR that implements it. Guards for behaviour the ruling keeps
 * (D2/D4 absences, no new reminders for staff-created bookings, the guest
 * modify double email) pass today and are plain `it`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import type { Reservation } from "@mbe/types";

const h = vi.hoisted(() => ({
  prisma: {
    floorPlan: { findUnique: vi.fn(), findMany: vi.fn() },
    guest: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../services/reservation.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reservationService: {
    list: vi.fn(),
    listByUserId: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    updateWithConflictCheck: vi.fn(),
    createWithConflictCheck: vi.fn(),
    createWalkIn: vi.fn(),
  },
}));

vi.mock("../services/venue.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  venueService: { getById: vi.fn(), getPolicyById: vi.fn(), getBySlug: vi.fn() },
}));

vi.mock("../services/guest-link.js", () => ({
  resolveGuestLink: vi.fn(),
  linkOrCreateGuest: vi.fn(),
}));

vi.mock("../services/confirm-hold.js", () => ({ confirmHold: vi.fn() }));

vi.mock("../services/resolve-venue.js", () => ({
  resolveVenueId: vi.fn().mockResolvedValue("venue-1"),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({ prisma: h.prisma });
});

// The ONE temporary deposit seam (architecture.md test plan): routes and the
// cancellation / no-show / modification services import the `depositService`
// singleton, so it is pointed at the harness's recorder here. PR 3 replaces
// this with an injected DepositService fake.
vi.mock("../services/deposit.js", async (importOriginal) => {
  const { recordingDepositService } = await import("../test/effects-harness.js");
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    depositService: recordingDepositService,
  };
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

import { buildApp } from "../app.js";
import { reservationService } from "../services/reservation.js";
import { venueService, type VenuePolicy } from "../services/venue.js";
import { resolveGuestLink, linkOrCreateGuest } from "../services/guest-link.js";
import { confirmHold } from "../services/confirm-hold.js";
import { resolveVenueId } from "../services/resolve-venue.js";
import { generateManageToken } from "../routes/public-reservations.js";
import { createEffectsRecorder, type EffectsRecorder } from "../test/effects-harness.js";
import { createMockReservation, createMockTable, createMockJWTPayload } from "../test/mocks.js";
import { jwtVerify } from "jose";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2030-06-01T12:00:00.000Z");
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * HOUR).toISOString();

/** Staff API prefix — the one route literal in this file (antipattern ratchet). */
const API_V1 = "/api/v1";
const RES_ID = "res-1";
const GUEST_EMAIL = "john@example.com";

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    ...createMockReservation({
      id: RES_ID,
      venueId: "venue-1",
      status: "CONFIRMED",
      guestEmail: GUEST_EMAIL,
      date: at(72).slice(0, 10),
      startTime: at(72),
      endTime: at(74),
    }),
    ...overrides,
  } as unknown as Reservation;
}

function makeVenuePolicy(overrides: Partial<VenuePolicy> = {}): VenuePolicy {
  return {
    id: "venue-1",
    slug: "the-oak-table",
    currencyCode: "USD",
    depositEnabled: true,
    depositType: "flat",
    depositAmountCents: null,
    freeCancellationHours: null,
    lateCancellationFeePercent: null,
    noShowFeePercent: null,
    ...overrides,
  };
}

const VENUE = {
  id: "venue-1",
  name: "The Oak Table",
  slug: "the-oak-table",
  ianaTimezone: "America/Los_Angeles",
  settings: { postVisitEmailEnabled: true, feedbackUrl: null },
};

const staffAuth = { authorization: "Bearer valid-token" };
const manageAuth = () => ({ authorization: `Bearer ${generateManageToken(RES_ID, GUEST_EMAIL)}` });

function asGuestOwner() {
  vi.mocked(jwtVerify).mockResolvedValue({
    payload: createMockJWTPayload({ permissions: [], email: GUEST_EMAIL }),
    protectedHeader: { alg: "RS256" },
  } as never);
}

describe("reservation transitions — effects per entry point", () => {
  let app: FastifyInstance;
  let rec: EffectsRecorder;
  const originalEnv = process.env;

  async function send(opts: InjectOptions) {
    const response = await app.inject(opts);
    await rec.settle();
    return response;
  }

  const kinds = () => rec.effects.messages.map((m) => m.kind).sort();
  const eventTypes = () => rec.effects.events.map((e) => e.type);
  const scheduled = () => rec.effects.jobs.filter((j) => j.op === "schedule");

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    process.env = {
      ...originalEnv,
      AUTH_AUTHORITY: "https://test.auth0.com",
      AUTH_AUDIENCE: "https://api.example.com",
      AUTH_BYPASS_IN_TESTS: "true",
    };
    vi.mocked(jwtVerify).mockResolvedValue({
      payload: createMockJWTPayload(),
      protectedHeader: { alg: "RS256" },
    } as never);
    vi.mocked(resolveVenueId).mockResolvedValue("venue-1");
    vi.mocked(venueService.getById).mockResolvedValue(VENUE as never);
    vi.mocked(venueService.getPolicyById).mockResolvedValue(makeVenuePolicy());
    rec = createEffectsRecorder();
    app = await buildApp({ logger: false, ...rec.appOptions });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
    vi.resetAllMocks();
    process.env = originalEnv;
  });

  // ─── Cancel (D1) ───────────────────────────────────────────────────────────

  describe("cancelled", () => {
    const doors = {
      "staff-patch": () => ({
        method: "PATCH" as const,
        url: `${API_V1}/reservations/${RES_ID}`,
        headers: staffAuth,
        payload: { status: "CANCELLED" },
      }),
      "staff-delete": () => ({
        method: "DELETE" as const,
        url: `${API_V1}/reservations/${RES_ID}`,
        headers: staffAuth,
      }),
      "guest-manage": () => ({
        method: "DELETE" as const,
        url: "/public/v1/reservations/manage",
        headers: manageAuth(),
      }),
    };

    function arrangeCancel() {
      vi.mocked(reservationService.getById).mockResolvedValue(makeReservation());
      vi.mocked(reservationService.update).mockResolvedValue(
        makeReservation({ status: "CANCELLED" })
      );
      rec.seedReminders(RES_ID, "venue-1");
      rec.deposits.seed({ id: "dep-1", status: "held", amountCents: 10000 });
    }

    const reminderCancels = [
      { op: "cancel", jobId: `booking-reminder:${RES_ID}` },
      { op: "cancel", jobId: `day-of-reminder:${RES_ID}` },
    ];

    it("staff-patch (admin): full refund, cancelled email, both reminders cancelled", async () => {
      arrangeCancel();
      const response = await send(doors["staff-patch"]());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "refund", args: ["dep-1"] }]);
      expect(rec.effects.messages).toEqual([
        { kind: "booking-cancelled", reservationId: RES_ID, guestEmail: GUEST_EMAIL },
      ]);
      expect(rec.effects.jobs).toEqual(reminderCancels);
    });

    it("staff-delete (admin): full refund, cancelled email, both reminders cancelled", async () => {
      arrangeCancel();
      const response = await send(doors["staff-delete"]());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "refund", args: ["dep-1"] }]);
      expect(kinds()).toEqual(["booking-cancelled"]);
      expect(rec.effects.jobs).toEqual(reminderCancels);
    });

    it.each(["staff-patch", "staff-delete"] as const)(
      "%s (admin) inside the late-cancel window still refunds in full (staff waive the fee)",
      async (door) => {
        arrangeCancel();
        vi.mocked(reservationService.getById).mockResolvedValue(
          makeReservation({ startTime: at(5), endTime: at(7) })
        );
        vi.mocked(venueService.getPolicyById).mockResolvedValue(
          makeVenuePolicy({ freeCancellationHours: 24, lateCancellationFeePercent: 50 })
        );
        const response = await send(doors[door]());
        expect(response.statusCode).toBe(200);
        expect(rec.effects.depositOps).toEqual([{ op: "refund", args: ["dep-1"] }]);
      }
    );

    it("staff-patch by the non-admin OWNER: guest fee policy applies (partial refund)", async () => {
      asGuestOwner();
      arrangeCancel();
      vi.mocked(reservationService.getById).mockResolvedValue(
        makeReservation({ startTime: at(5), endTime: at(7) })
      );
      vi.mocked(venueService.getPolicyById).mockResolvedValue(
        makeVenuePolicy({ freeCancellationHours: 24, lateCancellationFeePercent: 50 })
      );
      const response = await send(doors["staff-patch"]());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "refundPartial", args: ["dep-1", 5000] }]);
      expect(kinds()).toEqual(["booking-cancelled"]);
    });

    it("guest-manage: guest fee policy applies (late cancel → partial refund)", async () => {
      arrangeCancel();
      vi.mocked(reservationService.getById).mockResolvedValue(
        makeReservation({ startTime: at(5), endTime: at(7) })
      );
      vi.mocked(venueService.getPolicyById).mockResolvedValue(
        makeVenuePolicy({ freeCancellationHours: 24, lateCancellationFeePercent: 50 })
      );
      const response = await send(doors["guest-manage"]());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "refundPartial", args: ["dep-1", 5000] }]);
      expect(kinds()).toEqual(["booking-cancelled"]);
      expect(rec.effects.jobs).toEqual(reminderCancels);
    });

    it("guest-manage: free-cancellation window → full refund", async () => {
      arrangeCancel();
      vi.mocked(venueService.getPolicyById).mockResolvedValue(
        makeVenuePolicy({ freeCancellationHours: 24, lateCancellationFeePercent: 50 })
      );
      const response = await send(doors["guest-manage"]());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "refund", args: ["dep-1"] }]);
    });

    it("staff-patch emits reservation:cancelled", async () => {
      arrangeCancel();
      await send(doors["staff-patch"]());
      expect(eventTypes()).toEqual(["reservation:cancelled"]);
    });

    it.fails("staff-delete emits reservation:cancelled (D1)", async () => {
      arrangeCancel();
      await send(doors["staff-delete"]());
      expect(eventTypes()).toEqual(["reservation:cancelled"]);
    });

    it.fails("guest-manage emits reservation:cancelled (D1)", async () => {
      arrangeCancel();
      await send(doors["guest-manage"]());
      expect(eventTypes()).toEqual(["reservation:cancelled"]);
    });

    it("guest-manage: a failed partial refund aborts the cancel and sets off nothing", async () => {
      arrangeCancel();
      vi.mocked(reservationService.getById).mockResolvedValue(
        makeReservation({ startTime: at(5), endTime: at(7) })
      );
      vi.mocked(venueService.getPolicyById).mockResolvedValue(
        makeVenuePolicy({ freeCancellationHours: 24, lateCancellationFeePercent: 50 })
      );
      rec.deposits.script("refundPartial", () => Promise.reject(new Error("Stripe unavailable")));
      const response = await send(doors["guest-manage"]());
      expect(response.statusCode).toBe(500);
      expect(reservationService.update).not.toHaveBeenCalled();
      expect(rec.effects.messages).toEqual([]);
      expect(rec.effects.jobs).toEqual([]);
      expect(rec.effects.events).toEqual([]);
    });

    it.each(Object.keys(doors) as (keyof typeof doors)[])(
      "%s: a failed deposit refund aborts the cancel and sets off nothing",
      async (door) => {
        arrangeCancel();
        rec.deposits.script("refund", () => Promise.reject(new Error("Stripe unavailable")));
        const response = await send(doors[door]());
        expect(response.statusCode).toBe(500);
        expect(reservationService.update).not.toHaveBeenCalled();
        expect(rec.effects.messages).toEqual([]);
        expect(rec.effects.jobs).toEqual([]);
        expect(rec.effects.events).toEqual([]);
      }
    );
  });

  // ─── No-show (D6) ──────────────────────────────────────────────────────────

  describe("no-show", () => {
    function arrangeNoShow() {
      vi.mocked(reservationService.getById).mockResolvedValue(
        makeReservation({ startTime: at(-1), endTime: at(1) })
      );
      vi.mocked(reservationService.update).mockResolvedValue(
        makeReservation({ status: "NO_SHOW" })
      );
      vi.mocked(venueService.getPolicyById).mockResolvedValue(
        makeVenuePolicy({
          freeCancellationHours: 24,
          lateCancellationFeePercent: 50,
          noShowFeePercent: 100,
        })
      );
      rec.deposits.seed({ id: "dep-1", status: "held", amountCents: 10000 });
    }
    const noShow = () => ({
      method: "PATCH" as const,
      url: `${API_V1}/reservations/${RES_ID}`,
      headers: staffAuth,
      payload: { status: "NO_SHOW" },
    });

    it("forfeits a held deposit and sends no message and no job", async () => {
      arrangeNoShow();
      const response = await send(noShow());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "forfeit", args: ["dep-1", "no_show"] }]);
      expect(rec.effects.messages).toEqual([]);
      expect(rec.effects.jobs).toEqual([]);
    });

    it("a partial no-show fee captures then partially refunds", async () => {
      arrangeNoShow();
      vi.mocked(venueService.getPolicyById).mockResolvedValue(
        makeVenuePolicy({
          freeCancellationHours: 24,
          lateCancellationFeePercent: 50,
          noShowFeePercent: 40,
        })
      );
      const response = await send(noShow());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "refundPartial", args: ["dep-1", 6000] }]);
    });

    it("marked just before the start time still charges the no-show tier (evaluated at max(now, start))", async () => {
      arrangeNoShow();
      vi.mocked(reservationService.getById).mockResolvedValue(
        makeReservation({ startTime: at(0.25), endTime: at(2) })
      );
      const response = await send(noShow());
      expect(response.statusCode).toBe(200);
      expect(rec.effects.depositOps).toEqual([{ op: "forfeit", args: ["dep-1", "no_show"] }]);
    });

    it("a failed forfeit aborts the no-show before the status write and sets off nothing", async () => {
      arrangeNoShow();
      rec.deposits.script("forfeit", () => Promise.reject(new Error("Stripe unavailable")));
      const response = await send(noShow());
      expect(response.statusCode).toBe(500);
      expect(reservationService.update).not.toHaveBeenCalled();
      expect(rec.effects.messages).toEqual([]);
      expect(rec.effects.jobs).toEqual([]);
      expect(rec.effects.events).toEqual([]);
    });

    it.fails("emits reservation:updated (D6)", async () => {
      arrangeNoShow();
      await send(noShow());
      expect(eventTypes()).toEqual(["reservation:updated"]);
    });
  });

  // ─── Staff update (D7, D8) ─────────────────────────────────────────────────

  describe("staff-updated", () => {
    const patch = (payload: Record<string, unknown>) => ({
      method: "PATCH" as const,
      url: `${API_V1}/reservations/${RES_ID}`,
      headers: staffAuth,
      payload,
    });
    const newTime = { date: at(96).slice(0, 10), startTime: at(96), endTime: at(98) };

    function arrangeUpdate(after: Partial<Reservation>) {
      vi.mocked(reservationService.getById).mockResolvedValue(makeReservation());
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValue({
        success: true,
        reservation: makeReservation(after),
      } as never);
    }

    it("COMPLETED sends the post-visit thank-you when the venue enables it", async () => {
      arrangeUpdate({ status: "COMPLETED" });
      const response = await send(patch({ status: "COMPLETED" }));
      expect(response.statusCode).toBe(200);
      expect(rec.effects.messages).toEqual([
        { kind: "post-visit-thank-you", guestEmail: GUEST_EMAIL },
      ]);
      expect(rec.effects.jobs).toEqual([]);
      expect(rec.effects.depositOps).toEqual([]);
    });

    it("COMPLETED sends nothing when the venue's post-visit flag is off", async () => {
      vi.mocked(venueService.getById).mockResolvedValue({
        ...VENUE,
        settings: { postVisitEmailEnabled: false },
      } as never);
      arrangeUpdate({ status: "COMPLETED" });
      await send(patch({ status: "COMPLETED" }));
      expect(rec.effects.messages).toEqual([]);
    });

    it.fails("COMPLETED emits reservation:updated (D7)", async () => {
      arrangeUpdate({ status: "COMPLETED" });
      await send(patch({ status: "COMPLETED" }));
      expect(eventTypes()).toEqual(["reservation:updated"]);
    });

    it.fails(
      "time change on a publicly booked reservation replaces its reminders at the new time (D8)",
      async () => {
        rec.seedReminders(RES_ID, "venue-1");
        arrangeUpdate(newTime);
        await send(patch(newTime));
        expect(Object.fromEntries(rec.scheduledJobs)).toEqual({
          [`booking-reminder:${RES_ID}`]: expect.objectContaining({ delayMs: (96 - 24) * HOUR }),
          [`day-of-reminder:${RES_ID}`]: expect.objectContaining({ delayMs: (96 - 2) * HOUR }),
        });
      }
    );

    it("time change on a staff-created reservation (no reminders) creates none", async () => {
      arrangeUpdate(newTime);
      await send(patch(newTime));
      expect(scheduled()).toEqual([]);
      expect(rec.scheduledJobs.size).toBe(0);
    });

    it("time change sends the guest no message", async () => {
      rec.seedReminders(RES_ID, "venue-1");
      arrangeUpdate(newTime);
      await send(patch(newTime));
      expect(rec.effects.messages).toEqual([]);
      expect(rec.effects.depositOps).toEqual([]);
    });

    it.fails("time change emits reservation:updated (D8)", async () => {
      arrangeUpdate(newTime);
      await send(patch(newTime));
      expect(eventTypes()).toEqual(["reservation:updated"]);
    });

    it.fails("any other field change emits reservation:updated", async () => {
      arrangeUpdate({ notes: "window seat" });
      await send(patch({ notes: "window seat" }));
      expect(eventTypes()).toEqual(["reservation:updated"]);
    });

    it.fails("status and time changed together emit exactly one reservation:updated", async () => {
      arrangeUpdate({ status: "COMPLETED", ...newTime });
      await send(patch({ status: "COMPLETED", ...newTime }));
      expect(eventTypes()).toEqual(["reservation:updated"]);
    });
  });

  // ─── Guest modify ──────────────────────────────────────────────────────────

  describe("guest-modified", () => {
    const modify = (payload: Record<string, unknown>) => ({
      method: "PATCH" as const,
      url: "/public/v1/reservations/manage",
      headers: manageAuth(),
      payload,
    });
    const newTime = { date: at(96).slice(0, 10), startTime: at(96), endTime: at(98) };

    function arrangeModify(after: Partial<Reservation>) {
      vi.mocked(reservationService.getById).mockResolvedValue(makeReservation());
      vi.mocked(reservationService.updateWithConflictCheck).mockResolvedValue({
        success: true,
        reservation: makeReservation(after),
      } as never);
      rec.seedReminders(RES_ID, "venue-1");
    }

    it("time change sends confirmation AND modified emails (today's quirk) and reschedules reminders", async () => {
      arrangeModify(newTime);
      const response = await send(modify(newTime));
      expect(response.statusCode).toBe(200);
      expect(kinds()).toEqual(["booking-confirmation", "booking-modified"]);
      expect(rec.effects.jobs).toEqual([
        { op: "cancel", jobId: `booking-reminder:${RES_ID}` },
        { op: "cancel", jobId: `day-of-reminder:${RES_ID}` },
        {
          op: "schedule",
          jobType: "booking-reminder",
          jobId: `booking-reminder:${RES_ID}`,
          delayMs: (96 - 24) * HOUR,
        },
        {
          op: "schedule",
          jobType: "day-of-reminder",
          jobId: `day-of-reminder:${RES_ID}`,
          delayMs: (96 - 2) * HOUR,
        },
      ]);
      expect(rec.effects.depositOps).toEqual([]);
    });

    it("a non-time change sends only the modified email and touches no job", async () => {
      arrangeModify({ notes: "high chair" });
      await send(modify({ specialRequests: "high chair" }));
      expect(kinds()).toEqual(["booking-modified"]);
      expect(rec.effects.jobs).toEqual([]);
    });

    it.fails("emits reservation:updated", async () => {
      arrangeModify(newTime);
      await send(modify(newTime));
      expect(eventTypes()).toEqual(["reservation:updated"]);
    });
  });

  // ─── Hold confirm (D4, D5) ─────────────────────────────────────────────────

  describe("hold-confirmed", () => {
    const doors = {
      "public-booking": () => ({
        method: "POST" as const,
        url: "/public/v1/venues/the-oak-table/reservations",
        headers: { "x-session-id": "session-abc" },
        payload: { holdId: "hold-1", guestName: "John Doe", guestEmail: GUEST_EMAIL },
      }),
      "staff-hold": () => ({
        method: "POST" as const,
        url: `${API_V1}/holds/hold-1/confirm`,
        headers: { ...staffAuth, "x-session-id": "session-abc" },
        payload: { guestName: "John Doe", guestEmail: GUEST_EMAIL },
      }),
      "public-hold": () => ({
        method: "POST" as const,
        url: "/public/v1/venues/the-oak-table/holds/hold-1/confirm",
        headers: { "x-session-id": "session-abc" },
        payload: { guestName: "John Doe", guestEmail: GUEST_EMAIL },
      }),
    };

    function arrangeConfirm(overrides: Partial<Reservation> = {}) {
      vi.mocked(resolveGuestLink).mockResolvedValue({ ok: true, guestId: null } as never);
      vi.mocked(confirmHold).mockResolvedValue({
        success: true,
        reservation: makeReservation(overrides),
      });
    }

    it("public-booking sends the confirmation email and schedules both reminders", async () => {
      arrangeConfirm();
      const response = await send(doors["public-booking"]());
      expect(response.statusCode).toBe(201);
      expect(rec.effects.messages).toEqual([
        { kind: "booking-confirmation", reservationId: RES_ID, guestEmail: GUEST_EMAIL },
      ]);
      expect(rec.effects.jobs).toEqual([
        {
          op: "schedule",
          jobType: "booking-reminder",
          jobId: `booking-reminder:${RES_ID}`,
          delayMs: (72 - 24) * HOUR,
        },
        {
          op: "schedule",
          jobType: "day-of-reminder",
          jobId: `day-of-reminder:${RES_ID}`,
          delayMs: (72 - 2) * HOUR,
        },
      ]);
    });

    it("public-booking starting within 24h schedules only the day-of reminder", async () => {
      arrangeConfirm({ startTime: at(5), endTime: at(7) });
      await send(doors["public-booking"]());
      expect(rec.effects.jobs).toEqual([
        {
          op: "schedule",
          jobType: "day-of-reminder",
          jobId: `day-of-reminder:${RES_ID}`,
          delayMs: 3 * HOUR,
        },
      ]);
    });

    it("public-booking whose start has passed schedules no reminder", async () => {
      arrangeConfirm({ startTime: at(-1), endTime: at(1) });
      await send(doors["public-booking"]());
      expect(kinds()).toEqual(["booking-confirmation"]);
      expect(rec.effects.jobs).toEqual([]);
    });

    it.each(["staff-hold", "public-hold"] as const)(
      "%s sends no message and schedules no job (D4 kept)",
      async (door) => {
        arrangeConfirm();
        const response = await send(doors[door]());
        expect(response.statusCode).toBe(201);
        expect(rec.effects.messages).toEqual([]);
        expect(rec.effects.jobs).toEqual([]);
        expect(rec.effects.depositOps).toEqual([]);
      }
    );

    it.fails("public-booking delivers hold:confirmed to live subscribers (D5)", async () => {
      arrangeConfirm();
      await send(doors["public-booking"]());
      expect(eventTypes()).toEqual(["hold:confirmed"]);
    });

    it.fails("staff-hold delivers hold:confirmed to live subscribers (D5)", async () => {
      arrangeConfirm();
      await send(doors["staff-hold"]());
      expect(eventTypes()).toEqual(["hold:confirmed"]);
    });

    it.fails("public-hold delivers hold:confirmed to live subscribers (D5)", async () => {
      arrangeConfirm();
      await send(doors["public-hold"]());
      expect(eventTypes()).toEqual(["hold:confirmed"]);
    });
  });

  // ─── Create (D2, D3) ───────────────────────────────────────────────────────

  describe("created", () => {
    it("walk-in emits reservation:created + table:updated and messages no one (D3)", async () => {
      vi.mocked(reservationService.createWalkIn).mockResolvedValue({
        success: true,
        reservation: makeReservation(),
        table: { ...createMockTable({ id: "table-1" }), venueId: "venue-1" },
      } as never);
      const response = await send({
        method: "POST",
        url: `${API_V1}/reservations/walk-in`,
        headers: staffAuth,
        payload: { venueId: "venue-1", tableId: "table-1", partySize: 2 },
      });
      expect(response.statusCode).toBe(201);
      expect(rec.effects.events).toEqual([
        { type: "reservation:created", id: RES_ID },
        { type: "table:updated", id: "table-1" },
      ]);
      expect(rec.effects.messages).toEqual([]);
      expect(rec.effects.jobs).toEqual([]);
    });

    const staffCreate = () => ({
      method: "POST" as const,
      url: `${API_V1}/reservations`,
      headers: staffAuth,
      payload: {
        venueId: "venue-1",
        tableId: "table-1",
        date: at(72).slice(0, 10),
        startTime: at(72),
        endTime: at(74),
        partySize: 2,
        guestName: "John Doe",
        guestEmail: GUEST_EMAIL,
      },
    });

    function arrangeStaffCreate() {
      vi.mocked(linkOrCreateGuest).mockResolvedValue({ ok: true, guestId: null } as never);
      vi.mocked(reservationService.createWithConflictCheck).mockResolvedValue({
        success: true,
        reservation: makeReservation(),
      } as never);
    }

    it("staff create sends no message and schedules no job (D2 kept)", async () => {
      arrangeStaffCreate();
      const response = await send(staffCreate());
      expect(response.statusCode).toBe(201);
      expect(rec.effects.messages).toEqual([]);
      expect(rec.effects.jobs).toEqual([]);
    });

    it.fails("staff create emits reservation:created", async () => {
      arrangeStaffCreate();
      await send(staffCreate());
      expect(eventTypes()).toEqual(["reservation:created"]);
    });
  });

  // ─── Confirm attendance ────────────────────────────────────────────────────

  describe("attendance-confirmed", () => {
    const confirm = () => ({
      method: "PATCH" as const,
      url: "/public/v1/reservations/confirm",
      headers: manageAuth(),
    });

    it.fails("PENDING → CONFIRMED emits reservation:updated", async () => {
      vi.mocked(reservationService.getById).mockResolvedValue(
        makeReservation({ status: "PENDING" })
      );
      vi.mocked(reservationService.update).mockResolvedValue(makeReservation());
      await send(confirm());
      expect(eventTypes()).toEqual(["reservation:updated"]);
    });

    it("an already-CONFIRMED reservation emits nothing and sends nothing", async () => {
      vi.mocked(reservationService.getById).mockResolvedValue(makeReservation());
      const response = await send(confirm());
      expect(response.statusCode).toBe(200);
      expect(reservationService.update).not.toHaveBeenCalled();
      expect(rec.effects.events).toEqual([]);
      expect(rec.effects.messages).toEqual([]);
    });
  });

  // ─── Non-transition emit sites (D9) ────────────────────────────────────────

  describe("non-transition live events", () => {
    it.fails(
      "cloning a floor plan delivers floor-plan:created to live subscribers (D9)",
      async () => {
        const source = {
          id: "fp-1",
          venueId: "venue-1",
          name: "Main",
          isActive: true,
          layoutJson: null,
          createdAt: NOW,
          updatedAt: NOW,
          tables: [],
        };
        const clone = { ...source, id: "fp-2", name: "Copy of Main", isActive: false };
        h.prisma.floorPlan.findUnique.mockResolvedValue(source);
        h.prisma.floorPlan.findMany.mockResolvedValue([]);
        h.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
          fn({
            $executeRaw: vi.fn().mockResolvedValue(0),
            floorPlan: {
              create: vi.fn().mockResolvedValue({ id: "fp-2" }),
              findUnique: vi.fn().mockResolvedValue(clone),
            },
            table: { createMany: vi.fn() },
          })
        );
        const response = await send({
          method: "POST",
          url: `${API_V1}/floor-plans/fp-1/clone`,
          headers: staffAuth,
        });
        expect(response.statusCode).toBe(201);
        expect(rec.effects.events).toEqual([{ type: "floor-plan:created", id: "fp-2" }]);
      }
    );

    it.fails(
      "the on-demand lapsing scan delivers guest:lapsing to live subscribers (D9)",
      async () => {
        const visit = (daysAgo: number) => ({
          startTime: new Date(NOW.getTime() - daysAgo * 24 * HOUR),
        });
        h.prisma.guest.findMany.mockResolvedValue([
          {
            id: "guest-1",
            name: "Regular Rita",
            email: "rita@example.com",
            phone: null,
            communicationPreference: "all",
            reservations: [visit(130), visit(120), visit(110), visit(100)],
          },
        ]);
        const response = await send({
          method: "GET",
          url: `${API_V1}/guests/lapsing?venueId=venue-1`,
          headers: staffAuth,
        });
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).data).toHaveLength(1);
        expect(eventTypes()).toEqual(["guest:lapsing"]);
      }
    );
  });
});
