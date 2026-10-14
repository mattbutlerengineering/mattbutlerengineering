import { describe, it, expect, vi } from "vitest";
import { ResendNotificationAdapter } from "./resend-adapter.js";
import { NotificationDispatcher, PartialDeliveryError } from "./notification-dispatcher.js";
import type { BookingNotificationInput } from "./port.js";
import type { SmsPort } from "./sms-port.js";

// #6562: the Resend SDK resolves `{ data, error }` on API failures instead of
// throwing. The adapter must turn `error` into a rejection, otherwise the
// dispatcher counts the email channel as delivered and never retries it.

const MANAGE_URL = "https://app.mbe.dev/reservations/manage";

const input: BookingNotificationInput = {
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
  venueAddress: "123 Main St, Portland OR",
  manageToken: "tok_abc123",
};

const rateLimited = {
  data: null,
  error: { name: "rate_limit_exceeded", message: "Too many requests" },
};

function makeAdapter(send: ReturnType<typeof vi.fn>): ResendNotificationAdapter {
  return new ResendNotificationAdapter({
    resend: { emails: { send } } as never,
    fromAddress: "bookings@mbe.dev",
    manageBaseUrl: MANAGE_URL,
    publicApiBaseUrl: "https://api.mbe.dev",
  });
}

type Call = (a: ResendNotificationAdapter) => Promise<void>;
const calls: [string, Call][] = [
  ["sendBookingConfirmation", (a) => a.sendBookingConfirmation(input)],
  ["sendBookingReminder", (a) => a.sendBookingReminder(input)],
  ["sendBookingModified", (a) => a.sendBookingModified(input)],
  ["sendBookingCancelled", (a) => a.sendBookingCancelled(input)],
  [
    "sendWinBack",
    (a) =>
      a.sendWinBack({
        guestName: "Jane",
        guestEmail: "jane@example.com",
        venueName: "Oak",
      } as never),
  ],
  [
    "sendThankYouEmail",
    (a) =>
      a.sendThankYouEmail({
        guestEmail: "jane@example.com",
        guestFirstName: "Jane",
        venueName: "Oak",
        visitDate: "2026-06-15",
        feedbackUrl: null,
        unsubscribeToken: "t",
      } as never),
  ],
];

describe("ResendNotificationAdapter — SDK { error } results (#6562)", () => {
  it.each(calls)("%s rejects when Resend returns { error }", async (_name, call) => {
    const send = vi.fn().mockResolvedValue(rateLimited);
    await expect(call(makeAdapter(send))).rejects.toThrow(/Too many requests/);
  });

  it("resolves when Resend returns { data, error: null }", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    await expect(makeAdapter(send).sendBookingReminder(input)).resolves.toBeUndefined();
  });
});

describe("NotificationDispatcher with the real Resend adapter (#6562)", () => {
  it("does not report a failed email as delivered, and retries it", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce({ data: { id: "e1" }, error: null });
    const sendSms = vi.fn().mockResolvedValue(undefined);
    const dispatcher = new NotificationDispatcher({
      emailAdapter: makeAdapter(send),
      smsAdapter: { sendBookingReminder: sendSms } as unknown as SmsPort,
      smsManageBaseUrl: MANAGE_URL,
    });

    const err = await dispatcher.sendBookingReminder(input, "both").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartialDeliveryError);
    expect((err as PartialDeliveryError).deliveredChannels).toEqual(["sms"]);

    await dispatcher.sendBookingReminder(input, "both", { skipChannels: ["sms"] });
    expect(send).toHaveBeenCalledTimes(2);
    expect(sendSms).toHaveBeenCalledOnce();
  });
});
