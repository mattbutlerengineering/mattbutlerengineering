/**
 * Every user-visible string Rialto renders by itself, as one typed dictionary
 * (ADR-028). en-US is the inline default; other locales ship as their own
 * subpath modules typed `RialtoMessages`, so a missing key fails typecheck.
 *
 * Keys are added as components migrate onto `useRialtoLocale()` — each new key
 * lands with its value in every locale module. Interpolated entries are
 * functions, e.g. `removeItem: (label: string) => string`.
 */
export interface RialtoMessages {
  /** Accessible name of a control that dismisses a notice (Alert, Banner, Toast). */
  readonly dismiss: string;
  /** Accessible name of a control that closes a surface (Drawer, Popover). */
  readonly close: string;
}

export const enUS: RialtoMessages = {
  dismiss: "Dismiss",
  close: "Close",
};
