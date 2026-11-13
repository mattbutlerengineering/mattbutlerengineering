import { readFileSync } from "node:fs";
import { test, expect } from "./fixtures.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";

/**
 * Locale sweep for the regular-week strip and a different-hours block (Locale parity sweep item,
 * feature:availability-config-usability). The quick-setup form is walked in es-MX and fr-CA on an
 * empty venue. Two defects the type system cannot see are swept:
 *
 *  1. A MISSING-KEY MARKER: i18next prints the key path when a key has no value, so any visible
 *     `availability.…` dotted path fails the test.
 *  2. UNTRANSLATED TEXT: a visible line equal to an en-US value of `availability.quickSetup.*`
 *     that the locale translates differently, and a catalog value reverted to English (it no
 *     longer "differs", so a visible line equal to it must be an acknowledged cognate). The set is built from the committed catalogs, so a
 *     key added later is covered the moment it exists.
 *
 * It also checks that the strip's weekday names come from the active locale.
 */

type Locale = "es-MX" | "fr-CA";

interface Words {
  readonly lunch: string;
  readonly dinner: string;
  readonly everyDay: string;
  readonly differentHours: string;
  readonly blockLegend: RegExp;
  readonly stripTitle: string;
  readonly monday: RegExp;
  readonly addService: string;
}

const WORDS: Record<Locale, Words> = {
  "es-MX": {
    lunch: "Comida",
    dinner: "Cena",
    everyDay: "Todos los días",
    differentHours: "Horarios distintos en algunos días",
    blockLegend: /Cena: horarios distintos/,
    stripTitle: "Vista previa",
    monday: /lunes/i,
    addService: "Agregar otro servicio",
  },
  "fr-CA": {
    lunch: "Dîner",
    dinner: "Souper",
    everyDay: "Tous les jours",
    differentHours: "Heures différentes certains jours",
    blockLegend: /Souper : heures différentes/,
    stripTitle: "Aperçu",
    monday: /lundi/i,
    addService: "Ajouter un autre service",
  },
};

type Flat = Record<string, string>;

function flatten(node: unknown, prefix = ""): Flat {
  if (typeof node === "string") return { [prefix]: node };
  if (node === null || typeof node !== "object") return {};
  return Object.entries(node).reduce<Flat>(
    (acc, [key, value]) => ({ ...acc, ...flatten(value, prefix ? `${prefix}.${key}` : key) }),
    {}
  );
}

const loadCatalog = (tag: string): Flat =>
  flatten(
    JSON.parse(readFileSync(new URL(`../src/i18n/catalogs/${tag}.json`, import.meta.url), "utf8"))
  );

const EN_US = loadCatalog("en-US");

/** English quick-setup values (no placeholders) the locale translates differently. */
function untranslatedSet(locale: Locale): ReadonlySet<string> {
  const catalog = loadCatalog(locale);
  return new Set(
    Object.entries(EN_US)
      .filter(
        ([key, value]) =>
          key.startsWith("availability.quickSetup.") &&
          !value.includes("{{") &&
          value.length > 3 &&
          catalog[key] !== value
      )
      .map(([, value]) => value)
  );
}

/** Quick-setup values that are the same word in English, Spanish and French. */
const COGNATES: ReadonlySet<string> = new Set(["Brunch"]);

/** Visible quick-setup values the locale left identical to en-US, bar the acknowledged cognates. */
function revertedSet(locale: Locale): ReadonlySet<string> {
  const catalog = loadCatalog(locale);
  return new Set(
    Object.entries(EN_US)
      .filter(
        ([key, value]) =>
          key.startsWith("availability.quickSetup.") &&
          !value.includes("{{") &&
          value.length > 3 &&
          catalog[key] === value &&
          !COGNATES.has(value)
      )
      .map(([, value]) => value)
  );
}

const MISSING_KEY = /\bavailability\.[A-Za-z]+(\.[A-Za-z_]+)+/;

for (const locale of ["es-MX", "fr-CA"] as const) {
  test(`the strip and a different-hours block read in ${locale}`, async ({ mockedPage: page }) => {
    const words = WORDS[locale];
    await page.addInitScript((tag) => localStorage.setItem("mbe-hospitality-locale", tag), locale);
    await mockEmptyVenue(page, { derive: true });
    await page.goto("availability/calendar");

    await page.getByRole("button", { name: words.lunch, exact: true }).click();
    await page.getByRole("button", { name: words.addService }).click();
    await page.getByRole("button", { name: words.dinner, exact: true }).last().click();
    await page.getByRole("button", { name: words.everyDay, exact: true }).click();
    await page.getByRole("button", { name: words.differentHours }).last().click();

    // The block and the strip are on screen.
    await expect(page.getByRole("group", { name: words.blockLegend })).toBeVisible();
    const strip = page.getByRole("complementary", { name: words.stripTitle });
    await expect(strip).toBeVisible();
    // Weekday names come from the active locale, not English.
    await expect(strip.getByRole("listitem").first()).toHaveAccessibleName(words.monday);
    await expect(strip).not.toContainText("Monday");

    const visible = await page.evaluate(() => {
      const form = document.body;
      const lines = form.innerText.split("\n").map((line) => line.trim());
      const attributes = Array.from(
        form.querySelectorAll<HTMLElement>("[aria-label], [placeholder], [title]")
      ).flatMap((el) =>
        [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("title")]
          .filter((v): v is string => v !== null)
          .map((v) => v.trim())
      );
      return [...lines, ...attributes].filter((line) => line.length > 0);
    });

    expect(visible.filter((line) => MISSING_KEY.test(line))).toEqual([]);
    const forbidden = untranslatedSet(locale);
    expect(visible.filter((line) => forbidden.has(line))).toEqual([]);
    const reverted = revertedSet(locale);
    expect(visible.filter((line) => reverted.has(line))).toEqual([]);
  });
}
