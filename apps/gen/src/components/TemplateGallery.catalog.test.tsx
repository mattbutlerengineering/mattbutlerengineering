import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { catalog } from "@mbe/rialto-catalog/catalog";
import { TEMPLATES } from "./TemplateGallery.js";

vi.mock("@mattbutlerengineering/rialto", () => ({ Badge: () => null, Shortcut: () => null }));

const COMPONENTS_DIR = join(__dirname, "../../../../packages/rialto/src/components");

const offered = new Set<string>(catalog.componentNames);

// Rialto components the AI catalog does not offer: naming one in a prompt makes
// the model improvise an off-catalog type, which renders as a SeamFallback.
const offCatalog = readdirSync(COMPONENTS_DIR).filter(
  (entry) => statSync(join(COMPONENTS_DIR, entry)).isDirectory() && !offered.has(entry)
);

// Plain-language asks for things the catalog cannot render (rialto has no chart
// components at all, so "chart" is off-catalog even though no component says so).
const OFF_CATALOG_CONCEPTS = [
  "chart",
  "skeleton",
  "drawer",
  "tooltip",
  "popover",
  "calendar",
  "date picker",
  "hover card",
  "dropdown menu",
  "segmented control",
  "text area",
  "progress bar",
  "meter",
  "slider",
  "toast",
];

describe("TEMPLATES against the offered catalog", () => {
  it("audits the real catalog, not an empty one", () => {
    expect(offered.size).toBeGreaterThanOrEqual(30);
    expect(offCatalog).toContain("Skeleton");
  });

  it("keeps the gallery close to its current size", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s asks for no off-catalog component",
    (_id, template) => {
      const text = `${template.description} ${template.prompt}`;
      const named = offCatalog.filter((name) => new RegExp(`\\b${name}\\b`).test(text));
      const concepts = OFF_CATALOG_CONCEPTS.filter((c) =>
        new RegExp(`\\b${c}s?\\b`, "i").test(text)
      );
      expect([...named, ...concepts]).toEqual([]);
    }
  );
});
