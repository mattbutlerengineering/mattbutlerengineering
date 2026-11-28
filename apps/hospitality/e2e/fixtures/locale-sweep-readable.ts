/**
 * Whether an en-US catalog value carries enough literal English for the locale
 * sweep to treat a match as leftover copy. `{{placeholders}}` become `.+?` in the
 * sweep's matcher, so a value whose only literal text is a short connector
 * ("{{from}} to {{to}}", "{{current}} of {{total}}") matches arbitrary prose
 * (an HTML comment in the embed snippet) and says nothing about translation.
 */
export const MIN_LITERAL_LETTERS = 3;

const PLACEHOLDER = /\{\{\w+\}\}/g;

/**
 * Placeholders the catalog only ever interpolates an integer into (checked at every call site:
 * a 1-based row or service index, a count of seconds/minutes/hours, a table count). They match
 * `\d+`, not `.+?`: a wildcard there lets a template whose literal is a French cognate
 * ("Date {{n}}: {{name}}") swallow unrelated fr-CA prose that starts with "Date" and holds a
 * colon (#10170). `Date 1: Lunch` still matches, so a real en-US leak is still caught.
 * Add a name here only after confirming every caller passes a number.
 */
const NUMERIC_PLACEHOLDERS: ReadonlySet<string> = new Set(["n"]);

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** A catalog value as a full-text matcher; non-numeric `{{placeholders}}` match any run of text. */
export function matcherFor(value: string): RegExp {
  const source = normalize(value)
    .split(/(\{\{\w+\}\})/)
    .map((part) => {
      const name = /^\{\{(\w+)\}\}$/.exec(part)?.[1];
      if (name === undefined) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return NUMERIC_PLACEHOLDERS.has(name) ? "\\d+" : ".+?";
    })
    .join("");
  return new RegExp(`^${source}$`);
}

export function hasReadableLiteral(value: string): boolean {
  const letters = value.replace(PLACEHOLDER, "").match(/\p{L}/gu);
  return (letters?.length ?? 0) >= MIN_LITERAL_LETTERS;
}
