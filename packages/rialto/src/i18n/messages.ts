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
  /** Accessible name of the Dialog close button. */
  readonly closeDialog: string;
  /** Fallback accessible name of a Dialog with no title. */
  readonly dialog: string;
  /** Fallback accessible name of a Drawer with no title. */
  readonly drawer: string;
  /** Fallback accessible name of a Popover with no title. */
  readonly popover: string;
  /** Accessible name of a HoverCard's preview surface. */
  readonly preview: string;
  /** Accessible name of the Toast region. */
  readonly notifications: string;
  /** Default ConfirmDialog confirm button label. */
  readonly confirm: string;
  /** Default ConfirmDialog cancel button label. */
  readonly cancel: string;
}

export const enUS: RialtoMessages = {
  dismiss: "Dismiss",
  close: "Close",
  closeDialog: "Close dialog",
  dialog: "Dialog",
  drawer: "Drawer",
  popover: "Popover",
  preview: "Preview",
  notifications: "Notifications",
  confirm: "Confirm",
  cancel: "Cancel",
};
