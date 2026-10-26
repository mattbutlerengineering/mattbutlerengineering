import { describe, expect, it, vi } from "vitest";
import { NotificationDispatcher } from "./notification-dispatcher.js";
import { ResendNotificationAdapter } from "./resend-adapter.js";
import { TwilioSmsAdapter } from "./twilio-sms-adapter.js";

describe("closure notice delivery", () => {
  it("Resend adapter sends the rendered subject and html", async () => {
    const send = vi.fn().mockResolvedValue({ data: {}, error: null });
    const adapter = new ResendNotificationAdapter({
      resend: { emails: { send } },
      fromAddress: "b@mbe.dev",
      manageBaseUrl: "https://app.mbe.dev",
      publicApiBaseUrl: null,
    });
    await adapter.sendClosureNotice({ to: "a@x.co", subject: "S", html: "<p>h</p>" });
    expect(send).toHaveBeenCalledWith({
      from: "b@mbe.dev",
      to: "a@x.co",
      subject: "S",
      html: "<p>h</p>",
    });
  });

  it("Resend adapter surfaces an API error as a rejection", async () => {
    const send = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const adapter = new ResendNotificationAdapter({
      resend: { emails: { send } },
      fromAddress: "b@mbe.dev",
      manageBaseUrl: "https://app.mbe.dev",
      publicApiBaseUrl: null,
    });
    await expect(
      adapter.sendClosureNotice({ to: "a@x.co", subject: "S", html: "h" })
    ).rejects.toThrow(/boom/);
  });

  it("Twilio adapter sends the body whole to the phone", async () => {
    const create = vi.fn().mockResolvedValue({ sid: "SM1", status: "queued" });
    const adapter = new TwilioSmsAdapter({
      client: { messages: { create } } as never,
      fromNumber: "+15550000000",
    });
    const body = "x".repeat(400);
    await adapter.sendClosureNotice({ to: "+15551112222", body });
    expect(create).toHaveBeenCalledWith({ to: "+15551112222", from: "+15550000000", body });
  });

  it("dispatcher routes each channel to its adapter and reports whether SMS is configured", async () => {
    const email = { sendClosureNotice: vi.fn().mockResolvedValue(undefined) };
    const sms = { sendClosureNotice: vi.fn().mockResolvedValue(undefined) };
    const d = new NotificationDispatcher({
      emailAdapter: email as never,
      smsAdapter: sms as never,
    });
    await d.sendClosureEmail({ to: "a@x.co", subject: "S", html: "h" });
    await d.sendClosureSms({ to: "+1", body: "b" });
    expect(email.sendClosureNotice).toHaveBeenCalledOnce();
    expect(sms.sendClosureNotice).toHaveBeenCalledOnce();
    expect(d.smsEnabled).toBe(true);
    expect(
      new NotificationDispatcher({ emailAdapter: email as never, smsAdapter: null }).smsEnabled
    ).toBe(false);
  });

  it("dispatcher refuses an SMS send when no SMS adapter is configured", async () => {
    const d = new NotificationDispatcher({ emailAdapter: {} as never, smsAdapter: null });
    await expect(d.sendClosureSms({ to: "+1", body: "b" })).rejects.toThrow(/SMS/);
  });
});
