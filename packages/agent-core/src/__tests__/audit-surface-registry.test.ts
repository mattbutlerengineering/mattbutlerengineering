import { describe, it, expect } from "vitest";

import {
  ZONES,
  BASE_URL,
  INVENTORY_VERSION,
  buildInventory,
  mergeInventory,
} from "../audit-surface-registry.js";
import type { AuditInventory } from "../audit-surface-registry.js";

describe("ZONES", () => {
  it("exports 7 app/service zones", () => {
    expect(ZONES).toHaveLength(7);
    expect(ZONES).toContain("marketing");
    expect(ZONES).toContain("hospitality");
    expect(ZONES).toContain("rialto");
    expect(ZONES).toContain("gen");
    expect(ZONES).toContain("api:users");
    expect(ZONES).toContain("api:reservations");
    expect(ZONES).toContain("api:agent");
  });
});

describe("BASE_URL", () => {
  it("exports the production base URL", () => {
    expect(BASE_URL).toBe("https://mattbutlerengineering.com");
  });
});

describe("INVENTORY_VERSION", () => {
  it("exports version 1", () => {
    expect(INVENTORY_VERSION).toBe(1);
  });
});

describe("buildInventory", () => {
  it("returns >20 surfaces", () => {
    const inv = buildInventory();
    expect(inv.surfaces.length).toBeGreaterThan(20);
    expect(inv.version).toBe(INVENTORY_VERSION);
    expect(inv.lastUpdated).toBeTruthy();
  });

  it("includes marketing surfaces", () => {
    const inv = buildInventory();
    const marketing = inv.surfaces.filter((s) => s.zone === "marketing");
    expect(marketing.length).toBeGreaterThanOrEqual(1);
    expect(marketing[0].url).toContain("mattbutlerengineering.com");
  });

  it("includes hospitality surfaces with auth0", () => {
    const inv = buildInventory();
    const hosp = inv.surfaces.filter((s) => s.zone === "hospitality");
    expect(hosp.length).toBeGreaterThanOrEqual(10);
    expect(hosp.every((s) => s.auth === "auth0")).toBe(true);
  });

  it("includes API endpoint surfaces", () => {
    const inv = buildInventory();
    const apis = inv.surfaces.filter((s) => s.type === "api_endpoint");
    expect(apis.length).toBeGreaterThanOrEqual(3);
  });

  it("all surfaces have sourceFiles", () => {
    for (const s of buildInventory().surfaces) {
      expect(s.sourceFiles.length).toBeGreaterThan(0);
    }
  });

  it("all surfaces start with null/0 state", () => {
    for (const s of buildInventory().surfaces) {
      expect(s.lastChecked).toBeNull();
      expect(s.lastScore).toBeNull();
      expect(s.checkCount).toBe(0);
    }
  });
});

describe("mergeInventory", () => {
  it("preserves check data for existing surfaces", () => {
    const fresh = buildInventory();
    const existing: AuditInventory = {
      surfaces: [
        {
          id: "marketing:home",
          zone: "marketing",
          type: "page",
          url: "https://mattbutlerengineering.com/",
          sourceFiles: [],
          auth: "none",
          lastChecked: "2026-03-28T10:00:00Z",
          lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
          checkHistory: [],
          checkCount: 5,
        },
      ],
      lastUpdated: "2026-03-28T10:00:00Z",
      version: 1,
    };

    const merged = mergeInventory(fresh, existing);
    const home = merged.surfaces.find((s) => s.id === "marketing:home");
    expect(home?.lastChecked).toBe("2026-03-28T10:00:00Z");
    expect(home?.checkCount).toBe(5);
    expect(merged.surfaces.length).toBe(fresh.surfaces.length);
  });

  it("drops surfaces that no longer exist", () => {
    const fresh = buildInventory();
    const existing: AuditInventory = {
      surfaces: [
        {
          id: "deleted:page",
          zone: "marketing",
          type: "page",
          url: "https://example.com/deleted",
          sourceFiles: [],
          auth: "none",
          lastChecked: "2026-03-28T10:00:00Z",
          lastScore: null,
          checkHistory: [],
          checkCount: 1,
        },
      ],
      lastUpdated: "2026-03-28T10:00:00Z",
      version: 1,
    };

    const merged = mergeInventory(fresh, existing);
    expect(merged.surfaces.find((s) => s.id === "deleted:page")).toBeUndefined();
  });
});
