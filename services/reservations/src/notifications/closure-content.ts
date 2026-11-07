import type { GuestNoticeLocale } from "@mbe/types";
import { closureCatalog, type ClosureCatalog, type DateParts } from "./closure-catalogs/index.js";
import { escapeHtml, sanitizeUrl } from "./sanitize.js";
import { toVenueLocalTime } from "./venue-time.js";

/**
 * Closure notice builders (docs/features/venue-availability/ux.md F10): the one
 * place the cancelled / moved / kept / reopened email and SMS are assembled.
 * The wording lives in `./closure-catalogs`, one per guest language; the
 * notice job and Step 2's preview both render through here, so they cannot
 * drift. Pure: the caller supplies the manage and rebook links already built.
 */

export type ClosureNoticeKind = "cancelled" | "moved" | "kept" | "reopened";

export interface ClosureOffer {
  /** Guest-facing label, e.g. "Wed 23 7:00 PM". */
  label: string;
  /** One-tap rebook link for this time. */
  url: string;
}

export interface ClosureNoticeContent {
  kind: ClosureNoticeKind;
  /** The language the guest booked in; the notice is worded, dated and priced in it. */
  locale: GuestNoticeLocale;
  venueName: string;
  guestName: string | null;
  /** Venue-local service date the closure affects, "YYYY-MM-DD". */
  closureDate: string;
  /** ISO instant of the booking as it stands now (the new time, for a move). */
  startTime: string;
  timezone: string;
  partySize: number;
  /** The venue's guest message for the closure. */
  message: string | null;
  /** The deposit a cancel refunds. */
  refund: { amountCents: number; currency: string } | null;
  manageUrl: string;
  offers: readonly ClosureOffer[];
}

const MAX_SMS_SEGMENTS = 3;

// GSM 03.38 basic set; the extension set costs two septets each.
const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);
const GSM_EXTENSION = new Set("^{}\\[~]|€\f");

// Typographic punctuation venues paste in, mapped to GSM-7 look-alikes. One of
// these left in flips the whole body to UCS-2 (70/67 per segment).
const GSM_LOOKALIKES: Readonly<Record<string, string>> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00A0": " ",
  "\u202F": " ",
};
const LOOKALIKE = /[\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u00A0\u202F]/g;

/** Replaces common typographic punctuation with its GSM-7 equivalent. */
function toGsm(text: string): string {
  return text.replace(LOOKALIKE, (ch) => GSM_LOOKALIKES[ch]!);
}

const isGsm = (ch: string): boolean => GSM_BASIC.has(ch) || GSM_EXTENSION.has(ch);

/**
 * Accented letters GSM-7 lacks (á, ê, ç …) become their plain letters, so French and Spanish keep
 * the 160/153-per-segment budget instead of flipping to UCS-2 (70/67). Characters with no plain
 * form (an emoji) are left for the venue-name handling to drop.
 */
function foldToGsm(text: string): string {
  return [...text]
    .map((ch) => {
      if (isGsm(ch)) return ch;
      const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
      return [...base].every(isGsm) ? base : ch;
    })
    .join("");
}

