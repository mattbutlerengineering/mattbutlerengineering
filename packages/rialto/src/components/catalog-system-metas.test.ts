import { describe, expect, it } from "vitest";
import type { CatalogMeta } from "./catalog-meta";
import { disabledTooltipCatalogMeta } from "./DisabledTooltip/DisabledTooltip.catalog";
import { errorBoundaryCatalogMeta } from "./ErrorBoundary/ErrorBoundary.catalog";
import { kbdCatalogMeta } from "./Kbd/Kbd.catalog";
import { splitScreenExitCatalogMeta } from "./SplitScreenExit/SplitScreenExit.catalog";
import { themeToggleCatalogMeta } from "./ThemeToggle/ThemeToggle.catalog";

/** System and utility catalog metas (#9520): each names its component and tells the AI when to use it. */
const metas: readonly (readonly [string, CatalogMeta])[] = [
  ["ErrorBoundary", errorBoundaryCatalogMeta],
  ["ThemeToggle", themeToggleCatalogMeta],
  ["DisabledTooltip", disabledTooltipCatalogMeta],
  ["SplitScreenExit", splitScreenExitCatalogMeta],
  ["Kbd", kbdCatalogMeta],
];

describe.each(metas)("%s catalog meta", (name, meta) => {
  it("is named after its barrel export", () => {
    expect(meta.name).toBe(name);
  });

  it("has a usage description with no inner double quotes", () => {
    expect(meta.description.length).toBeGreaterThan(20);
    expect(meta.description).not.toContain('"');
  });

  it("holds Zod only as source strings, never as an import", () => {
    for (const source of Object.values(meta.propSchemas ?? {}))
      expect(typeof source).toBe("string");
  });
});
