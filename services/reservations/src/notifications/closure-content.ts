import { escapeHtml, sanitizeUrl } from "./sanitize.js";
import { toVenueLocalTime } from "./venue-time.js";

/**
 * Closure notice copy (docs/features/venue-availability/ux.md F10): the one
 * place the cancelled / moved / kept / reopened email and SMS are worded.
 * Pure: the caller supplies the manage and rebook links already built.
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

function civilParts(date: string): { weekday: string; month: string; day: number } {
  const instant = new Date(`${date}T12:00:00.000Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(instant);
  return {
    weekday: part({ weekday: "short" }),
    month: part({ month: "short" }),
    day: instant.getUTCDate(),
  };
}

/** "Thu Dec 24" */
function shortDate(date: string): string {
  const p = civilParts(date);
  return `${p.weekday} ${p.month} ${p.day}`;
}

/** "Thu, Dec 24" */
function emailDate(date: string): string {
  const p = civilParts(date);
  return `${p.weekday}, ${p.month} ${p.day}`;
}

/** "Wed 23 7:00 PM", for a rebook offer's slot start. */
export function offerLabel(start: Date, timezone: string): string {
  const when = toVenueLocalTime(start.toISOString(), timezone, "");
  const p = civilParts(when.date);
  return `${p.weekday} ${p.day} ${when.display}`;
}

function money(refund: { amountCents: number; currency: string }): string {
  const whole = refund.amountCents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: refund.currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(refund.amountCents / 100);
}

function timeOf(c: ClosureNoticeContent): string {
  return toVenueLocalTime(c.startTime, c.timezone, c.closureDate).display;
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

// ── SMS ─────────────────────────────────────────────────────────────────────

function cancelledSms(c: ClosureNoticeContent, offers: readonly ClosureOffer[]): string {
  const refund = c.refund ? ` ${money(c.refund)} deposit will be refunded.` : "";
  const head = `${c.venueName} is closed ${shortDate(c.closureDate)}. Your ${timeOf(c)} table for ${c.partySize} is cancelled.${refund}`;
  const times = offers.map((o) => `${o.label} ${o.url}`);
  if (times.length === 0) return `${head} Rebook: ${c.manageUrl}`;
  if (times.length === 1) return `${head} Rebook ${times[0]}`;
  return `${head} Rebook in one tap:\n${[...times, `Other times ${c.manageUrl}`].join("\n")}`;
}

function movedSms(c: ClosureNoticeContent): string {
  return `${c.venueName} has changed its hours on ${shortDate(c.closureDate)}. Your table for ${c.partySize} is now at ${timeOf(c)}. Can't make it? Cancel free: ${c.manageUrl}`;
}

function keptSms(c: ClosureNoticeContent, withMessage: boolean): string {
  const note = withMessage && c.message ? `: ${c.message}` : "";
  return `${c.venueName} has changed its hours on ${shortDate(c.closureDate)}${note}. Your ${timeOf(c)} table is still booked. Manage: ${c.manageUrl}`;
}

function reopenedSms(c: ClosureNoticeContent): string {
  return `We've reopened ${shortDate(c.closureDate)} at ${c.venueName}. Rebook: ${c.manageUrl}`;
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
  return (
    candidates.find((body) => smsSegments(body) <= MAX_SMS_SEGMENTS) ??
    candidates[candidates.length - 1]!
  );
}

// ── Email ───────────────────────────────────────────────────────────────────

function emailSubject(c: ClosureNoticeContent): string {
  const date = emailDate(c.closureDate);
  switch (c.kind) {
    case "cancelled":
      return `Your reservation at ${c.venueName} on ${date} is cancelled`;
    case "moved":
      return `Your reservation at ${c.venueName} on ${date} has moved`;
    case "kept":
      return `Update about your reservation at ${c.venueName} on ${date}`;
    case "reopened":
      return `${c.venueName} has reopened on ${date}`;
  }
}

function link(url: string, text: string): string {
  const safe = sanitizeUrl(url);
  return safe ? `<a href="${escapeHtml(safe)}">${escapeHtml(text)}</a>` : "";
}

function emailLines(c: ClosureNoticeContent): string[] {
  const venue = escapeHtml(c.venueName);
  const date = emailDate(c.closureDate);
  const message = c.message ? [`<p>${escapeHtml(c.message)}</p>`] : [];
  switch (c.kind) {
    case "cancelled": {
      const refund = c.refund
        ? [`<p>Your ${escapeHtml(money(c.refund))} deposit will be refunded.</p>`]
        : [];
      const offers = c.offers.map((o) => `<p>${link(o.url, `Rebook ${o.label}`)}</p>`);
      return [
        `<h1>Your reservation is cancelled</h1>`,
        `<p>${venue} is closed on ${date}. Your ${timeOf(c)} table for ${c.partySize} is cancelled.</p>`,
        ...message,
        ...refund,
        ...offers,
        `<p>${link(c.manageUrl, "Other dates and times")}</p>`,
      ];
    }
    case "moved":
      return [
        `<h1>Your reservation has moved</h1>`,
        `<p>${venue} has changed its hours on ${date}. Your table for ${c.partySize} is now at ${timeOf(c)}.</p>`,
        ...message,
        `<p>Can't make it? ${link(c.manageUrl, "Cancel free")}</p>`,
      ];
    case "kept":
      return [
        `<h1>Your reservation is still on</h1>`,
        `<p>${venue} has changed its hours on ${date}. Your ${timeOf(c)} table is still booked.</p>`,
        ...message,
        `<p>${link(c.manageUrl, "Manage your reservation")}</p>`,
      ];
    case "reopened":
      return [
        `<h1>We've reopened</h1>`,
        `<p>${venue} has reopened on ${date}.</p>`,
        `<p>${link(c.manageUrl, "Rebook")}</p>`,
      ];
  }
}

export function buildClosureEmail(c: ClosureNoticeContent): { subject: string; html: string } {
  const greeting = firstName(c.guestName);
  const hello = greeting ? [`<p>Hi ${escapeHtml(greeting)},</p>`] : [];
  return {
    subject: emailSubject(c),
    html: [...hello, ...emailLines(c)].join("\n"),
  };
}
