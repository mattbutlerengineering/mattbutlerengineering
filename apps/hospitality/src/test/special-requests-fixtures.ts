/**
 * Shared Special Requests fixtures (remembered-on-arrival architecture
 * § Test strategy). Every surface test runs the same inputs.
 */

/** Two lines, padded at both ends. Displayed as `TWO_LINE_DISPLAYED`. */
export const TWO_LINE_NOTE =
  "  Our anniversary.\nWindow seat if you can, and she can't have tree nuts.  \n";
export const TWO_LINE_DISPLAYED =
  "Our anniversary.\nWindow seat if you can, and she can't have tree nuts.";

/** Guest text that would become markup if it were ever rendered as HTML. */
export const UNTRUSTED_NOTE = `<script>alert(1)</script>\n<a href="https://x">x</a> &amp; "double" 'single'`;

/** Notes that must render no Special Requests block anywhere. */
export const EMPTY_NOTES: readonly (string | null)[] = [null, "", "   ", "\n\t "];
