import { describe, expect, it } from "vitest";
import {
  buildClosureEmail,
  buildClosureSms,
  smsSegments,
  type ClosureNoticeContent,
} from "./closure-content.js";

// A signed manage token is ~170 chars (see twilio-sms-adapter's fitReminderBody).
const TOKEN = "t".repeat(170);
const MANAGE = `https://app.example.com/hospitality/reservations/manage?token=${TOKEN}`;
const offer = (label: string, slot: string) => ({
  label,
  url: `${MANAGE}&rebook=${encodeURIComponent(slot)}`,
});

const base: ClosureNoticeContent = {
  kind: "cancelled",
  venueName: "Bistro Lune",
  guestName: "Ana Rivera",
  closureDate: "2026-12-24",
  startTime: "2026-12-24T19:00:00.000Z",
  timezone: "UTC",
  partySize: 2,
  message: "Closed for a private event.",
  refund: { amountCents: 4000, currency: "usd" },
  manageUrl: MANAGE,
  offers: [
    offer("Wed 23 7:00 PM", "2026-12-23T19:00:00.000Z"),
    offer("Sat 26 7:15 PM", "2026-12-26T19:15:00.000Z"),
    offer("Sun 27 6:45 PM", "2026-12-27T18:45:00.000Z"),
  ],
};

describe("smsSegments", () => {
  it("counts a short GSM-7 body as one segment and 153-char parts beyond 160", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("a".repeat(306))).toBe(2);
    expect(smsSegments("a".repeat(307))).toBe(3);
  });

  it("counts non-GSM characters at UCS-2 size", () => {
    expect(smsSegments("é".repeat(70))).toBe(1);
    expect(smsSegments("“".repeat(71))).toBe(2);
  });
});

describe("buildClosureSms", () => {
  it.each(["cancelled", "moved", "kept", "reopened"] as const)(
    "%s fits in at most 3 segments with a realistic token",
    (kind) => {
      const body = buildClosureSms({ ...base, kind });
      expect(smsSegments(body)).toBeLessThanOrEqual(3);
      expect(body).toContain(MANAGE);
    }
  );

  it.each(["cancelled", "moved", "kept", "reopened"] as const)(
    "%s keeps GSM-7 (≤ 3 segments) for a curly-apostrophe venue name and typographic message",
    (kind) => {
      const body = buildClosureSms({
        ...base,
        kind,
        venueName: "Joe’s Diner",
        message: "We’re closed — “private event”… sorry all.",
      });
      expect(smsSegments(body)).toBeLessThanOrEqual(3);
      expect(body).toContain("Joe's Diner");
      expect(body).toContain(MANAGE);
      if (kind === "kept") expect(body).toContain(`We're closed - "private event"... sorry all.`);
    }
  );

  it.each(["cancelled", "moved", "kept", "reopened"] as const)(
    "%s stays within 3 segments when the venue message or name has an unavoidable non-GSM character",
    (kind) => {
      const body = buildClosureSms({
        ...base,
        kind,
        venueName: "Lune \u{1F319} Bistro",
        message: "Closed for a private event \u{1F389}",
      });
      expect(smsSegments(body)).toBeLessThanOrEqual(3);
      expect(body).toContain(MANAGE);
      expect(body).not.toContain("\u{1F389}");
    }
  );

  it("cancelled lists every rebook time with its own link, then other times, when they fit", () => {
    const short = "https://x.co/m?token=abc";
    const body = buildClosureSms({
      ...base,
      manageUrl: short,
      offers: base.offers.map((o, i) => ({ ...o, url: `${short}&rebook=2026-12-2${3 + i}` })),
    });
    expect(body).toContain("Bistro Lune is closed Thu Dec 24");
    expect(body).toContain("$40 deposit");
    expect(body).toContain("Wed 23 7:00 PM");
    expect(body).toContain("rebook=2026-12-23");
    expect(body).toContain("rebook=2026-12-25");
    expect(body).toMatch(/Other times/);
  });

  it("with real-length tokens keeps the best offer with its one-tap link", () => {
    const body = buildClosureSms(base);
    expect(body).toContain("Wed 23 7:00 PM");
    expect(body).toContain("rebook=2026-12-23");
  });

  it("drops offers rather than run past 3 segments", () => {
    const body = buildClosureSms({
      ...base,
      offers: Array.from({ length: 3 }, (_, i) => offer(`Day ${i} 7:00 PM`, `slot-${i}`)),
    });
    expect(smsSegments(body)).toBeLessThanOrEqual(3);
    expect((body.match(/rebook=/g) ?? []).length).toBeLessThan(3);
  });

  it("cancelled with no offers links the full picker only", () => {
    const body = buildClosureSms({ ...base, offers: [] });
    expect(body).not.toContain("rebook=");
    expect(body).toContain(MANAGE);
  });

  it("moved states the new time and the free cancel link", () => {
    const body = buildClosureSms({ ...base, kind: "moved", startTime: "2026-12-24T19:00:00.000Z" });
    expect(body).toContain("now at 7:00 PM");
    expect(body).toContain("Cancel free");
  });

  it("kept says the booking stands and carries the venue message when it fits", () => {
    const body = buildClosureSms({ ...base, kind: "kept" });
    expect(body).toContain("still booked");
    expect(body).toContain("Closed for a private event.");
  });

  it("reopened invites a rebook", () => {
    const body = buildClosureSms({ ...base, kind: "reopened" });
    expect(body).toContain("We've reopened Thu Dec 24");
  });
});

describe("buildClosureEmail", () => {
  it("cancelled subject and body name the venue, date, refund and rebook buttons", () => {
    const { subject, html } = buildClosureEmail(base);
    expect(subject).toBe("Your reservation at Bistro Lune on Thu, Dec 24 is cancelled");
    expect(html).toContain("Closed for a private event.");
    expect(html).toContain("$40");
    expect(html).toContain("Wed 23 7:00 PM");
    expect(html).toContain("Other dates and times");
  });

  it("escapes guest-controlled and venue-controlled text", () => {
    const { html } = buildClosureEmail({
      ...base,
      venueName: "<script>x</script>",
      message: "<img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  it("omits links whose scheme is not http(s)", () => {
    const { html } = buildClosureEmail({ ...base, manageUrl: "javascript:alert(1)", offers: [] });
    expect(html).not.toContain("javascript:");
  });

  it.each(["moved", "kept", "reopened"] as const)("%s has its own subject", (kind) => {
    const { subject } = buildClosureEmail({ ...base, kind });
    expect(subject).toContain("Bistro Lune");
    expect(subject).not.toContain("is cancelled");
  });
});
