import { describe, it, expect, vi } from "vitest";
import type { Guest } from "@mbe/types";
import type { NotificationDispatcher } from "@mbe/notifications";
import { sendWinBack } from "./win-back.js";

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

    await sendWinBack(guest, port, "The Grand Bistro");

    expect(port.sendWinBack).toHaveBeenCalledWith(
      expect.objectContaining({ venueName: "The Grand Bistro" }),
      expect.any(String)
    );
  });

  it("does NOT use the hardcoded fallback string when a real venueName is provided", async () => {
    const guest = makeGuest();
    const port = makeNotificationPort();

    await sendWinBack(guest, port, "Riverside Grill");

    const [payload] = (port.sendWinBack as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.venueName).not.toBe("your favourite restaurant");
  });

  it("returns false and skips dispatch for transactional_only guests", async () => {
    const guest = makeGuest({ communicationPreference: "transactional_only" });
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "Any Venue");

    expect(result).toBe(false);
    expect(port.sendWinBack).not.toHaveBeenCalled();
  });

  it("returns false when guest has no email address", async () => {
    const guest = makeGuest({ email: null });
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "Any Venue");

    expect(result).toBe(false);
    expect(port.sendWinBack).not.toHaveBeenCalled();
  });

  it("returns true when message is sent", async () => {
    const guest = makeGuest();
    const port = makeNotificationPort();

    const result = await sendWinBack(guest, port, "The Grand Bistro");

    expect(result).toBe(true);
  });
});
