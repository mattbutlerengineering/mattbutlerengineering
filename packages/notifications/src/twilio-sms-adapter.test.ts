import { describe, it, expect, vi, beforeEach } from "vitest";
import { TwilioSmsAdapter } from "./twilio-sms-adapter.js";
import type { SmsNotificationInput, WaitlistUpdateInput, WinbackMessageInput } from "./sms-port.js";

const mockCreate = vi.fn().mockResolvedValue({ sid: "SM123", status: "queued" });
const mockTwilioClient = {
  messages: {
    create: mockCreate,
  },
};

const defaultSmsInput: SmsNotificationInput = {
  reservationId: "res_abc123",
  date: "2026-06-15",
  startTime: "19:00",
  partySize: 4,
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
  venueName: "The Oak Table",
  manageToken: "tok_abc123",
  manageBaseUrl: "https://app.mbe.dev/reservations/manage",
};

const defaultWaitlistInput: WaitlistUpdateInput = {
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
  venueName: "The Oak Table",
  date: "2026-06-15",
  partySize: 2,
  manageToken: "tok_abc123",
  manageBaseUrl: "https://app.mbe.dev/reservations/manage",
};

const defaultWinbackInput: WinbackMessageInput = {
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
  venueName: "The Oak Table",
  manageBaseUrl: "https://app.mbe.dev/reservations/manage",
};

describe("TwilioSmsAdapter", () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({ sid: "SM123", status: "queued" });
  });

  it("sendBookingReminder sends SMS to guest phone", async () => {
    const adapter = new TwilioSmsAdapter({
      client: mockTwilioClient as never,
      fromNumber: "+15559876543",
    });

    await adapter.sendBookingReminder(defaultSmsInput);

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.to).toBe("+15551234567");
    expect(call.from).toBe("+15559876543");
    expect(call.body).toContain("The Oak Table");
    expect(call.body).toContain("19:00");
    expect(call.body).toContain("June 15");
    expect(call.body.length).toBeLessThanOrEqual(160);
  });

  it("sendBookingReminder includes manage link", async () => {
    const adapter = new TwilioSmsAdapter({
      client: mockTwilioClient as never,
      fromNumber: "+15559876543",
    });

    await adapter.sendBookingReminder(defaultSmsInput);

    const call = mockCreate.mock.calls[0][0];
    expect(call.body).toContain("https://app.mbe.dev/reservations/manage");
  });

  it("sendWaitlistUpdate sends SMS with waitlist info", async () => {
    const adapter = new TwilioSmsAdapter({
      client: mockTwilioClient as never,
      fromNumber: "+15559876543",
    });

    await adapter.sendWaitlistUpdate(defaultWaitlistInput);

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.to).toBe("+15551234567");
    expect(call.body).toContain("The Oak Table");
    expect(call.body).toContain("waitlist");
    expect(call.body.length).toBeLessThanOrEqual(160);
  });

  it("sendWinbackMessage sends win-back SMS", async () => {
    const adapter = new TwilioSmsAdapter({
      client: mockTwilioClient as never,
      fromNumber: "+15559876543",
    });

    await adapter.sendWinbackMessage(defaultWinbackInput);

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.to).toBe("+15551234567");
    expect(call.body).toContain("The Oak Table");
    expect(call.body.length).toBeLessThanOrEqual(160);
  });

  it("no-ops gracefully when client is null (missing Twilio config)", async () => {
    const adapter = new TwilioSmsAdapter({
      client: null,
      fromNumber: "+15559876543",
    });

    await expect(adapter.sendBookingReminder(defaultSmsInput)).resolves.toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("retries on transient failure (3 attempts with exponential backoff)", async () => {
    mockCreate
      .mockRejectedValueOnce(new Error("Twilio temporary error"))
      .mockRejectedValueOnce(new Error("Twilio temporary error"))
      .mockResolvedValueOnce({ sid: "SM456", status: "queued" });

    const adapter = new TwilioSmsAdapter({
      client: mockTwilioClient as never,
      fromNumber: "+15559876543",
      retryDelayMs: 1, // speed up test
    });

    await adapter.sendBookingReminder(defaultSmsInput);

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 failed attempts", async () => {
    mockCreate.mockRejectedValue(new Error("Twilio permanent error"));

    const adapter = new TwilioSmsAdapter({
      client: mockTwilioClient as never,
      fromNumber: "+15559876543",
      retryDelayMs: 1, // speed up test
    });

    await expect(adapter.sendBookingReminder(defaultSmsInput)).rejects.toThrow(
      "Twilio permanent error"
    );

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("handles null guestName gracefully (uses fallback)", async () => {
    const adapter = new TwilioSmsAdapter({
      client: mockTwilioClient as never,
      fromNumber: "+15559876543",
    });

    await adapter.sendBookingReminder({ ...defaultSmsInput, guestName: null });

    expect(mockCreate).toHaveBeenCalledOnce();
    const call = mockCreate.mock.calls[0][0];
    expect(call.body).not.toContain("null");
  });
});
