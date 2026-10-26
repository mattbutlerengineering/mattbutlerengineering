import { describe, expect, it, vi } from "vitest";
import {
  createClosureNoticeHandler,
  isOnCallList,
  type ClosureNoticeDeps,
  type Deliveries,
  type NoticeOutcome,
} from "./closure-notice.js";
import type { JobContext } from "../jobs/index.js";

const outcome = (over: Partial<NoticeOutcome> = {}): NoticeOutcome => ({
  outcomeId: "o1",
  venueId: "v1",
  reservationId: "res1",
  action: "cancel",
  deliveries: {},
  rebooked: false,
  closureDate: "2026-12-24",
  message: "Closed for a private event.",
  startTime: new Date("2026-12-24T19:00:00.000Z"),
  partySize: 2,
  guestName: "Ana Rivera",
  guestEmail: "ana@example.com",
  guestPhone: "+15551112222",
  preference: "email_only",
  refund: { amountCents: 4000, currency: "usd" },
  venueName: "Bistro Lune",
  timezone: "UTC",
  ...over,
});

function setup(found: NoticeOutcome | null, over: Partial<ClosureNoticeDeps> = {}) {
  const sendEmail = vi.fn().mockResolvedValue(undefined);
  const sendSms = vi.fn().mockResolvedValue(undefined);
  const recorded: Deliveries[] = [];
  const deps: ClosureNoticeDeps = {
    load: async () => found,
    offers: async () => [new Date("2026-12-26T19:00:00.000Z")],
    manageUrl: (o, rebook) => `https://m.test/${o.outcomeId}${rebook ? `?rebook=${rebook}` : ""}`,
    record: async (_id, deliveries) => {
      recorded.push(deliveries);
    },
    sendEmail,
    sendSms,
    smsEnabled: true,
    logger: { warn: vi.fn() },
    ...over,
  };
  const handler = createClosureNoticeHandler(deps);
  const run = (payload: object = {}, isFinalAttempt = false) => {
    const ctx: JobContext = { updateData: vi.fn().mockResolvedValue(undefined), isFinalAttempt };
    return handler({ outcomeId: "o1", venueId: "v1", ...payload }, ctx);
  };
  return { run, sendEmail, sendSms, recorded };
}

describe("CLOSURE_NOTICE handler", () => {
  it("emails a cancelled guest on their preferred channel and records it sent", async () => {
    const t = setup(outcome());
    await t.run();
    expect(t.sendEmail).toHaveBeenCalledOnce();
    expect(t.sendEmail.mock.calls[0]![0].subject).toContain("is cancelled");
    expect(t.sendSms).not.toHaveBeenCalled();
    expect(t.recorded.at(-1)).toMatchObject({ email: "sent", sms: "skipped" });
  });

  it("urgent sends SMS and email, and the rebook offer is a one-tap link", async () => {
    const t = setup(outcome());
    await t.run({ urgent: true });
    expect(t.sendEmail).toHaveBeenCalledOnce();
    expect(t.sendSms).toHaveBeenCalledOnce();
    expect(t.sendSms.mock.calls[0]![0].to).toBe("+15551112222");
    expect(t.sendSms.mock.calls[0]![0].body).toContain("rebook=2026-12-26");
    expect(t.recorded.at(-1)).toMatchObject({ email: "sent", sms: "sent" });
  });

  it("skips SMS when the venue has no SMS adapter", async () => {
    const t = setup(outcome({ preference: "both" }), { smsEnabled: false });
    await t.run();
    expect(t.sendSms).not.toHaveBeenCalled();
    expect(t.recorded.at(-1)).toMatchObject({ email: "sent", sms: "skipped" });
  });

  it("does nothing for a keep_silent outcome or a missing one", async () => {
    const silent = setup(outcome({ action: "keep_silent" }));
    await silent.run();
    expect(silent.sendEmail).not.toHaveBeenCalled();
    const missing = setup(null);
    await missing.run();
    expect(missing.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["move", "has moved"],
    ["keep_notify", "Update about"],
  ] as const)("renders the %s variant", async (action, subject) => {
    const t = setup(outcome({ action }));
    await t.run();
    expect(t.sendEmail.mock.calls[0]![0].subject).toContain(subject);
  });

  it("sends the reopened notice only for cancelled guests and records it apart from the closure notice", async () => {
    const t = setup(outcome({ deliveries: { email: "sent" } }));
    await t.run({ variant: "reopened" });
    expect(t.sendEmail.mock.calls[0]![0].subject).toContain("reopened");
    expect(t.recorded.at(-1)).toMatchObject({ email: "sent", reopen: { email: "sent" } });

    const moved = setup(outcome({ action: "move" }));
    await moved.run({ variant: "reopened" });
    expect(moved.sendEmail).not.toHaveBeenCalled();
  });

  it("never re-sends a channel already delivered by an earlier attempt", async () => {
    const t = setup(outcome({ deliveries: { email: "sent" } }));
    await t.run({ urgent: true });
    expect(t.sendEmail).not.toHaveBeenCalled();
    expect(t.sendSms).toHaveBeenCalledOnce();
  });

  it("a failed send throws for the retry and records nothing as failed until the final attempt", async () => {
    const t = setup(outcome());
    t.sendEmail.mockRejectedValueOnce(new Error("resend down"));
    await expect(t.run()).rejects.toThrow("resend down");
    expect(t.recorded.at(-1)?.email).toBeUndefined();
  });

  it("records failed once the last attempt fails", async () => {
    const t = setup(outcome());
    t.sendEmail.mockRejectedValue(new Error("resend down"));
    await expect(t.run({}, true)).rejects.toThrow("resend down");
    expect(t.recorded.at(-1)).toMatchObject({ email: "failed" });
  });

  it("a guest with no usable contact is recorded skipped without retrying", async () => {
    const t = setup(outcome({ guestEmail: null, guestPhone: null }));
    await t.run();
    expect(t.recorded.at(-1)).toEqual({ email: "skipped", sms: "skipped" });
  });

  it("falls back to the full picker when the offers lookup fails", async () => {
    const warn = vi.fn();
    const t = setup(outcome({ preference: "sms_only" }), {
      offers: async () => {
        throw new Error("snapshot");
      },
      logger: { warn },
    });
    await t.run();
    expect(warn).toHaveBeenCalled();
    expect(t.sendSms.mock.calls[0]![0].body).not.toContain("rebook=");
  });
});

describe("isOnCallList", () => {
  it("lists a notified guest with no confirmed delivery and no rebooking", () => {
    expect(
      isOnCallList({ action: "cancel", deliveries: { email: "failed" }, rebooked: false })
    ).toBe(true);
    expect(isOnCallList({ action: "move", deliveries: {}, rebooked: false })).toBe(true);
    expect(
      isOnCallList({
        action: "cancel",
        deliveries: { email: "skipped", sms: "skipped" },
        rebooked: false,
      })
    ).toBe(true);
  });

  it("leaves off delivered, rebooked and deliberately silent guests", () => {
    expect(isOnCallList({ action: "cancel", deliveries: { sms: "sent" }, rebooked: false })).toBe(
      false
    );
    expect(isOnCallList({ action: "cancel", deliveries: {}, rebooked: true })).toBe(false);
    expect(isOnCallList({ action: "keep_silent", deliveries: {}, rebooked: false })).toBe(false);
  });
});
