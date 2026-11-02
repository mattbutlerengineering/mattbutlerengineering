import { describe, it, expect } from "vitest";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";

type Reopen = Record<string, string>;
const reopenOf = (catalog: unknown): Reopen =>
  (catalog as { availabilitySpecial: { reopen: Reopen } }).availabilitySpecial.reopen;

// A span ("todas las fechas desde …", "chaque lundi (…)") is not one masculine date, so a title
// or done line that puts an article or participle before {{date}} breaks agreement (#7975).
describe("the reopen dialog's copy for a span", () => {
  it.each([
    ["es-MX", esMX, /\bel\s*\{\{date\}\}/i],
    ["fr-CA", frCA, /\ble\s*\{\{date\}\}/i],
  ])(
    "has a %s title and done line that put no article before the date",
    (_tag, catalog, article) => {
      const reopen = reopenOf(catalog);

      expect(reopen.titleSpan).toBeTruthy();
      expect(reopen.titleSpan).toContain("{{date}}");
      expect(reopen.titleSpan).not.toMatch(article);
      expect(reopen.doneSpan).toContain("{{date}}");
      expect(reopen.doneSpan).not.toMatch(article);
    }
  );
});
