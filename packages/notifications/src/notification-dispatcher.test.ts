import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationDispatcher } from "./notification-dispatcher.js";
import type { NotificationPort, BookingNotificationInput } from "./port.js";

const makeInput = (): BookingNotificationInput => ({
  reservationId: "res_1",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+15550001111",
  specialRequests: null,
  venueName: "The Oak Table",
  venueTimezone: "America/Los_Angeles",
  venueAddress: null,
  manageToken: "token_abc",
});

function makePort(): NotificationPort {
  return {
    sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
    sendBookingReminder: vi.fn().mockResolvedValue(undefined),
    sendBookingModified: vi.fn().mockResolvedValue(undefined),
    sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
  };
}

describe("NotificationDispatcher", () => {
  let emailAdapter: NotificationPort;
  let smsAdapter: NotificationPort;

  beforeEach(() => {
    emailAdapter = makePort();
    smsAdapter = makePort();
  });

  describe("email_only", () => {
    it("sends via email adapter only", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
      await dispatcher.sendBookingConfirmation(makeInput(), "email_only");
      expect(emailAdapter.sendBookingConfirmation).toHaveBeenCalledOnce();
      expect(smsAdapter.sendBookingConfirmation).not.toHaveBeenCalled();
    });

    it("defaults to email_only when preference is undefined", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
      await dispatcher.sendBookingCancelled(makeInput());
      expect(emailAdapter.sendBookingCancelled).toHaveBeenCalledOnce();
      expect(smsAdapter.sendBookingCancelled).not.toHaveBeenCalled();
    });
  });

  describe("sms_only", () => {
    it("sends via sms adapter only, skips email", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
      await dispatcher.sendBookingConfirmation(makeInput(), "sms_only");
      expect(smsAdapter.sendBookingConfirmation).toHaveBeenCalledOnce();
      expect(emailAdapter.sendBookingConfirmation).not.toHaveBeenCalled();
    });

    it("skips sms when sms adapter is null", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: null });
      await dispatcher.sendBookingConfirmation(makeInput(), "sms_only");
      expect(emailAdapter.sendBookingConfirmation).not.toHaveBeenCalled();
    });
  });

  describe("both", () => {
    it("sends via both adapters", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
      await dispatcher.sendBookingModified(makeInput(), "both");
      expect(emailAdapter.sendBookingModified).toHaveBeenCalledOnce();
      expect(smsAdapter.sendBookingModified).toHaveBeenCalledOnce();
    });

    it("sends email only when sms adapter is null", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: null });
      await dispatcher.sendBookingModified(makeInput(), "both");
      expect(emailAdapter.sendBookingModified).toHaveBeenCalledOnce();
    });
  });

  describe("transactional_only", () => {
    it("sends via email adapter only", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
      await dispatcher.sendBookingReminder(makeInput(), "transactional_only");
      expect(emailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
      expect(smsAdapter.sendBookingReminder).not.toHaveBeenCalled();
    });
  });

  describe("all four methods route correctly", () => {
    it("sendBookingReminder routes to sms for sms_only", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
      await dispatcher.sendBookingReminder(makeInput(), "sms_only");
      expect(smsAdapter.sendBookingReminder).toHaveBeenCalledOnce();
      expect(emailAdapter.sendBookingReminder).not.toHaveBeenCalled();
    });

    it("sendBookingCancelled routes to both", async () => {
      const dispatcher = new NotificationDispatcher({ email: emailAdapter, sms: smsAdapter });
      await dispatcher.sendBookingCancelled(makeInput(), "both");
      expect(emailAdapter.sendBookingCancelled).toHaveBeenCalledOnce();
      expect(smsAdapter.sendBookingCancelled).toHaveBeenCalledOnce();
    });
  });
});
