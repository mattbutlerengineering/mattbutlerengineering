/**
 * Character sets supported by the SplitFlap display.
 *
 * Each set is an ordered string; cells cycle forward through the set when
 * transitioning from one character to another, matching the mechanical
 * behavior of a real Solari board (which can only advance, never rewind).
 */

const ALPHA = " ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUMERIC = " 0123456789";
const ALPHANUMERIC = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const FULL = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-/:";

export const CHARSETS = {
  alpha: ALPHA,
  numeric: NUMERIC,
  alphanumeric: ALPHANUMERIC,
  full: FULL,
} as const;

export type CharsetName = keyof typeof CHARSETS;

/**
 * Normalize arbitrary input to a character present in the selected charset.
 * Characters not in the charset become space. Letters are upper-cased.
 */
export function normalizeChar(raw: string, charset: string): string {
  const upper = raw.toUpperCase();
  return charset.includes(upper) ? upper : " ";
}

/**
 * Advance one step forward in the charset, wrapping at the end.
 */
export function nextChar(current: string, charset: string): string {
  const idx = charset.indexOf(current);
  if (idx < 0) return charset[0] ?? " ";
  return charset[(idx + 1) % charset.length] ?? " ";
}
