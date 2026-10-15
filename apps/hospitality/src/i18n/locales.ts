/**
 * The locales hospitality supports, and the rule for choosing one.
 *
 * A locale is language + region: it decides text and the *format* of dates,
 * times, numbers and money. Currency and timezone always come from the venue,
 * never from here. Pure — no i18next, no browser access; callers pass in what
 * they read from storage and `navigator.languages`.
 */

export type LocaleTag = "en-US" | "en-GB" | "es-MX" | "fr-CA";

export interface SupportedLocale {
  readonly tag: LocaleTag;
  /** The locale's name in its own language — what the picker shows. */
  readonly endonym: string;
  /** Text was machine-generated; the picker discloses this. */
  readonly machineTranslated: boolean;
}

export const DEFAULT_LOCALE: LocaleTag = "en-US";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  { tag: "en-US", endonym: "English (US)", machineTranslated: false },
  { tag: "en-GB", endonym: "English (UK)", machineTranslated: false },
  { tag: "es-MX", endonym: "Español (México)", machineTranslated: true },
  { tag: "fr-CA", endonym: "Français (Canada)", machineTranslated: true },
];

/** The one supported locale each language falls back to when its region isn't supported. */
const LANGUAGE_FALLBACK: Readonly<Record<string, LocaleTag>> = {
  en: "en-US",
  es: "es-MX",
  fr: "fr-CA",
};

function parse(tag: string): Intl.Locale | null {
  try {
    return new Intl.Locale(tag);
  } catch {
    return null;
  }
}

function exactMatch(tag: string): LocaleTag | null {
  const locale = parse(tag);
  if (!locale) return null;
  const normalized = `${locale.language}-${locale.region ?? ""}`;
  return SUPPORTED_LOCALES.find((l) => l.tag === normalized)?.tag ?? null;
}

function matchOne(tag: string): LocaleTag | null {
  const exact = exactMatch(tag);
  if (exact) return exact;
  const language = parse(tag)?.language;
  return language ? (LANGUAGE_FALLBACK[language] ?? null) : null;
}

/**
 * Choose the locale to show: a valid stored choice wins; otherwise the first
 * browser preference that matches a supported locale exactly or by language;
 * otherwise en-US. Never throws.
 */
export function resolveLocale({
  stored,
  browser,
}: {
  stored: string | null;
  browser: readonly string[];
}): LocaleTag {
  const fromStorage = stored ? exactMatch(stored) : null;
  if (fromStorage) return fromStorage;
  for (const tag of browser) {
    const match = matchOne(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
