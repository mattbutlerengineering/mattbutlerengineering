import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationDispatcher, PartialDeliveryError } from "./notification-dispatcher.js";
import type { BookingNotificationInput, NotificationPort } from "./port.js";
import type { SmsPort } from "./sms-port.js";

const SMS_MANAGE_BASE_URL = "https://app.mbe.dev";

const mockEmailAdapter = {
  sendClosureNotice: vi.fn().mockResolvedValue(undefined),
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendBookingReminder: vi.fn().mockResolvedValue(undefined),
  sendBookingModified: vi.fn().mockResolvedValue(undefined),
  sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
  sendWinBack: vi.fn().mockResolvedValue(undefined),
  sendThankYouEmail: vi.fn().mockResolvedValue(undefined),
} satisfies NotificationPort;

const mockSmsAdapter = {
  sendClosureNotice: vi.fn().mockResolvedValue(undefined),
  sendBookingReminder: vi.fn().mockResolvedValue(undefined),
  sendWaitlistUpdate: vi.fn().mockResolvedValue(undefined),
  sendWinbackMessage: vi.fn().mockResolvedValue(undefined),
  sendWaitlistAdded: vi.fn().mockResolvedValue(undefined),
  sendWaitlistPositionUpdate: vi.fn().mockResolvedValue(undefined),
  sendWaitlistTableReady: vi.fn().mockResolvedValue(undefined),
} satisfies SmsPort;

const emailInput: BookingNotificationInput = {
  reservationId: "res_abc123",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+15551234567",
  specialRequests: null,
  venueName: "The Oak Table",
  venueTimezone: "America/Los_Angeles",
  venueAddress: "123 Main St",
  manageToken: "tok_abc123",
};

