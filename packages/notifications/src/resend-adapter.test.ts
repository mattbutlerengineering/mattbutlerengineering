import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResendNotificationAdapter } from "./resend-adapter.js";
import type { BookingNotificationInput } from "./port.js";

const mockSend = vi.fn().mockResolvedValue({ id: "email_123" });
const mockResend = { emails: { send: mockSend } };

const defaultInput: BookingNotificationInput = {
  reservationId: "res_abc123",
  date: "2026-06-15",
  startTime: "19:00",
  endTime: "21:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: "+1555123456",
  specialRequests: "Window seat please",
  venueName: "The Oak Table",
  venueTimezone: "America/Los_Angeles",
  venueAddress: "123 Main St, Portland OR",
  manageToken: "tok_abc123",
};

describe("ResendNotificationAdapter", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  it("sendBookingConfirmation sends email to guest with iCal attachment", async () => {
    const adapter = new ResendNotificationAdapter({
      resend: mockResend as never,
      fromAddress: "bookings@mbe.dev",
      manageBaseUrl: "https://app.mbe.dev/reservations/manage",
    });

    await adapter.sendBookingConfirmation(defaultInput);

    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.from).toBe("bookings@mbe.dev");
    expect(call.to).toBe("jane@example.com");
    expect(call.subject).toContain("The Oak Table");
    expect(call.attachments).toHaveLength(1);
    expect(call.attachments[0].contentType).toBe("text/calendar; method=REQUEST");
    expect(call.attachments[0].content).toContain("BEGIN:VCALENDAR");
    expect(call.attachments[0].content).toContain("METHOD:REQUEST");
  });

  it("sendBookingCancelled sends email with METHOD:CANCEL iCal", async () => {
    const adapter = new ResendNotificationAdapter({
      resend: mockResend as never,
      fromAddress: "bookings@mbe.dev",
      manageBaseUrl: "https://app.mbe.dev/reservations/manage",
    });

    await adapter.sendBookingCancelled(defaultInput);

    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe("jane@example.com");
    expect(call.subject).toContain("Cancelled");
    expect(call.attachments[0].content).toContain("METHOD:CANCEL");
  });

  it("no-ops gracefully when resend is null (missing API key)", async () => {
    const adapter = new ResendNotificationAdapter({
      resend: null,
      fromAddress: "bookings@mbe.dev",
      manageBaseUrl: "https://app.mbe.dev/reservations/manage",
    });

    await expect(adapter.sendBookingConfirmation(defaultInput)).resolves.toBeUndefined();

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sendBookingModified increments sequence in iCal", async () => {
    const adapter = new ResendNotificationAdapter({
      resend: mockResend as never,
      fromAddress: "bookings@mbe.dev",
      manageBaseUrl: "https://app.mbe.dev/reservations/manage",
    });

    await adapter.sendBookingModified({ ...defaultInput, sequence: 2 });

    const call = mockSend.mock.calls[0][0];
    expect(call.attachments[0].content).toContain("SEQUENCE:2");
    expect(call.subject).toContain("Updated");
  });

  it("sendBookingReminder sends reminder email without iCal attachment", async () => {
    const adapter = new ResendNotificationAdapter({
      resend: mockResend as never,
      fromAddress: "bookings@mbe.dev",
      manageBaseUrl: "https://app.mbe.dev/reservations/manage",
    });

    await adapter.sendBookingReminder(defaultInput);

    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe("jane@example.com");
    expect(call.subject).toContain("Reminder");
    expect(call.attachments).toBeUndefined();
  });
});