/** Billable SMS segments for a body: GSM-7 (160/153) or UCS-2 (70/67). */
export function smsSegments(body: string): number {
  let septets = 0;
  let gsm = true;
  for (const ch of body) {
    if (GSM_BASIC.has(ch)) septets += 1;
    else if (GSM_EXTENSION.has(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  const units = gsm ? septets : body.length;
  const [single, multi] = gsm ? [160, 153] : [70, 67];
  return units <= single ? 1 : Math.ceil(units / multi);
}

/** The civil date's parts in the catalog's language, as plain, period-free text. */
function civilParts(date: string, catalog: ClosureCatalog): DateParts {
  const instant = new Date(`${date}T12:00:00.000Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    plainSpaces(
      // Abbreviations lose their period ("déc." → "déc"): a sentence's own period follows.
      new Intl.DateTimeFormat(catalog.intl, { timeZone: "UTC", ...opts })
        .format(instant)
        .replace(/\./g, "")
    );
  return {
    weekday: part({ weekday: "short" }),
    month: part({ month: "short" }),
    day: instant.getUTCDate(),
  };
}

/** No-break spaces are not GSM-7 and flip a whole SMS to UCS-2. */
function plainSpaces(text: string): string {
  return text.replace(/[\u00A0\u202F]/g, " ");
}

/** The venue-local clock time as this guest's language writes it. */
function clockOf(instant: string, timezone: string, fallbackDate: string, catalog: ClosureCatalog) {
  const [hour, minute] = toVenueLocalTime(instant, timezone, fallbackDate).time.split(":");
  return catalog.clock(Number(hour), Number(minute));
}

/** "Wed 23 7:00 PM", for a rebook offer's slot start. */
export function offerLabel(start: Date, timezone: string, locale: GuestNoticeLocale): string {
  const catalog = closureCatalog(locale);
  const when = toVenueLocalTime(start.toISOString(), timezone, "");
  return `${catalog.offerDay(civilParts(when.date, catalog))} ${clockOf(start.toISOString(), timezone, "", catalog)}`;
}

/** A refund of nothing is no refund: never worded as "$0 deposit will be refunded". */
const promisesRefund = (c: ClosureNoticeContent): boolean =>
  c.refund !== null && c.refund.amountCents > 0;

function money(refund: { amountCents: number; currency: string }, catalog: ClosureCatalog): string {
  const whole = refund.amountCents % 100 === 0;
  return plainSpaces(
    new Intl.NumberFormat(catalog.intl, {
      style: "currency",
      currency: refund.currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(refund.amountCents / 100)
  );
}

function timeOf(c: ClosureNoticeContent): string {
  return clockOf(c.startTime, c.timezone, c.closureDate, closureCatalog(c.locale));
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

// ── SMS ─────────────────────────────────────────────────────────────────────

/** The date, time and party every wording of one notice states. */
function facts(c: ClosureNoticeContent, catalog: ClosureCatalog) {
  return {
    venue: c.venueName,
    date: catalog.shortDate(civilParts(c.closureDate, catalog)),
    time: timeOf(c),
    party: c.partySize,
  };
}

function refundText(c: ClosureNoticeContent, catalog: ClosureCatalog): string | null {
  return c.refund && promisesRefund(c) ? money(c.refund, catalog) : null;
}

function cancelledSms(c: ClosureNoticeContent, offers: readonly ClosureOffer[]): string {
  const catalog = closureCatalog(c.locale);
  const head = catalog.sms.cancelled({ ...facts(c, catalog), refund: refundText(c, catalog) });
  const times = offers.map((o) => `${o.label} ${o.url}`);
  if (times.length === 0) return `${head}${catalog.sms.rebookNone(c.manageUrl)}`;
  if (times.length === 1) return `${head}${catalog.sms.rebookOne(times[0]!)}`;
  return `${head}${catalog.sms.rebookMany(times, c.manageUrl)}`;
}

function movedSms(c: ClosureNoticeContent): string {
  const catalog = closureCatalog(c.locale);
  return catalog.sms.moved({ ...facts(c, catalog), url: c.manageUrl });
}

function keptSms(c: ClosureNoticeContent, withMessage: boolean): string {
  const catalog = closureCatalog(c.locale);
  const { party: _party, ...rest } = facts(c, catalog);
  return catalog.sms.kept({
    ...rest,
    note: withMessage && c.message ? c.message : null,
    url: c.manageUrl,
  });
}

function reopenedSms(c: ClosureNoticeContent): string {
  const catalog = closureCatalog(c.locale);
  return catalog.sms.reopened({
    date: catalog.shortDate(civilParts(c.closureDate, catalog)),
    venue: c.venueName,
    url: c.manageUrl,
  });
}

/** Candidate bodies, richest first; the first within 3 segments is sent. */
function smsCandidates(c: ClosureNoticeContent): string[] {
  switch (c.kind) {
    case "cancelled":
      return [3, 2, 1, 0].map((n) => cancelledSms(c, c.offers.slice(0, n)));
    case "moved":
      return [movedSms(c)];
    case "kept":
      return [keptSms(c, true), keptSms(c, false)];
    case "reopened":
      return [reopenedSms(c)];
  }
}

const SHORT_VENUE_NAME = 20;

/**
 * The venue name as sent, best first: typographic punctuation made GSM, then
 * any remaining non-GSM character (an emoji) dropped, then shortened.
 */
function venueNameVariants(name: string): string[] {
  const gsm = toGsm(name);
  const stripped = [...gsm].filter(isGsm).join("").replace(/ {2,}/g, " ").trim();
  const short = stripped.slice(0, SHORT_VENUE_NAME).trim();
  return [...new Set([gsm, stripped, short])].filter((n, i) => i === 0 || n !== "");
}

/**
 * The SMS body. The links are never cut (a cut link is a dead link): an
 * over-long body falls back to fewer offers or a dropped venue message, then
 * a GSM-only or shortened venue name, and the shortest form is sent whole if
 * even that overflows.
 */
export function buildClosureSms(c: ClosureNoticeContent): string {
  const content = { ...c, message: c.message === null ? null : toGsm(c.message) };
  const perName = venueNameVariants(c.venueName).map((venueName) =>
    smsCandidates({ ...content, venueName })
  );
  // Each richer form is tried with every name before a poorer form is.
  const candidates = perName[0]!.flatMap((_, i) => perName.map((bodies) => bodies[i]!));
  const bodies = candidates.map(foldToGsm);
  return bodies.find((body) => smsSegments(body) <= MAX_SMS_SEGMENTS) ?? bodies[bodies.length - 1]!;
}

// ── Email ───────────────────────────────────────────────────────────────────

function emailSubject(c: ClosureNoticeContent): string {
  const catalog = closureCatalog(c.locale);
  const date = catalog.emailDate(civilParts(c.closureDate, catalog));
  const subject = catalog.email.subject[c.kind];
  return subject(c.venueName, date);
}

function link(url: string, text: string): string {
  const safe = sanitizeUrl(url);
  return safe ? `<a href="${escapeHtml(safe)}">${escapeHtml(text)}</a>` : "";
}

function emailLines(c: ClosureNoticeContent): string[] {
  const catalog = closureCatalog(c.locale);
  const copy = catalog.email;
  const venue = escapeHtml(c.venueName);
  const date = catalog.emailDate(civilParts(c.closureDate, catalog));
  const f = { venue, date, time: timeOf(c), party: c.partySize };
  const message = c.message ? [`<p>${escapeHtml(c.message)}</p>`] : [];
  switch (c.kind) {
    case "cancelled": {
      const amount = refundText(c, catalog);
      const refund = amount ? [`<p>${copy.cancelled.refund(escapeHtml(amount))}</p>`] : [];
      const offers = c.offers.map((o) => `<p>${link(o.url, copy.cancelled.offer(o.label))}</p>`);
      return [
        `<h1>${copy.cancelled.title}</h1>`,
        `<p>${copy.cancelled.body(f)}</p>`,
        ...message,
        ...refund,
        ...offers,
        `<p>${link(c.manageUrl, copy.cancelled.other)}</p>`,
      ];
    }
    case "moved":
      return [
        `<h1>${copy.moved.title}</h1>`,
        `<p>${copy.moved.body(f)}</p>`,
        ...message,
        `<p>${copy.moved.cancel((text) => link(c.manageUrl, text))}</p>`,
      ];
    case "kept":
      return [
        `<h1>${copy.kept.title}</h1>`,
        `<p>${copy.kept.body(f)}</p>`,
        ...message,
        `<p>${link(c.manageUrl, copy.kept.manage)}</p>`,
      ];
    case "reopened":
      return [
        `<h1>${copy.reopened.title}</h1>`,
        `<p>${copy.reopened.body(venue, date)}</p>`,
        `<p>${link(c.manageUrl, copy.reopened.rebook)}</p>`,
      ];
  }
}

export function buildClosureEmail(c: ClosureNoticeContent): { subject: string; html: string } {
  const greeting = firstName(c.guestName);
  const hello = greeting
    ? [`<p>${closureCatalog(c.locale).email.hello(escapeHtml(greeting))}</p>`]
    : [];
  return {
    subject: emailSubject(c),
    html: [...hello, ...emailLines(c)].join("\n"),
  };
}
