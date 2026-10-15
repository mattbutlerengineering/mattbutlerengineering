import type { TFunction } from "i18next";

/**
 * "2nd visit" in the active locale. The ordinal category (`one`/`two`/`few`/`other`) comes from
 * `Intl.PluralRules`, so each catalog spells the forms its language needs ("2e visite",
 * "2.ª visita") without this file knowing any of them.
 */
export function visitLabel(visitCount: number, t: TFunction, locale: string): string {
  const category = new Intl.PluralRules(locale, { type: "ordinal" }).select(visitCount);
  switch (category) {
    case "one":
      return t("timeline.visitOrdinalOne", { count: visitCount });
    case "two":
      return t("timeline.visitOrdinalTwo", { count: visitCount });
    case "few":
      return t("timeline.visitOrdinalFew", { count: visitCount });
    default:
      return t("timeline.visitOrdinalOther", { count: visitCount });
  }
}
