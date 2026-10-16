import type { TFunction } from "i18next";

type OrdinalCategory = "one" | "two" | "few" | "other";

function ordinalCategory(language: string, n: number): OrdinalCategory {
  const category = new Intl.PluralRules(language, { type: "ordinal" }).select(n);
  return category === "one" || category === "two" || category === "few" ? category : "other";
}

/** "2nd visit" in en, "2.ª visita" in es-MX, "2e visite" in fr-CA — the locale's own ordinal rule. */
export function ordinalVisitLabel(t: TFunction, language: string, n: number): string {
  return t(`reservations.visitOrdinal.${ordinalCategory(language, n)}`, { count: n });
}
