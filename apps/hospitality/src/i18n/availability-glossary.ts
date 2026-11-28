/**
 * Availability glossary (availability-hub PRD criterion 12): one label per concept and the words
 * that label retires. The source is the terms line of docs/features/availability-hub/ux.md.
 * `availability-glossary.test.ts` runs `checkAvailabilityGlossary` over the real catalogs.
 */

type Catalog = Readonly<Record<string, unknown>>;

/** en-US is the source; es-MX and fr-CA carry every key; en-GB holds only its overrides. */
export type GlossaryCatalogs = Readonly<Record<"en-US" | "es-MX" | "fr-CA" | "en-GB", Catalog>>;

interface GlossaryEntry {
  readonly concept: string;
  /** The one en-US label for the concept. */
  readonly term: string;
  /**
   * en-US words this label replaces. Matched as whole words, whatever the case; a space also
   * matches a hyphen ("regular-week").
   */
  readonly retired: readonly string[];
}

export const AVAILABILITY_GLOSSARY: readonly GlossaryEntry[] = [
  {
    concept: "The weekly pattern",
    term: "Regular hours",
    retired: ["Regular week", "Regular weeks"],
  },
  {
    concept: "Named hours that replace the weekly pattern on the dates they cover",
    term: "Seasonal hours",
    retired: ["Schedule", "Schedules"],
  },
  {
    concept: "A date that differs from the hours that cover it",
    term: "Special date",
    retired: [],
  },
  { concept: "The hours a special date runs", term: "Special hours", retired: [] },
  { concept: "Dates the venue or a section takes no guests", term: "Closure", retired: [] },
  {
    concept: "Stop taking guests before the day's hours end",
    term: "Close early",
    retired: ["Starting at"],
  },
  { concept: "Online booking stopped for a while", term: "Pause", retired: [] },
  { concept: "End a closure", term: "Reopen", retired: [] },
  { concept: "End a pause", term: "Resume", retired: [] },
  {
    concept: "Take back a saved change",
    term: "Undo",
    retired: ["Revert", "Reverted", "Reverting"],
  },
  { concept: "How guests book a service", term: "Booked by", retired: [] },
  { concept: "The dates an edit covers", term: "Applies to", retired: [] },
  { concept: "The hub's date field", term: "Check a date", retired: [] },
  { concept: "The month screen", term: "Calendar", retired: [] },
];

/**
 * The top-level catalog sections the glossary governs. `availabilityHub` holds the hub's new
 * strings; a section a catalog does not have yet contributes no keys.
 */
export const AVAILABILITY_NAMESPACES: readonly string[] = [
  "availability",
  "availabilityHub",
  "availabilityExplain",
  "availabilitySchedules",
  "availabilitySpecial",
];

/**
 * en-US keys that still use a retired word. The list only shrinks: a key that stops using a
 * retired word must leave it, and the rename step (breakdown P6.1) empties it.
 */
export const LEGACY_KEYS: ReadonlySet<string> = new Set<string>();

interface GlossaryProblem {
  readonly kind: "retired-word" | "missing-key" | "stale-legacy-key";
  readonly locale: keyof GlossaryCatalogs;
  readonly key: string;
  /** The retired word found, as the glossary spells it; empty for the other kinds. */
  readonly detail: string;
}

function leaves(node: unknown, path: string): readonly (readonly [string, string])[] {
  if (typeof node === "string") return [[path, node]];
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
}

/** Every string under the availability namespaces, as [dotted key, value]. */
function scoped(catalog: Catalog): readonly (readonly [string, string])[] {
  return AVAILABILITY_NAMESPACES.flatMap((namespace) => leaves(catalog[namespace], namespace));
}

/** A whole-word, any-case pattern for a retired word; its spaces also match hyphens. */
function retiredPattern(word: string): RegExp {
  const parts = word.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b${parts.join("[\\s-]+")}\\b`, "i");
}

const RETIRED: readonly (readonly [string, RegExp])[] = AVAILABILITY_GLOSSARY.flatMap(
  ({ retired }) => retired
).map((word) => [word, retiredPattern(word)]);

/** The first retired word in a value. A `{{placeholder}}` name is never shown, so it is skipped. */
function retiredWordIn(value: string): string | undefined {
  const shown = value.replace(/\{\{[^}]*\}\}/g, " ");
  return RETIRED.find(([, pattern]) => pattern.test(shown))?.[0];
}

function retiredWordProblems(
  locale: keyof GlossaryCatalogs,
  catalog: Catalog,
  legacyKeys: ReadonlySet<string>
): readonly GlossaryProblem[] {
  return scoped(catalog).flatMap(([key, value]) => {
    const word = legacyKeys.has(key) ? undefined : retiredWordIn(value);
    return word === undefined ? [] : [{ kind: "retired-word", locale, key, detail: word }];
  });
}

/**
 * Checks the catalogs against the glossary. A problem is: a retired word in an en-US or en-GB
 * value under the availability namespaces whose key is not in `legacyKeys`; an en-US key there
 * that es-MX or fr-CA lacks; or a `legacyKeys` entry whose en-US value no longer needs it.
 */
export function checkAvailabilityGlossary(
  catalogs: GlossaryCatalogs,
  legacyKeys: ReadonlySet<string>
): readonly GlossaryProblem[] {
  const source = scoped(catalogs["en-US"]);

  const missing = (["es-MX", "fr-CA"] as const).flatMap((locale) => {
    const present = new Set(scoped(catalogs[locale]).map(([key]) => key));
    return source
      .filter(([key]) => !present.has(key))
      .map(([key]): GlossaryProblem => ({ kind: "missing-key", locale, key, detail: "" }));
  });

  const stillRetired = new Set(
    source.filter(([, value]) => retiredWordIn(value) !== undefined).map(([key]) => key)
  );
  const stale = [...legacyKeys]
    .filter((key) => !stillRetired.has(key))
    .map((key): GlossaryProblem => ({
      kind: "stale-legacy-key",
      locale: "en-US",
      key,
      detail: "",
    }));

  return [
    ...retiredWordProblems("en-US", catalogs["en-US"], legacyKeys),
    ...missing,
    ...retiredWordProblems("en-GB", catalogs["en-GB"], legacyKeys),
    ...stale,
  ];
}
