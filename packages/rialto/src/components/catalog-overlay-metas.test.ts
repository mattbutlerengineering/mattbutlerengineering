import { describe, expect, it } from "vitest";
import type { CatalogMeta } from "./catalog-meta";
import { commandPaletteCatalogMeta } from "./CommandPalette/CommandPalette.catalog";
import { confirmDialogCatalogMeta } from "./ConfirmDialog/ConfirmDialog.catalog";
import { contextMenuCatalogMeta } from "./ContextMenu/ContextMenu.catalog";
import { hoverCardCatalogMeta } from "./HoverCard/HoverCard.catalog";

/** Overlay and interaction catalog metas (#9518): each names its component and tells the AI when to use it. */
const metas: readonly (readonly [string, CatalogMeta])[] = [
  ["ConfirmDialog", confirmDialogCatalogMeta],
  ["HoverCard", hoverCardCatalogMeta],
  ["ContextMenu", contextMenuCatalogMeta],
  ["CommandPalette", commandPaletteCatalogMeta],
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
