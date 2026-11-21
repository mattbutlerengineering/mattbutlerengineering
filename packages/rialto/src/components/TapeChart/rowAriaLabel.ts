/**
 * Accessible name for a list/stack reservation row (WCAG 2.5.3 Label in Name).
 * The name leads with the visible words in visible order; context that is not
 * on screen (the date range) follows.
 */
export function buildRowAriaLabel(
  visibleParts: ReadonlyArray<string | null | undefined | false>,
  dateSpan: string
): string {
  const visible = visibleParts.filter((p): p is string => Boolean(p));
  return [...visible, dateSpan].join(", ");
}