describe("NotificationDispatcher", () => {
  beforeEach(() => {
    Object.values(mockEmailAdapter).forEach((fn) => fn.mockClear());
    Object.values(mockSmsAdapter).forEach((fn) => fn.mockClear());
  });

  it("sends both email and SMS when preference is 'both'", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: mockSmsAdapter,
      smsManageBaseUrl: SMS_MANAGE_BASE_URL,
    });

    await dispatcher.sendBookingReminder(emailInput, "both");

    expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
    expect(mockSmsAdapter.sendBookingReminder).toHaveBeenCalledOnce();
  });

  it("sends only email when preference is 'email_only'", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: mockSmsAdapter,
      smsManageBaseUrl: SMS_MANAGE_BASE_URL,
    });

    await dispatcher.sendBookingReminder(emailInput, "email_only");

    expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
    expect(mockSmsAdapter.sendBookingReminder).not.toHaveBeenCalled();
  });

  it("sends only SMS when preference is 'sms_only'", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: mockSmsAdapter,
      smsManageBaseUrl: SMS_MANAGE_BASE_URL,
    });

    await dispatcher.sendBookingReminder(emailInput, "sms_only");

    expect(mockEmailAdapter.sendBookingReminder).not.toHaveBeenCalled();
    expect(mockSmsAdapter.sendBookingReminder).toHaveBeenCalledOnce();
  });

  it("sends only transactional (email) when preference is 'transactional_only'", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: mockSmsAdapter,
      smsManageBaseUrl: SMS_MANAGE_BASE_URL,
    });

    // sendBookingReminder is transactional — always sends
    await dispatcher.sendBookingReminder(emailInput, "transactional_only");

    expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
    expect(mockSmsAdapter.sendBookingReminder).not.toHaveBeenCalled();
  });

  it("sendBookingConfirmation always emails — iCal invariant, no channel routing", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: mockSmsAdapter,
      smsManageBaseUrl: SMS_MANAGE_BASE_URL,
    });

    // Confirmations carry the iCal attachment, which cannot travel via SMS, so
    // the dispatcher takes no channel — it always delivers via email.
    await dispatcher.sendBookingConfirmation(emailInput);

    expect(mockEmailAdapter.sendBookingConfirmation).toHaveBeenCalledOnce();
    expect(mockEmailAdapter.sendBookingConfirmation).toHaveBeenCalledWith(emailInput);
  });

  it("works without SMS adapter (email-only setup)", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: null,
    });

    await dispatcher.sendBookingReminder(emailInput, "both");

    expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
  });

  it("derives SmsNotificationInput from BookingNotificationInput when sending SMS reminder", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: mockSmsAdapter,
      smsManageBaseUrl: SMS_MANAGE_BASE_URL,
    });

    await dispatcher.sendBookingReminder(emailInput, "sms_only");

    expect(mockSmsAdapter.sendBookingReminder).toHaveBeenCalledWith({
      reservationId: "res_abc123",
      date: "2026-06-15",
      startTime: "19:00",
      venueTimezone: "America/Los_Angeles",
      partySize: 4,
      guestName: "Jane Doe",
      guestPhone: "+15551234567",
      venueName: "The Oak Table",
      manageToken: "tok_abc123",
      manageBaseUrl: SMS_MANAGE_BASE_URL,
    });
  });

  describe("sendBookingReminder — sms_only fallback", () => {
    it("sends email when preference is 'sms_only' and smsAdapter is null (no SMS available)", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: null,
      });

      await dispatcher.sendBookingReminder(emailInput, "sms_only");

      expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
      expect(mockSmsAdapter.sendBookingReminder).not.toHaveBeenCalled();
    });

    it("sends SMS only (no email) when preference is 'sms_only' and smsAdapter is non-null", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
        smsManageBaseUrl: SMS_MANAGE_BASE_URL,
      });

      await dispatcher.sendBookingReminder(emailInput, "sms_only");

      expect(mockSmsAdapter.sendBookingReminder).toHaveBeenCalledOnce();
      expect(mockEmailAdapter.sendBookingReminder).not.toHaveBeenCalled();
    });
  });

  describe("sendBookingReminder — channel failures and missing phone", () => {
    it("rethrows PartialDeliveryError naming delivered channels when SMS fails after email delivered; retry sends only SMS", async () => {
      mockSmsAdapter.sendBookingReminder.mockRejectedValueOnce(new Error("twilio down"));
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
        smsManageBaseUrl: SMS_MANAGE_BASE_URL,
      });

      const err = await dispatcher.sendBookingReminder(emailInput, "both").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PartialDeliveryError);
      expect((err as PartialDeliveryError).deliveredChannels).toEqual(["email"]);

      await dispatcher.sendBookingReminder(emailInput, "both", { skipChannels: ["email"] });

      expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
      expect(mockSmsAdapter.sendBookingReminder).toHaveBeenCalledTimes(2);
    });

    it("rethrows when no channel was delivered so the job retries", async () => {
      mockEmailAdapter.sendBookingReminder.mockRejectedValueOnce(new Error("resend down"));
      mockSmsAdapter.sendBookingReminder.mockRejectedValueOnce(new Error("twilio down"));
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
        smsManageBaseUrl: SMS_MANAGE_BASE_URL,
      });

      await expect(dispatcher.sendBookingReminder(emailInput, "both")).rejects.toThrow();
    });

    it("sends one email and no SMS attempt for 'both' guest without a phone", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
        smsManageBaseUrl: SMS_MANAGE_BASE_URL,
      });

      await dispatcher.sendBookingReminder({ ...emailInput, guestPhone: null }, "both");

      expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
      expect(mockSmsAdapter.sendBookingReminder).not.toHaveBeenCalled();
    });

    it("falls back to email for 'sms_only' guest without a phone", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
        smsManageBaseUrl: SMS_MANAGE_BASE_URL,
      });

      await dispatcher.sendBookingReminder({ ...emailInput, guestPhone: "  " }, "sms_only");

      expect(mockEmailAdapter.sendBookingReminder).toHaveBeenCalledOnce();
      expect(mockSmsAdapter.sendBookingReminder).not.toHaveBeenCalled();
    });
  });

  describe("sendBookingModified", () => {
    it("sends email when preference is email_only", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingModified(emailInput, "email_only");

      expect(mockEmailAdapter.sendBookingModified).toHaveBeenCalledOnce();
    });

    it("sends email when preference is sms_only (modified is transactional — email fallback)", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingModified(emailInput, "sms_only");

      expect(mockEmailAdapter.sendBookingModified).toHaveBeenCalledOnce();
    });

    it("sends email when preference is both", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingModified(emailInput, "both");

      expect(mockEmailAdapter.sendBookingModified).toHaveBeenCalledOnce();
    });

    it("sends email when preference is transactional_only", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingModified(emailInput, "transactional_only");

      expect(mockEmailAdapter.sendBookingModified).toHaveBeenCalledOnce();
    });
  });

  describe("sendBookingCancelled", () => {
    it("sends email when preference is email_only", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingCancelled(emailInput, "email_only");

      expect(mockEmailAdapter.sendBookingCancelled).toHaveBeenCalledOnce();
    });

    it("sends email when preference is sms_only (cancelled is transactional — email fallback)", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingCancelled(emailInput, "sms_only");

      expect(mockEmailAdapter.sendBookingCancelled).toHaveBeenCalledOnce();
    });

    it("sends email when preference is both", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingCancelled(emailInput, "both");

      expect(mockEmailAdapter.sendBookingCancelled).toHaveBeenCalledOnce();
    });

    it("sends email when preference is transactional_only", async () => {
      const dispatcher = new NotificationDispatcher({
        emailAdapter: mockEmailAdapter,
        smsAdapter: mockSmsAdapter,
      });

      await dispatcher.sendBookingCancelled(emailInput, "transactional_only");

      expect(mockEmailAdapter.sendBookingCancelled).toHaveBeenCalledOnce();
    });
  });
});
