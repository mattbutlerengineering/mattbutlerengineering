import { describe, it, expect } from "vitest";

import { mapFilesToSurfaces } from "../audit-surface-mapper.js";
import { buildInventory } from "../audit-surface-registry.js";

describe("mapFilesToSurfaces", () => {
  it("maps a page file to its specific surface", () => {
    const inv = buildInventory();
    const surfaces = mapFilesToSurfaces(inv, ["apps/hospitality/src/pages/TimelinePage.tsx"]);
    expect(surfaces.some((s) => s.id === "hospitality:timeline")).toBe(true);
  });

  it("maps shared component file to all zone surfaces", () => {
    const inv = buildInventory();
    const surfaces = mapFilesToSurfaces(inv, [
      "apps/hospitality/src/components/DashboardLayout.tsx",
    ]);
    expect(surfaces.filter((s) => s.zone === "hospitality").length).toBeGreaterThan(1);
  });

  it("maps rialto package changes to all frontend zones", () => {
    const inv = buildInventory();
    const surfaces = mapFilesToSurfaces(inv, ["packages/rialto/src/components/button/Button.tsx"]);
    const zones = new Set(surfaces.map((s) => s.zone));
    expect(zones.has("marketing")).toBe(true);
    expect(zones.has("hospitality")).toBe(true);
    expect(zones.has("rialto")).toBe(true);
  });

  it("maps service route files to API surfaces", () => {
    const inv = buildInventory();
    const surfaces = mapFilesToSurfaces(inv, ["services/users/src/routes/users.ts"]);
    expect(surfaces.some((s) => s.zone === "api:users")).toBe(true);
  });

  it("maps infrastructure changes to all surfaces", () => {
    const inv = buildInventory();
    const surfaces = mapFilesToSurfaces(inv, ["infrastructure/worker/edge-router.js"]);
    expect(surfaces.length).toBe(inv.surfaces.length);
  });

  it("ignores files outside apps/services/packages/infrastructure", () => {
    const inv = buildInventory();
    const surfaces = mapFilesToSurfaces(inv, ["docs/README.md", ".github/workflows/ci.yml"]);
    expect(surfaces).toHaveLength(0);
  });

  it("deduplicates surfaces", () => {
    const inv = buildInventory();
    const surfaces = mapFilesToSurfaces(inv, [
      "apps/hospitality/src/pages/TimelinePage.tsx",
      "apps/hospitality/src/components/DashboardLayout.tsx",
    ]);
    const ids = surfaces.map((s) => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
