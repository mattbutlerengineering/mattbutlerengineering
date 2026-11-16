/**
 * Text colour for a lap-delta cell. Plain `--rialto-error` on the striped row
 * background (#edeae5) is 4.28:1, below WCAG AA 4.5:1, so negative deltas
 * mix 20% of `--rialto-text-primary` into the error hue (~5.4:1).
 */
const ERROR_TEXT_COLOR = "color-mix(in srgb, var(--rialto-error) 80%, var(--rialto-text-primary))";

export function deltaColor(delta: number): string {
  if (delta > 0) return "var(--rialto-success)";
  if (delta < 0) return ERROR_TEXT_COLOR;
  return "var(--rialto-text-tertiary)";
}
