import { describe, expect, it } from "vitest";
import type { CatalogMeta } from "./catalog-meta";
import { meterCatalogMeta } from "./Meter/Meter.catalog";
import { paginationCatalogMeta } from "./Pagination/Pagination.catalog";
import { progressCatalogMeta } from "./Progress/Progress.catalog";
import { stepsCatalogMeta } from "./Steps/Steps.catalog";

/** Status and progress catalog metas (#9517): each names its component and tells the AI when to use it. */
const metas: readonly (readonly [string, CatalogMeta])[] = [
  ["Progress", progressCatalogMeta],
  ["Meter", meterCatalogMeta],
  ["Steps", stepsCatalogMeta],
  ["Pagination", paginationCatalogMeta],
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
