import { describe, it, expect, vi } from "vitest";
import type { Guest } from "@mbe/types";
import type { NotificationDispatcher } from "../notifications/index.js";
import { sendWinBack, type WinBackDeps } from "./win-back.js";

const NOW = new Date("2026-11-01T12:00:00Z");

function deps(claim: WinBackDeps["claim"] = async () => ({ claimed: true })): WinBackDeps {
  return { claim, now: () => NOW };
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
    it("refuses a repeat inside the cooldown, sends nothing, and says when the last one went", async () => {
      const lastSentAt = new Date("2026-10-30T09:00:00Z");
      const port = makeNotificationPort();

      const result = await sendWinBack(
        makeGuest(),
        port,
        "Any Venue",
        deps(async () => ({ claimed: false, lastSentAt }))
      );

      expect(result).toEqual({ status: "cooldown", lastSentAt });
      expect(port.sendWinBack).not.toHaveBeenCalled();
    });

    it("claims the guest in its own venue, before the provider is called", async () => {
      const order: string[] = [];
      const claim = vi.fn(async () => {
        order.push("claim");
        return { claimed: true as const };
      });
      const sendWinBackMock = vi.fn(() => {
        order.push("send");
        return Promise.resolve();
      });
      const port = {
        ...makeNotificationPort(),
        sendWinBack: sendWinBackMock,
      } as unknown as NotificationDispatcher;

      await sendWinBack(makeGuest(), port, "Any Venue", deps(claim));

      expect(claim).toHaveBeenCalledWith("venue-1", "guest-1", NOW);
      expect(order).toEqual(["claim", "send"]);
    });

    it("does not claim for a guest it would skip, so a skip never starts a cooldown", async () => {
      const claim = vi.fn(async () => ({ claimed: true as const }));

      await sendWinBack(makeGuest({ email: null }), makeNotificationPort(), "V", deps(claim));

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

    it("keeps the claim when the provider call fails: the next send is refused, not repeated", async () => {
      const claimed = new Set<string>();
      const claim: WinBackDeps["claim"] = async (_v, g) =>
        claimed.has(g) ? { claimed: false, lastSentAt: NOW } : (claimed.add(g), { claimed: true });
      const port = makeNotificationPort();
      (port.sendWinBack as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("502"));

      await expect(sendWinBack(makeGuest(), port, "V", deps(claim))).rejects.toThrow("502");
      const second = await sendWinBack(makeGuest(), port, "V", deps(claim));

      expect(second).toEqual({ status: "cooldown", lastSentAt: NOW });
      expect(port.sendWinBack).toHaveBeenCalledTimes(1);
    });
  });
});
