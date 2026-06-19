import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationDispatcher } from "./notification-dispatcher.js";
import type { BookingNotificationInput } from "./port.js";

const SMS_MANAGE_BASE_URL = "https://app.mbe.dev/reservations/manage";

const mockEmailAdapter = {
  sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendBookingReminder: vi.fn().mockResolvedValue(undefined),
  sendBookingModified: vi.fn().mockResolvedValue(undefined),
  sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
};

const mockSmsAdapter = {
  sendBookingReminder: vi.fn().mockResolvedValue(undefined),
  sendWaitlistUpdate: vi.fn().mockResolvedValue(undefined),
  sendWinbackMessage: vi.fn().mockResolvedValue(undefined),
};

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

  it("sendBookingConfirmation always sends (transactional) regardless of SMS preference", async () => {
    const dispatcher = new NotificationDispatcher({
      emailAdapter: mockEmailAdapter,
      smsAdapter: mockSmsAdapter,
      smsManageBaseUrl: SMS_MANAGE_BASE_URL,
    });

    await dispatcher.sendBookingConfirmation(emailInput, "sms_only");

    // Confirmation is transactional — always emails even when sms_only
    expect(mockEmailAdapter.sendBookingConfirmation).toHaveBeenCalledOnce();
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
      partySize: 4,
      guestName: "Jane Doe",
      guestPhone: "+15551234567",
      venueName: "The Oak Table",
      manageToken: "tok_abc123",
      manageBaseUrl: SMS_MANAGE_BASE_URL,
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
