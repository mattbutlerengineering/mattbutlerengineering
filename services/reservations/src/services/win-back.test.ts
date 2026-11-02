import { describe, it, expect, vi } from "vitest";
import type { Guest } from "@mbe/types";
import type { NotificationDispatcher } from "../notifications/index.js";
import { ProviderRejectedError } from "../notifications/provider-rejected-error.js";
import { cooldownDetail, sendWinBack, type WinBackDeps } from "./win-back.js";
import { WIN_BACK_COOLDOWN_MS } from "./win-back-store.js";

const NOW = new Date("2026-11-01T12:00:00Z");

function deps(overrides: Partial<WinBackDeps> = {}): WinBackDeps {
  return {
    claim: () => Promise.resolve({ claimed: true }),
    markSent: () => Promise.resolve(),
    release: () => Promise.resolve(),
    now: () => NOW,
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "guest-1",
    venueId: "venue-1",
    name: "Alice Smith",
    email: "alice@example.com",
    phone: null,
    notes: null,
    visitCount: 3,
    noShowCount: 0,
    riskScore: "trusted",
    lifetimeSpend: null,
    lastVisit: null,
    tags: null,
    dietaryRestrictions: null,
    communicationPreference: "email_only",
    staffNotes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeNotificationPort(): NotificationDispatcher {
  return {
    sendBookingConfirmation: vi.fn().mockResolvedValue(undefined),
    sendBookingReminder: vi.fn().mockResolvedValue(undefined),
    sendBookingModified: vi.fn().mockResolvedValue(undefined),
    sendBookingCancelled: vi.fn().mockResolvedValue(undefined),
    sendWinBack: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationDispatcher;
}

describe("sendWinBack", () => {
  it("passes the correct venueName to the notification dispatcher", async () => {
    const guest = makeGuest();
    const port = makeNotificationPort();

    await sendWinBack(guest, port, "The Grand Bistro", deps());

    expect(port.sendWinBack).toHaveBeenCalledWith(
      expect.objectContaining({ venueName: "The Grand Bistro" }),
      expect.any(String)
    );
  });

  it("does NOT use the hardcoded fallback string when a real venueName is provided", async () => {
    const guest = makeGuest();
    const port = makeNotificationPort();

    await sendWinBack(guest, port, "Riverside Grill", deps());

    const sendWinBackCall = (port.sendWinBack as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!sendWinBackCall) throw new Error("expected a sendWinBack call");
    const [payload] = sendWinBackCall;
    expect(payload.venueName).not.toBe("your favourite restaurant");
  });

  it("returns false and skips dispatch for transactional_only guests", async () => {
    const guest = makeGuest({ communicationPreference: "transactional_only" });
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "Any Venue", deps());

    expect(result).toEqual({ status: "skipped" });
    expect(port.sendWinBack).not.toHaveBeenCalled();
  });

  it("returns false when guest has no email address", async () => {
    const guest = makeGuest({ email: null });
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "Any Venue", deps());

    expect(result).toEqual({ status: "skipped" });
    expect(port.sendWinBack).not.toHaveBeenCalled();
  });

  it("returns true when message is sent", async () => {
    const guest = makeGuest();
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "The Grand Bistro", deps());

    expect(result).toEqual({ status: "sent" });
  });

  it("returns false for sms_only guest even when email is present", async () => {
    const guest = makeGuest({
      communicationPreference: "sms_only",
      email: "alice@example.com",
      phone: "+15551234567",
    });
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "Any Venue", deps());

    expect(result).toEqual({ status: "skipped" });
    expect(port.sendWinBack).not.toHaveBeenCalled();
  });

  // Focused coverage for the two skip predicates directly on the public
  // sendWinBack surface — no dependency on the (now-removed) shared
  // resolveChannel helper that booking-notifications.ts used to export.
  it("returns false for sms_only guest with no email (both skip conditions true)", async () => {
    const guest = makeGuest({ communicationPreference: "sms_only", email: null });
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "Any Venue", deps());

    expect(result).toEqual({ status: "skipped" });
    expect(port.sendWinBack).not.toHaveBeenCalled();
  });

  // Compliance regression (#3342): an unsubscribed guest must never receive
  // staff-triggered win-back marketing, even with a valid email and a
  // marketing-eligible channel preference.
  it("returns false and skips dispatch for an unsubscribed guest", async () => {
    const guest = makeGuest({
      unsubscribed: true,
      communicationPreference: "email_only",
      email: "alice@example.com",
    });
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "Any Venue", deps());

    expect(result).toEqual({ status: "skipped" });
    expect(port.sendWinBack).not.toHaveBeenCalled();
  });

  describe("send record and cooldown (#8041)", () => {
    it("refuses a repeat inside the cooldown, sends nothing, and reports the record and when another is allowed", async () => {
      const claimedAt = new Date("2026-10-30T09:00:00Z");
      const sentAt = new Date("2026-10-30T09:00:01Z");
      const port = makeNotificationPort();

      const result = await sendWinBack(
        makeGuest(),
        port,
        "Any Venue",
        deps({ claim: async () => ({ claimed: false, claimedAt, sentAt }) })
      );

      expect(result).toEqual({
        status: "cooldown",
        claimedAt,
        sentAt,
        retryAfter: new Date(claimedAt.getTime() + WIN_BACK_COOLDOWN_MS),
      });
      expect(port.sendWinBack).not.toHaveBeenCalled();
    });

    it("claims the guest in its own venue, before the provider is called", async () => {
      const order: string[] = [];
      const claim = vi.fn(() => {
        order.push("claim");
        return Promise.resolve({ claimed: true as const });
      });
      const sendWinBackMock = vi.fn(() => {
        order.push("send");
        return Promise.resolve();
      });
      const port = {
        ...makeNotificationPort(),
        sendWinBack: sendWinBackMock,
      } as unknown as NotificationDispatcher;

      await sendWinBack(makeGuest(), port, "Any Venue", deps({ claim }));

      expect(claim).toHaveBeenCalledWith("venue-1", "guest-1", NOW);
      expect(order).toEqual(["claim", "send"]);
    });

    it("does not claim for a guest it would skip, so a skip never starts a cooldown", async () => {
      const claim = vi.fn(() => Promise.resolve({ claimed: true as const }));

      await sendWinBack(makeGuest({ email: null }), makeNotificationPort(), "V", deps({ claim }));

      expect(claim).not.toHaveBeenCalled();
    });

    it("gives the provider an idempotency key tied to the guest and this claim", async () => {
      const port = makeNotificationPort();

      await sendWinBack(makeGuest(), port, "Any Venue", deps());

      expect(port.sendWinBack).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: `win-back/guest-1/${NOW.toISOString()}` }),
        expect.any(String)
      );
    });

    it("records the sent time only after the provider call succeeds", async () => {
      const markSent = vi.fn(() => Promise.resolve());
      const later = new Date(NOW.getTime() + 800);
      const times = [NOW, later];
      const port = makeNotificationPort();

      const result = await sendWinBack(
        makeGuest(),
        port,
        "V",
        deps({ markSent, now: () => times.shift() ?? later })
      );

      expect(result).toEqual({ status: "sent" });
      expect(markSent).toHaveBeenCalledWith("venue-1", "guest-1", NOW, later);
    });

    it("releases the claim and reports failure when the provider definitely rejects", async () => {
      const release = vi.fn(() => Promise.resolve());
      const markSent = vi.fn(() => Promise.resolve());
      const port = makeNotificationPort();
      (port.sendWinBack as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new ProviderRejectedError("Resend send failed (rate_limit_exceeded): Too many requests")
      );

      const result = await sendWinBack(makeGuest(), port, "V", deps({ release, markSent }));

      expect(result).toEqual({ status: "failed" });
      expect(release).toHaveBeenCalledWith("venue-1", "guest-1", NOW);
      expect(markSent).not.toHaveBeenCalled();
    });

    it("keeps the claim when the failure is ambiguous: the error propagates, nothing is released", async () => {
      const release = vi.fn(() => Promise.resolve());
      const markSent = vi.fn(() => Promise.resolve());
      const port = makeNotificationPort();
      (port.sendWinBack as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("timeout"));

      await expect(
        sendWinBack(makeGuest(), port, "V", deps({ release, markSent }))
      ).rejects.toThrow("timeout");

      expect(release).not.toHaveBeenCalled();
      expect(markSent).not.toHaveBeenCalled();
    });
  });
});

