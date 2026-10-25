import { describe, expect, it } from "vitest";
import type { CatalogMeta } from "./catalog-meta";
import { guestCardsCatalogMeta } from "./GuestCards/GuestCards.catalog";
import { reservationListCatalogMeta } from "./ReservationList/ReservationList.catalog";
import { timeSlotsCatalogMeta } from "./TimeSlots/TimeSlots.catalog";

/**
 * Wave-1 schema rules for the chat's booking elements (gen-ui-elements-2): the
 * seam validates a nested array as one value and clamps only top-level
 * charLimits, so a nested `.max(` or a strict `z.enum(` would drop the whole
 * element over one long or unexpected value (F13). Add each new element here.
 */
const metas: readonly CatalogMeta[] = [
  reservationListCatalogMeta,
  timeSlotsCatalogMeta,
  guestCardsCatalogMeta,
];

describe.each(metas.map((meta) => [meta.name, meta] as const))("%s catalog meta", (_, meta) => {
  const schemas = Object.entries(meta.propSchemas ?? {});

  it("declares an explicit schema for its nested rows", () => {
    expect(schemas.length).toBeGreaterThan(0);
  });

  it.each(schemas)("%s carries no .max( and no z.enum(", (_prop, source) => {
    expect(source).not.toContain(".max(");
    expect(source).not.toContain("z.enum(");
  });

  it("keeps every top-level prop schema required", () => {
    for (const [, source] of schemas) expect(source).not.toMatch(/\)\.optional\(\)$/);
  });

  it("has no inner double quotes in its description", () => {
    expect(meta.description).not.toContain('"');
  });
});
