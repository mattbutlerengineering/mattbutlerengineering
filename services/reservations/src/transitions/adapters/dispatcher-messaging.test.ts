import { describe, it, expect, vi } from "vitest";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { Reservation, Venue } from "@mbe/types";
import { createDispatcherMessaging } from "./dispatcher-messaging.js";

const venue = {
  id: "venue-1",
  name: "The Oak Table",
  ianaTimezone: "America/Los_Angeles",
  settings: { postVisitEmailEnabled: true, feedbackUrl: "https://example.com/fb" },
} as unknown as Venue;

function res(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    venueId: "venue-1",
    date: "2030-06-04",
    startTime: "2030-06-04T12:00:00.000Z",
    endTime: "2030-06-04T14:00:00.000Z",
    partySize: 2,
    guestName: "John Doe",
    guestEmail: "john@example.com",
    guestPhone: null,
    guestId: "guest-1",
    notes: "window seat",
    guest: { communicationPreference: "email_only", unsubscribed: false },
    ...overrides,
  } as unknown as Reservation;
}

/** The booking payload every booking-* email carried before the move. */
const bookingPayload = {
  reservationId: "res-1",
  date: "2030-06-04",
  startTime: "2030-06-04T12:00:00.000Z",
  endTime: "2030-06-04T14:00:00.000Z",
  partySize: 2,
  guestName: "John Doe",
  guestEmail: "john@example.com",
  guestPhone: null,
  specialRequests: "window seat",
  venueName: "The Oak Table",
  venueTimezone: "America/Los_Angeles",
  venueAddress: null,
  manageToken: "tok",
};

function setup(getVenue = vi.fn().mockResolvedValue(venue)) {
  const dispatcher = {
    sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
    sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
    sendBookingModified: vi.fn().mockResolvedValue(undefined),
  };
  const postVisitNotifier = { sendPostVisitEmail: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn() };
  const messaging = createDispatcherMessaging({
    dispatcher: dispatcher as unknown as NotificationDispatcher,
    postVisitNotifier,
    getVenue,
    logger,
  });
  return { messaging, dispatcher, postVisitNotifier, logger, getVenue };
}

describe("dispatcher messaging adapter (send halves moved verbatim)", () => {
  it("booking-confirmation: the confirmation payload, no channel preference", async () => {
    const { messaging, dispatcher } = setup();
    await messaging.send({ kind: "booking-confirmation", reservation: res(), manageToken: "tok" });
    expect(dispatcher.sendBookingConfirmation).toHaveBeenCalledWith(bookingPayload);
  });

  it.each([
    ["no guest email", { guestEmail: null }],
    ["no venue id", { venueId: null }],
  ])("booking-confirmation: skipped with %s", async (_label, overrides) => {
    const { messaging, dispatcher } = setup();
    await messaging.send({
      kind: "booking-confirmation",
      reservation: res(overrides as Partial<Reservation>),
      manageToken: "tok",
    });
    expect(dispatcher.sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("booking-confirmation: skipped when the venue is gone; a send failure rejects", async () => {
    const gone = setup(vi.fn().mockResolvedValue(null));
    await gone.messaging.send({
      kind: "booking-confirmation",
      reservation: res(),
      manageToken: "tok",
    });
    expect(gone.dispatcher.sendBookingConfirmation).not.toHaveBeenCalled();

    const failing = setup();
    failing.dispatcher.sendBookingConfirmation.mockRejectedValueOnce(new Error("resend down"));
    await expect(
      failing.messaging.send({
        kind: "booking-confirmation",
        reservation: res(),
        manageToken: "tok",
      })
    ).rejects.toThrow("resend down");
  });

  it("booking-cancelled: the booking payload plus the guest's channel preference", async () => {
    const { messaging, dispatcher } = setup();
    await messaging.send({
      kind: "booking-cancelled",
      reservation: res(),
      manageToken: "tok",
      initiator: "staff",
    });
    expect(dispatcher.sendBookingCancelled).toHaveBeenCalledWith(bookingPayload, "email_only");
  });

  it("booking-cancelled: a send failure is logged, not rethrown; a venue lookup failure rejects", async () => {
    const { messaging, dispatcher, logger } = setup();
    dispatcher.sendBookingCancelled.mockRejectedValueOnce(new Error("resend down"));
    await messaging.send({
      kind: "booking-cancelled",
      reservation: res(),
      manageToken: "tok",
      initiator: "guest",
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "res-1", initiator: "guest" }),
      "Failed to send booking cancelled notification"
    );

    const broken = setup(vi.fn().mockRejectedValue(new Error("db down")));
    await expect(
      broken.messaging.send({
        kind: "booking-cancelled",
        reservation: res(),
        manageToken: "tok",
        initiator: "guest",
      })
    ).rejects.toThrow("db down");
  });

  it("booking-cancelled: skipped without a guest email", async () => {
    const { messaging, dispatcher } = setup();
    await messaging.send({
      kind: "booking-cancelled",
      reservation: res({ guestEmail: null }),
      manageToken: "tok",
      initiator: "staff",
    });
    expect(dispatcher.sendBookingCancelled).not.toHaveBeenCalled();
  });

  it("booking-modified: the booking payload with sequence 2 and the channel preference", async () => {
    const { messaging, dispatcher } = setup();
    await messaging.send({ kind: "booking-modified", reservation: res(), manageToken: "tok" });
    expect(dispatcher.sendBookingModified).toHaveBeenCalledWith(
      { ...bookingPayload, sequence: 2 },
      "email_only"
    );
  });

  it("booking-modified: a send failure is logged, not rethrown", async () => {
    const { messaging, dispatcher, logger } = setup();
    dispatcher.sendBookingModified.mockRejectedValueOnce(new Error("resend down"));
    await messaging.send({ kind: "booking-modified", reservation: res(), manageToken: "tok" });
    expect(logger.error).toHaveBeenCalledWith({}, "Failed to send booking modified notification");
  });

  it("post-visit-thank-you: builds the notifier input from the reservation and venue settings", async () => {
    const { messaging, postVisitNotifier } = setup();
    await messaging.send({ kind: "post-visit-thank-you", reservation: res() });
    expect(postVisitNotifier.sendPostVisitEmail).toHaveBeenCalledWith({
      reservationId: "res-1",
      guestId: "guest-1",
      guestEmail: "john@example.com",
      guestFirstName: "John",
      unsubscribed: false,
      venueName: "The Oak Table",
      venuePostVisitEmailEnabled: true,
      visitDate: "2030-06-04",
      feedbackUrl: "https://example.com/fb",
    });
  });

  it("post-visit-thank-you: without a venue the flag reads false (the notifier then skips)", async () => {
    const { messaging, postVisitNotifier } = setup();
    await messaging.send({ kind: "post-visit-thank-you", reservation: res({ venueId: null }) });
    expect(postVisitNotifier.sendPostVisitEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        venueName: "",
        venuePostVisitEmailEnabled: false,
        feedbackUrl: null,
      })
    );
  });
});
