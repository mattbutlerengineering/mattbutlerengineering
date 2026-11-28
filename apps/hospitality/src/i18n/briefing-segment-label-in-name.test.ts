import { describe, expect, it } from "vitest";

/**
 * On a phone, Tonight's Service prints `briefing.segmentsCompact.*` and gives each segment the
 * full `briefing.segments.*` label as its accessible name (#10238). WCAG 2.5.3 Label in Name
 * (Level A) then needs the full label to contain the compact one, or a voice-control user who
 * says the words on screen activates nothing.
 *
 * The raw templates are compared with their placeholders left in place. That is sufficient
 * because BriefingPage interpolates both keys of a pair with the same value (`{{hour}}` or
 * `{{range}}`), so containment of the templates is containment of the rendered text; the test
 * also pins that each pair uses the same placeholders, which is what makes that hold.
 */
type Segments = Record<string, string>;
interface Catalog {
  briefing?: { segments?: Segments; segmentsCompact?: Segments };
}

const catalogs = import.meta.glob<Catalog>("./catalogs/*.json", { eager: true, import: "default" });

/** A locale that defines neither group (en-GB) falls back to en-US and is covered there. */
const locales = Object.entries(catalogs).flatMap(([path, catalog]) => {
  const full = catalog.briefing?.segments;
  const compact = catalog.briefing?.segmentsCompact;
  return full && compact ? [{ locale: path.replace(/^.*\/|\.json$/g, ""), full, compact }] : [];
});

const placeholders = (template: string) => (template.match(/\{\{[^}]+\}\}/g) ?? []).join(" ");

describe("briefing segment accessible name contains its visible label (WCAG 2.5.3)", () => {
  it("covers every locale that ships its own segment labels", () => {
    expect(locales.map((l) => l.locale)).toEqual(
      expect.arrayContaining(["en-US", "es-MX", "fr-CA"])
    );
  });

  describe.each(locales)("$locale", ({ full, compact }) => {
    it.each(["early", "dinner", "late"])("%s", (segment) => {
      const name = full[segment] ?? "";
      const visible = compact[segment] ?? "";

      expect(visible).not.toBe("");
      expect(placeholders(visible)).toBe(placeholders(name));
      expect(name.toLowerCase()).toContain(visible.toLowerCase());
    });
  });
});