describe("cooldownDetail", () => {
  const claimedAt = new Date("2026-10-30T09:00:00.000Z");
  const retryAfter = new Date("2026-11-06T09:00:00.000Z");

  it("says a send happened when the provider confirmed one", () => {
    const sentAt = new Date("2026-10-30T09:00:01.000Z");
    const detail = cooldownDetail("Alice", { claimedAt, sentAt, retryAfter });
    expect(detail).toContain("was sent a win-back message on 2026-10-30T09:00:01.000Z");
    expect(detail).toContain("Nothing was sent now");
    expect(detail).toContain("2026-11-06T09:00:00.000Z");
  });

  it("says a send was attempted and may not have gone out when it was never confirmed", () => {
    const detail = cooldownDetail("Alice", { claimedAt, sentAt: null, retryAfter });
    expect(detail).toContain("attempted on 2026-10-30T09:00:00.000Z");
    expect(detail).toContain("may not have gone out");
    expect(detail).not.toMatch(/was sent a win-back/);
    expect(detail).toContain("2026-11-06T09:00:00.000Z");
  });

  it("treats an older confirmed send as unconfirmed for the newer claim", () => {
    const sentAt = new Date("2026-09-01T09:00:00.000Z");
    expect(cooldownDetail("Alice", { claimedAt, sentAt, retryAfter })).toContain(
      "may not have gone out"
    );
  });
});
