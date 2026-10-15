import type { LocaleTag } from "../../i18n/locales.js";

/**
 * The machine-translation tag shown beside an option, written in that
 * option's own language (like its endonym) so a reader who can't yet read the
 * current UI language can still recognise it. Absent for human-written locales.
 */
export const MACHINE_TRANSLATION_TAGS: Readonly<Partial<Record<LocaleTag, string>>> = {
  "es-MX": "Traducción autom.",
  "fr-CA": "Traduction autom.",
};
