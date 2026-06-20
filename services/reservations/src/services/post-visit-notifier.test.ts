import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createPostVisitNotifier,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./post-visit-notifier.js";
import type { PostVisitNotifierDeps } from "./post-visit-notifier.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
const mockUpdateReservationEmailStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateGuestUnsubscribed = vi.fn().mockResolvedValue(undefined);

function makeDeps(overrides: Partial<PostVisitNotifierDeps> = {}): PostVisitNotifierDeps {
  return {
    sendThankYouEmail: mockSendEmail,
    updateReservationEmailStatus: mockUpdateReservationEmailStatus,
    updateGuestUnsubscribed: mockUpdateGuestUnsubscribed,
    ...overrides,
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    reservationId: "res-1",
    guestId: "guest-1",
    guestEmail: "jane@example.com",
    guestFirstName: "Jane",
    guestUnsubscribed: false,
    venueName: "The Oak Table",
    venuePostVisitEmailEnabled: true,
    visitDate: "2026-06-15",
    feedbackUrl: null,
    ...overrides,
  };
}

// ─── Tests: sendPostVisitEmail ────────────────────────────────────────────────

describe("createPostVisitNotifier.sendPostVisitEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends email and sets emailStatus to SENT when all conditions pass", async () => {
    const notifier = createPostVisitNotifier(makeDeps());
    await notifier.sendPostVisitEmail(makeInput());

    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockUpdateReservationEmailStatus).toHaveBeenCalledWith("res-1", "SENT");
  });

  it("skips email when venuePostVisitEmailEnabled is false", async () => {
    const notifier = createPostVisitNotifier(makeDeps());
    await notifier.sendPostVisitEmail(makeInput({ venuePostVisitEmailEnabled: false }));

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdateReservationEmailStatus).not.toHaveBeenCalled();
  });

  it("skips email when guestEmail is null", async () => {
    const notifier = createPostVisitNotifier(makeDeps());
    await notifier.sendPostVisitEmail(makeInput({ guestEmail: null }));

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdateReservationEmailStatus).not.toHaveBeenCalled();
  });

  it("skips email when guest is unsubscribed", async () => {
    const notifier = createPostVisitNotifier(makeDeps());
    await notifier.sendPostVisitEmail(makeInput({ guestUnsubscribed: true }));

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdateReservationEmailStatus).not.toHaveBeenCalled();
  });

  it("sets emailStatus to FAILED when sendThankYouEmail throws", async () => {
    const failingDeps = makeDeps({
      sendThankYouEmail: vi.fn().mockRejectedValue(new Error("Resend error")),
    });
    const notifier = createPostVisitNotifier(failingDeps);
    await notifier.sendPostVisitEmail(makeInput());

    expect(mockUpdateReservationEmailStatus).toHaveBeenCalledWith("res-1", "FAILED");
  });

  it("passes guest first name, venue name, and visit date to email sender", async () => {
    const notifier = createPostVisitNotifier(makeDeps());
    await notifier.sendPostVisitEmail(makeInput({ feedbackUrl: "https://feedback.example.com" }));

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        guestEmail: "jane@example.com",
        guestFirstName: "Jane",
        venueName: "The Oak Table",
        visitDate: "2026-06-15",
        feedbackUrl: "https://feedback.example.com",
        unsubscribeToken: expect.any(String),
      })
    );
  });
});

// ─── Tests: HMAC token ───────────────────────────────────────────────────────

describe("generateUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("generates a token that verifies successfully", () => {
    const token = generateUnsubscribeToken("guest-abc");
    const result = verifyUnsubscribeToken(token);

    expect(result.valid).toBe(true);
    expect(result.guestId).toBe("guest-abc");
  });

  it("returns invalid for a tampered token", () => {
    const token = generateUnsubscribeToken("guest-abc");
    const tampered = token.slice(0, -4) + "xxxx";
    const result = verifyUnsubscribeToken(tampered);

    expect(result.valid).toBe(false);
  });

  it("returns invalid for a random string", () => {
    const result = verifyUnsubscribeToken("not-a-real-token");
    expect(result.valid).toBe(false);
  });

  it("returns invalid for empty string", () => {
    const result = verifyUnsubscribeToken("");
    expect(result.valid).toBe(false);
  });
});
