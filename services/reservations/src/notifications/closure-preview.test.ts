import { describe, expect, it } from "vitest";
import { buildClosureEmail, buildClosureSms } from "./closure-content.js";
import { previewClosureNotice, type ClosurePreviewInput } from "./closure-preview.js";

const BASE: ClosurePreviewInput = {
  action: "cancel",
  venueName: "Rivera's <Bistro>",
  timezone: "America/Los_Angeles",
  closureDate: "2026-12-24",
  startTime: "2026-12-25T02:30:00.000Z", // 6:30 PM on the 24th
  partySize: 4,
  guestName: "Maria Rivera",
  message: "Closed for a private event",
  refund: { amountCents: 4000, currency: "usd" },
  manageBaseUrl: "https://example.com",
};

describe("previewClosureNotice", () => {
  it("is the exact SMS the guest notice builder sends, links as text", () => {
    const preview = previewClosureNotice(BASE);
    expect(preview.sms).toContain("is closed Thu Dec 24");
    expect(preview.sms).toContain("$40 deposit will be refunded");
    expect(preview.sms).toContain("https://example.com/hospitality/reservations/manage?token=");
    expect(preview.sms.startsWith("Rivera's <Bistro>")).toBe(true);
  });

  it("renders the email subject unchanged and its body as plain text with the venue message", () => {
    const { email } = previewClosureNotice(BASE);
    expect(email.subject).toBe(
      buildClosureEmail({
        kind: "cancelled",
        venueName: BASE.venueName,
        guestName: BASE.guestName,
        closureDate: BASE.closureDate,
        startTime: BASE.startTime,
        timezone: BASE.timezone,
        partySize: 4,
        message: BASE.message,
        refund: BASE.refund,
        manageUrl: "x",
        offers: [],
      }).subject
    );
    expect(email.text).toContain("Hi Maria,");
    expect(email.text).toContain("Closed for a private event");
    expect(email.text).toContain("Rivera's <Bistro> is closed on Thu, Dec 24.");
    expect(email.text).not.toMatch(/<\/?(?:p|h1|a)[ >]/);
    expect(email.text).not.toContain("&amp;");
  });

  it("words a move with the new time and a kept booking with the venue message", () => {
    const moved = previewClosureNotice({ ...BASE, action: "move", refund: null });
    expect(moved.sms).toContain("is now at 6:30 PM");
    const kept = previewClosureNotice({ ...BASE, action: "keep_notify", refund: null });
    expect(kept.sms).toContain(": Closed for a private event");
    expect(kept.email.text).toContain("still booked");
  });

  it("matches the sms builder for the same content", () => {
    const preview = previewClosureNotice({ ...BASE, action: "keep_notify", refund: null });
    const direct = buildClosureSms({
      kind: "kept",
      venueName: BASE.venueName,
      guestName: BASE.guestName,
      closureDate: BASE.closureDate,
      startTime: BASE.startTime,
      timezone: BASE.timezone,
      partySize: 4,
      message: BASE.message,
      refund: null,
      manageUrl: preview.sms.split("Manage: ")[1]!,
      offers: [],
    });
    expect(preview.sms).toBe(direct);
  });
});
