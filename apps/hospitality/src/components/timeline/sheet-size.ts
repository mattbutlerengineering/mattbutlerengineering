import { specialRequestsText } from "../../utils/reservation-display.js";

export type ReservationSheetSize = "compact" | "default";

/**
 * The tablet sheet's height, from the same two inputs everywhere: it opens at
 * the default height when More ▾ is open or the party has Special Requests
 * (shown above the actions), and compact otherwise. The sheet's Drawer `size`
 * and the grid's `bottomInset` both read this, so they cannot disagree.
 */
export function reservationSheetSize(
  notes: string | null | undefined,
  expanded: boolean
): ReservationSheetSize {
  return expanded || specialRequestsText(notes) !== null ? "default" : "compact";
}

/**
 * rialto's bottom Drawer heights for each size (`Drawer.module.css` `.bottom`
 * and `.compact.bottom`), as CSS lengths for the grid's scroll padding. A px
 * table cannot be right: the default sheet is 384 px tall at 1024×768 and
 * 480 px at 768×1024. Mirrored by hand and pinned by `sheet-size.test.ts`.
 */
export const SHEET_BLOCK_SIZE: Readonly<Record<ReservationSheetSize, string>> = Object.freeze({
  compact: "min(40vh, 240px)",
  default: "min(50vh, 480px)",
});
