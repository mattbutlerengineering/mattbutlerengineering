import { describe, expect, it } from "vitest";
import type { CatalogMeta } from "./catalog-meta";
import { chatPanelCatalogMeta } from "./ChatPanel/ChatPanel.catalog";
import { fileUploadCatalogMeta } from "./FileUpload/FileUpload.catalog";
import { imageUploadCatalogMeta } from "./ImageUpload/ImageUpload.catalog";
import { listboxCatalogMeta } from "./Listbox/Listbox.catalog";
import { masterOverrideCatalogMeta } from "./MasterOverride/MasterOverride.catalog";
import { tagsInputCatalogMeta } from "./TagsInput/TagsInput.catalog";
import { treeCatalogMeta } from "./Tree/Tree.catalog";

/** Misc/complex catalog metas (#9521): each names its component and tells the AI when to use it. */
const metas: readonly (readonly [string, CatalogMeta])[] = [
  ["MasterOverride", masterOverrideCatalogMeta],
  ["ChatPanel", chatPanelCatalogMeta],
  ["FileUpload", fileUploadCatalogMeta],
  ["ImageUpload", imageUploadCatalogMeta],
  ["Listbox", listboxCatalogMeta],
  ["Tree", treeCatalogMeta],
  ["TagsInput", tagsInputCatalogMeta],
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

describe("TagsInput catalog meta", () => {
  it("declares an explicit schema for its defaultValue prop", () => {
    expect(tagsInputCatalogMeta.propSchemas.defaultValue).toMatch(/^z\.array\(/);
  });
});

describe("Tree catalog meta", () => {
  it("declares an explicit schema for its data prop", () => {
    expect(treeCatalogMeta.propSchemas.data).toMatch(/^z\.array\(/);
  });
});

describe("Listbox catalog meta", () => {
  it("declares an explicit schema for its options prop", () => {
    expect(listboxCatalogMeta.propSchemas.options).toMatch(/^z\.array\(/);
  });
});
