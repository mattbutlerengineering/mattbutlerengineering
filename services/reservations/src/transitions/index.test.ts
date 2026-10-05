import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Reservation } from "@mbe/types";

vi.mock("../services/reservation-cancellation.js", () => ({
  cancelReservationWithDeposit: vi.fn(),
}));
vi.mock("../services/reservation-no-show.js", () => ({ recordNoShow: vi.fn() }));
vi.mock("../services/confirm-hold.js", () => ({ confirmHold: vi.fn() }));

import { cancelReservationWithDeposit } from "../services/reservation-cancellation.js";
import { recordNoShow } from "../services/reservation-no-show.js";
import { ReservationTransitionError } from "../services/reservation-state-machine.js";
import { createReservationTransitions } from "./index.js";
import { createInMemoryEvents, createInMemoryJobs, createInMemoryMessaging } from "./in-memory.js";
import type { VenueEffectPolicySource } from "./venue-policy.js";
import type { DepositService } from "../services/deposit.js";

const NOW = new Date("2030-06-01T12:00:00.000Z");
const reservation = {
  id: "res-1",
  venueId: "venue-1",
  status: "CONFIRMED",
  startTime: "2030-06-04T12:00:00.000Z",
  guestEmail: "john@example.com",
} as Reservation;
const cancelled = { ...reservation, status: "CANCELLED" } as Reservation;
const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never;
/** The one injected DepositService — the verbs hand it to the money writes. */
const deposits = { marker: "injected-deposit-service" } as unknown as DepositService;

function setup(policy: VenueEffectPolicySource = async () => ({ outbound: "live" })) {
  const messaging = createInMemoryMessaging();
  const jobs = createInMemoryJobs();
  const events = createInMemoryEvents();
  const logger = { error: vi.fn() };
  const reservationService = {
    update: vi.fn(),
    updateWithConflictCheck: vi.fn(),
    createWalkIn: vi.fn(),
    createWithConflictCheck: vi.fn(),
  };
  const transitions = createReservationTransitions({
    ports: { messaging, jobs, events },
    policy,
    reservationService,
    deposits,
    logger,
    now: () => NOW,
  });
  return { transitions, messaging, jobs, events, logger, reservationService };
}

const cancelOptions = {
  door: "staff-delete" as const,
  initiator: "staff" as const,
  manageToken: "tok",
  log,
};

describe("reservation transitions — verbs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("cancel: calls the domain write unchanged and returns its result", async () => {
    const { transitions } = setup();
    vi.mocked(cancelReservationWithDeposit).mockResolvedValue({
      success: true,
      reservation: cancelled,
    });
    const result = await transitions.cancel(reservation, {
      ...cancelOptions,
      reason: "r",
      note: "n",
    });
    expect(result).toEqual({ success: true, reservation: cancelled });
    expect(cancelReservationWithDeposit).toHaveBeenCalledWith(
      reservation,
      "tok",
      { logger: log, deposits },
      { initiator: "staff", cancellationReason: "r", cancellationNote: "n" }
    );
  });

  it("noShow: hands the injected DepositService to the money write", async () => {
    const { transitions } = setup();
    vi.mocked(recordNoShow).mockResolvedValue({
      success: false,
      status: 409,
      detail: "x",
    } as never);
    await transitions.noShow(reservation, log);
    expect(recordNoShow).toHaveBeenCalledWith(reservation, log, deposits);
  });

  it("cancel: a committed cancel sets off its planned effects", async () => {
    const { transitions, messaging, events } = setup();
    vi.mocked(cancelReservationWithDeposit).mockResolvedValue({
      success: true,
      reservation: cancelled,
    });
    await transitions.cancel(reservation, cancelOptions);
    expect(messaging.sent.map((m) => m.kind)).toEqual(["booking-cancelled"]);
    expect(events.published.map((e) => e.type)).toEqual(["reservation:cancelled"]);
  });

  it("a domain failure runs no effects", async () => {
    const { transitions, messaging, events, jobs } = setup();
    const failure = { success: false as const, status: 500, title: "x", detail: "y" };
    vi.mocked(cancelReservationWithDeposit).mockResolvedValue(failure);
    expect(await transitions.cancel(reservation, cancelOptions)).toBe(failure);
    expect(messaging.sent).toEqual([]);
    expect(events.published).toEqual([]);
    expect(jobs.jobs.size).toBe(0);
  });

  it("a ReservationTransitionError propagates unchanged", async () => {
    const { transitions } = setup();
    const err = new ReservationTransitionError("NO_SHOW", "NO_SHOW", [], "reservation");
    vi.mocked(recordNoShow).mockRejectedValue(err);
    await expect(transitions.noShow(reservation, log)).rejects.toBe(err);
  });

  it("a rejecting policy source runs no effects, logs, and never undoes the write", async () => {
    const { transitions, messaging, events, logger } = setup(async () => {
      throw new Error("policy down");
    });
    vi.mocked(cancelReservationWithDeposit).mockResolvedValue({
      success: true,
      reservation: cancelled,
    });
    const result = await transitions.cancel(reservation, cancelOptions);
    expect(result.success).toBe(true);
    expect(messaging.sent).toEqual([]);
    expect(events.published).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", fact: "cancelled" }),
      "Venue effect policy lookup failed"
    );
  });

  it("a suppressed venue keeps live events but sends no message and touches no job", async () => {
    const policy = vi.fn<VenueEffectPolicySource>(async () => ({ outbound: "suppressed" }));
    const { transitions, messaging, events, jobs } = setup(policy);
    await jobs.schedule(
      "booking-reminder",
      { reservationId: "res-1", venueId: "venue-1" },
      1,
      "booking-reminder:res-1"
    );
    vi.mocked(cancelReservationWithDeposit).mockResolvedValue({
      success: true,
      reservation: cancelled,
    });
    await transitions.cancel(reservation, cancelOptions);
    expect(policy).toHaveBeenCalledWith("venue-1");
    expect(messaging.sent).toEqual([]);
    expect(jobs.jobs.size).toBe(1);
    expect(events.published.map((e) => e.type)).toEqual(["reservation:cancelled"]);
  });

  it("confirmAttendance is a no-op unless the reservation is PENDING", async () => {
    const { transitions, reservationService, events } = setup();
    await transitions.confirmAttendance(reservation);
    expect(reservationService.update).not.toHaveBeenCalled();

    reservationService.update.mockResolvedValue(reservation);
    await transitions.confirmAttendance({ ...reservation, status: "PENDING" } as Reservation);
    expect(reservationService.update).toHaveBeenCalledWith("res-1", { status: "CONFIRMED" });
    expect(events.published.map((e) => e.type)).toEqual(["reservation:updated"]);
  });

  it("updateByStaff passes the patch through and plans from before/after", async () => {
    const { transitions, reservationService, events } = setup();
    reservationService.updateWithConflictCheck.mockResolvedValue({ success: false, error: "nope" });
    await transitions.updateByStaff(reservation, { notes: "x" });
    expect(reservationService.updateWithConflictCheck).toHaveBeenCalledWith("res-1", {
      notes: "x",
    });
    expect(events.published).toEqual([]);
  });
});
