import { describe, expect, it, vi } from "vitest";
import type { GuestNoticeLocale } from "@mbe/types";
import type { JobContext } from "../jobs/index.js";
import { previewClosureNotice } from "../notifications/closure-preview.js";
import { smsSegments } from "../notifications/closure-content.js";
import { createClosureNoticeHandler, type NoticeOutcome } from "./closure-notice.js";

/**
 * #8388: a closure notice is written in the language the guest booked in, and Step 2's preview is
 * the same renderer, so it matches what is sent.
 */

const REAL_LINK = `https://m.test/manage?token=${"t".repeat(187)}`;

const outcome = (locale: GuestNoticeLocale, over: Partial<NoticeOutcome> = {}): NoticeOutcome => ({
  outcomeId: "o1",
  venueId: "v1",
  reservationId: "res1",
  action: "cancel",
  deliveries: {},
  rebooked: false,
  closureDate: "2026-12-24",
  message: "Fermé pour un événement privé.",
  startTime: new Date("2026-12-25T00:30:00.000Z"), // 7:30 PM on the 24th in New York
  partySize: 4,
  guestName: "Camille Tremblay",
  guestEmail: "camille@example.com",
  guestPhone: "+15145550100",
  preference: "both",
  refund: { amountCents: 4000, currency: "usd" },
  venueName: "Bistro Lune",
  timezone: "America/New_York",
  originHost: null,
  locale,
  ...over,
});

async function sentFor(o: NoticeOutcome) {
  const sendEmail = vi.fn().mockResolvedValue(undefined);
  const sendSms = vi.fn().mockResolvedValue(undefined);
  const handler = createClosureNoticeHandler({
    load: async () => o,
    offers: async () => [],
    manageUrl: () => REAL_LINK,
    record: async () => undefined,
    sendEmail,
    sendSms,
    smsEnabled: true,
    logger: { warn: vi.fn() },
  });
  const ctx: JobContext = {
    updateData: vi.fn().mockResolvedValue(undefined),
    isFinalAttempt: false,
  };
  await handler({ outcomeId: o.outcomeId, venueId: o.venueId, urgent: true }, ctx);
  return {
    email: sendEmail.mock.calls[0]![0] as { subject: string; html: string },
    sms: sendSms.mock.calls[0]![0].body as string,
  };
}

function previewOf(o: NoticeOutcome) {
  return previewClosureNotice({
    action: "cancel",
    locale: o.locale,
    venueName: o.venueName,
    timezone: o.timezone,
    closureDate: o.closureDate,
    startTime: o.startTime.toISOString(),
    partySize: o.partySize,
    guestName: o.guestName,
    message: o.message,
    refund: o.refund,
    manageBaseUrl: "https://m.test",
    manageToken: "t".repeat(187),
    from: "Bistro <r@m.test>",
  });
}

/** The email body as a guest reads it: one line per paragraph, tags dropped. */
const plain = (html: string): string =>
  html
    .split("\n")
    .map((line) => line.replace(/<[^>]+>/g, ""))
    .filter((line) => line.trim() !== "")
    .join("\n");

describe("closure notices speak the guest's language", () => {
  it("sends a reservation made in fr-CA its closure notice in fr-CA", async () => {
    const sent = await sentFor(outcome("fr-CA"));
    expect(sent.email.subject).toBe("Votre réservation chez Bistro Lune le jeu 24 déc est annulée");
    expect(plain(sent.email.html)).toContain("Bonjour Camille,");
    expect(plain(sent.email.html)).toContain("Votre table de 19 h 30 pour 4 est annulée.");
    expect(plain(sent.email.html)).toContain("Votre dépôt de 40 $ US sera remboursé.");
    expect(sent.sms).toContain("sera fermé le jeu 24 déc.");
    expect(sent.sms).toContain("Réservez à nouveau");
    expect(sent.sms).not.toContain("is closed");
  });

  it("previews that fr-CA notice byte for byte as it is sent", async () => {
    const o = outcome("fr-CA");
    const sent = await sentFor(o);
    const preview = previewOf(o);
    expect(preview.email.subject).toBe(sent.email.subject);
    expect(preview.email.text).toBe(plain(sent.email.html));
    expect(preview.sms.split("[le lien propre au client]").join(REAL_LINK)).toBe(sent.sms);
  });

  it.each(["en-US", "es-MX", "fr-CA"] as const)(
    "previews the %s notice as it is sent",
    async (locale) => {
      const o = outcome(locale, { message: null });
      const sent = await sentFor(o);
      const preview = previewOf(o);
      expect(preview.email.subject).toBe(sent.email.subject);
      expect(preview.email.text).toBe(plain(sent.email.html));
      // Whatever stands in for the link, nothing else differs.
      const withLink = preview.sms.replace(/\[[^\]]+\]/, REAL_LINK);
      expect(withLink).toBe(sent.sms);
    }
  );

  it("words the same booking differently for each language", async () => {
    const [en, es, fr] = await Promise.all(
      (["en-US", "es-MX", "fr-CA"] as const).map((l) => sentFor(outcome(l)))
    );
    expect(new Set([en!.sms, es!.sms, fr!.sms]).size).toBe(3);
    expect(new Set([en!.email.subject, es!.email.subject, fr!.email.subject]).size).toBe(3);
    expect(es!.email.subject).toContain("Se canceló tu reservación");
    expect(en!.email.subject).toContain("is cancelled");
  });

  it.each(["es-MX", "fr-CA"] as const)(
    "keeps the %s SMS to GSM-7 segments with the real link",
    async (l) => {
      const { sms } = await sentFor(outcome(l, { message: null }));
      // eslint-disable-next-line no-control-regex
      expect(/^[\x00-\x7F£¥èéùìòÇØøÅåÆæßÉ¤¡ÄÖÑÜ§¿äöñüà€]*$/.test(sms)).toBe(true);
      expect(smsSegments(sms)).toBeLessThanOrEqual(3);
      expect(sms).toContain(REAL_LINK);
    }
  );
});
