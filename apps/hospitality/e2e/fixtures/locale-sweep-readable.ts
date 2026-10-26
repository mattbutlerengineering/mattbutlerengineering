/**
 * Whether an en-US catalog value carries enough literal English for the locale
 * sweep to treat a match as leftover copy. `{{placeholders}}` become `.+?` in the
 * sweep's matcher, so a value whose only literal text is a short connector
 * ("{{from}} to {{to}}", "{{current}} of {{total}}") matches arbitrary prose
 * (an HTML comment in the embed snippet) and says nothing about translation.
 */
export const MIN_LITERAL_LETTERS = 3;

const PLACEHOLDER = /\{\{\w+\}\}/g;

export function hasReadableLiteral(value: string): boolean {
  const letters = value.replace(PLACEHOLDER, "").match(/\p{L}/gu);
  return (letters?.length ?? 0) >= MIN_LITERAL_LETTERS;
}
