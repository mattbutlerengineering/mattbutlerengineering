import { describe, expect, it } from "vitest";
import type { CatalogMeta } from "./catalog-meta";
import { globalNavCatalogMeta } from "./GlobalNav/GlobalNav.catalog";
import { headingCatalogMeta } from "./Heading/Heading.catalog";
import { heroCatalogMeta } from "./Hero/Hero.catalog";
import { navbarCatalogMeta } from "./Navbar/Navbar.catalog";
import { pageHeaderCatalogMeta } from "./PageHeader/PageHeader.catalog";

/** Navigation and page-structure catalog metas (#9519): each names its component and tells the AI when to use it. */
const metas: readonly (readonly [string, CatalogMeta])[] = [
  ["Navbar", navbarCatalogMeta],
  ["GlobalNav", globalNavCatalogMeta],
  ["PageHeader", pageHeaderCatalogMeta],
  ["Heading", headingCatalogMeta],
  ["Hero", heroCatalogMeta],
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
