import { describe, expect, it } from "vitest";
import { buildClosureEmail, buildClosureSms, smsSegments } from "./closure-content.js";
import {
  previewClosureNotice,
  PREVIEW_LINK_TEXT,
  type ClosurePreviewInput,
} from "./closure-preview.js";
import { buildManageUrl } from "./manage-url.js";

/** About the length of a real signed manage token (id, email, expiry and an HMAC, base64url). */
const REAL_TOKEN = "t".repeat(187);

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
  manageToken: REAL_TOKEN,
  from: "Matt Butler Engineering <reservations@example.com>",
};

/** What the notice job would send: the same builder, with the real link. */
function sent(input: ClosurePreviewInput): string {
  return buildClosureSms({
    kind: { cancel: "cancelled", move: "moved", keep_notify: "kept" }[input.action] as never,
    venueName: input.venueName,
    guestName: input.guestName,
    closureDate: input.closureDate,
    startTime: input.startTime,
    timezone: input.timezone,
    partySize: input.partySize,
    message: input.message,
    refund: input.action === "cancel" ? input.refund : null,
    manageUrl: buildManageUrl(input.manageBaseUrl, input.manageToken),
    offers: [],
  });
}

describe("previewClosureNotice", () => {
  it("is the exact SMS the guest notice builder sends, with the guest's link shown as text", () => {
    const preview = previewClosureNotice(BASE);
    expect(preview.sms).toContain("is closed Thu Dec 24");
    expect(preview.sms).toContain("$40 deposit will be refunded");
    expect(preview.sms).toContain(PREVIEW_LINK_TEXT);
    expect(preview.sms).not.toContain("token=");
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
    expect(email.from).toBe(BASE.from);
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

  describe("chooses its body by segment count, as the real link makes it (#7983)", () => {
    const kept = (message: string, venueName = BASE.venueName): ClosurePreviewInput => ({
      ...BASE,
      action: "keep_notify",
      refund: null,
      message,
      venueName,
    });

    it("is what the job sends, with the link swapped for its text, for any message length", () => {
      for (const length of [0, 20, 60, 104, 150, 200]) {
        const input = kept("m".repeat(length));
        const real = sent(input);
        const expected = real
          .split(buildManageUrl(input.manageBaseUrl, REAL_TOKEN))
          .join(PREVIEW_LINK_TEXT);
        expect(previewClosureNotice(input).sms).toBe(expected);
      }
    });

    it("drops a 150-character message the real SMS drops, instead of showing it", () => {
      const message = "m".repeat(150);
      expect(smsSegments(sent(kept(message)))).toBeLessThanOrEqual(3);
      expect(sent(kept(message))).not.toContain(message);
      expect(previewClosureNotice(kept(message)).sms).not.toContain(message);
      // A short message fits with the real link, so it is shown.
      expect(previewClosureNotice(kept("Closed for the holiday")).sms).toContain(
        "Closed for the holiday"
      );
    });

    it("picks the venue-name variant the real SMS picks, for a long name with an emoji", () => {
      const input = kept(
        "m".repeat(40),
        `The Extremely Long Restaurant Name ${"Café ".repeat(6)}🍷`
      );
      const real = sent(input);
      const preview = previewClosureNotice(input).sms;
      expect(preview).toBe(
        real.split(buildManageUrl(input.manageBaseUrl, REAL_TOKEN)).join(PREVIEW_LINK_TEXT)
      );
    });
  });
});
