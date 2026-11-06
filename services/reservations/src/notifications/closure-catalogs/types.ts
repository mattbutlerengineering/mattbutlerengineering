import type { GuestNoticeLocale } from "@mbe/types";

/**
 * One language's closure notice copy (docs/features/venue-availability/ux.md F10). The builders in
 * `../closure-content.ts` pick the facts and the layout; a catalog only words them. The values it
 * is handed for the email are already HTML-escaped; for the SMS they are plain text.
 *
 * SMS wording stays inside GSM 03.38 once accents are folded (see `foldToGsm`), so a guest's
 * message is billed as 7-bit segments and the signed links are never cut.
 */

/** The civil parts of a service date, in this catalog's language. */
export interface DateParts {
  weekday: string;
  /** Month name, abbreviated. */
  month: string;
  day: number;
}

export interface NoticeFacts {
  venue: string;
  /** "Thu Dec 24" in this language; the email's date is {@link ClosureCatalog.emailDate}. */
  date: string;
  time: string;
  party: number;
}

export interface ClosureCatalog {
  readonly locale: GuestNoticeLocale;
  /** `Intl` locale used for date and money formatting. */
  readonly intl: string;
  /** "Thu Dec 24" */
  shortDate(p: DateParts): string;
  /** "Thu, Dec 24" */
  emailDate(p: DateParts): string;
  /** "Wed 23", for a rebook offer's label; the clock follows. */
  offerDay(p: DateParts): string;
  /** Guest-facing clock time from venue-local 24h hour and minute, e.g. "7:00 PM". */
  clock(hour: number, minute: number): string;
  /** Stands where the guest's own link goes in a preview: the link is only made when a notice is sent. */
  readonly previewLink: string;
  readonly sms: {
    cancelled(f: NoticeFacts & { refund: string | null }): string;
    rebookNone(url: string): string;
    rebookOne(offer: string): string;
    rebookMany(offers: readonly string[], url: string): string;
    moved(f: NoticeFacts & { url: string }): string;
    kept(f: Omit<NoticeFacts, "party"> & { note: string | null; url: string }): string;
    reopened(f: { date: string; venue: string; url: string }): string;
  };
  readonly email: {
    subject: {
      cancelled(venue: string, date: string): string;
      moved(venue: string, date: string): string;
      kept(venue: string, date: string): string;
      reopened(venue: string, date: string): string;
    };
    /** "Hi Maria," */
    hello(name: string): string;
    readonly cancelled: {
      title: string;
      body(f: NoticeFacts): string;
      refund(amount: string): string;
      offer(label: string): string;
      other: string;
    };
    readonly moved: {
      title: string;
      body(f: NoticeFacts): string;
      /** Wraps the link; `link` is the anchor that says "Cancel free". */
      cancel(link: (text: string) => string): string;
    };
    readonly kept: {
      title: string;
      body(f: NoticeFacts): string;
      manage: string;
    };
    readonly reopened: {
      title: string;
      body(venue: string, date: string): string;
      rebook: string;
    };
  };
}
