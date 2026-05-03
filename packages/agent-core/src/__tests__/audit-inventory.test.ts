import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  ZONES,
  BASE_URL,
  INVENTORY_VERSION,
  buildInventory,
  mergeInventory,
  loadInventory,
  saveInventory,
  mapFilesToSurfaces,
  isNonAuditableFile,
  allFilesNonAuditable,
  findStalestZone,
  updateSurfaceScore,
  detectRegression,
} from "../audit-inventory.js";
import type { AuditInventory, AuditSurface, LighthouseScores } from "../audit-inventory.js";

// ── Constants ───────────────────────────────────────────────────────

describe("constants", () => {
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

  it("exports the production base URL", () => {
    expect(BASE_URL).toBe("https://mattbutlerengineering.com");
  });
});

// ── buildInventory ──────────────────────────────────────────────────

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

// ── mergeInventory ──────────────────────────────────────────────────

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

// ── loadInventory / saveInventory ───────────────────────────────────

describe("loadInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fresh inventory when file does not exist", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    const inv = await loadInventory("/repo");
    expect(inv.surfaces.length).toBeGreaterThan(0);
    expect(inv.surfaces[0].lastChecked).toBeNull();
  });

  it("merges with existing inventory", async () => {
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
          checkCount: 1,
        },
      ],
      lastUpdated: "2026-03-28T10:00:00Z",
      version: 1,
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(existing));

    const inv = await loadInventory("/repo");
    const home = inv.surfaces.find((s) => s.id === "marketing:home");
    expect(home?.lastChecked).toBe("2026-03-28T10:00:00Z");
  });
});

describe("saveInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
  });

  it("writes to .audit-state/inventory.json", async () => {
    await saveInventory("/repo", buildInventory());
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      "/repo/.audit-state/inventory.json",
      expect.stringContaining("marketing:home")
    );
  });
});

// ── isNonAuditableFile ──────────────────────────────────────────────

describe("isNonAuditableFile", () => {
  it("returns true for markdown files", () => {
    expect(isNonAuditableFile("README.md")).toBe(true);
    expect(isNonAuditableFile("docs/architecture.md")).toBe(true);
  });

  it("returns true for all files under docs/ directory", () => {
    expect(isNonAuditableFile("docs/evaluations/2026-03-29-test.md")).toBe(true);
    expect(isNonAuditableFile("docs/guides/setup.txt")).toBe(true);
  });

  it("returns true for all files under .github/ directory", () => {
    expect(isNonAuditableFile(".github/workflows/ci.yml")).toBe(true);
    expect(isNonAuditableFile(".github/CODEOWNERS")).toBe(true);
  });

  it("returns true for YAML files", () => {
    expect(isNonAuditableFile(".github/workflows/deploy.yml")).toBe(true);
    expect(isNonAuditableFile("some-config.yaml")).toBe(true);
  });

  it("returns true for test files", () => {
    expect(isNonAuditableFile("src/utils.test.ts")).toBe(true);
    expect(isNonAuditableFile("src/components/Button.test.tsx")).toBe(true);
    expect(isNonAuditableFile("src/utils.spec.js")).toBe(true);
  });

  it("returns true for .claude/ directory", () => {
    expect(isNonAuditableFile(".claude/skills/site-audit/SKILL.md")).toBe(true);
    expect(isNonAuditableFile(".claude/agents/planner.md")).toBe(true);
  });

  it("returns true for .gitignore", () => {
    expect(isNonAuditableFile(".gitignore")).toBe(true);
  });

  it("returns true for turbo.json", () => {
    expect(isNonAuditableFile("turbo.json")).toBe(true);
  });

  it("returns false for source files", () => {
    expect(isNonAuditableFile("apps/marketing/src/App.tsx")).toBe(false);
    expect(isNonAuditableFile("packages/rialto/src/Button.tsx")).toBe(false);
    expect(isNonAuditableFile("services/users/src/routes/users.ts")).toBe(false);
    expect(isNonAuditableFile("infrastructure/worker/edge-router.js")).toBe(false);
  });

  it("returns false for package.json", () => {
    expect(isNonAuditableFile("package.json")).toBe(false);
    expect(isNonAuditableFile("apps/marketing/package.json")).toBe(false);
  });
});

// ── allFilesNonAuditable ────────────────────────────────────────────

describe("allFilesNonAuditable", () => {
  it("returns true when all files are non-auditable", () => {
    expect(
      allFilesNonAuditable([
        "docs/guide.md",
        ".github/workflows/ci.yml",
        "src/utils.test.ts",
        ".gitignore",
        "turbo.json",
      ])
    ).toBe(true);
  });

  it("returns false when any file is auditable", () => {
    expect(allFilesNonAuditable(["docs/guide.md", "apps/marketing/src/App.tsx"])).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(allFilesNonAuditable([])).toBe(false);
  });

  it("returns false for a single auditable file", () => {
    expect(allFilesNonAuditable(["packages/rialto/src/Button.tsx"])).toBe(false);
  });

  it("returns true for a single non-auditable file", () => {
    expect(allFilesNonAuditable(["README.md"])).toBe(true);
  });

  it("returns true for a mix of docs and CI changes", () => {
    expect(
      allFilesNonAuditable([
        "docs/evaluations/2026-03-29-database.md",
        ".claude/skills/site-audit/SKILL.md",
        ".github/workflows/deploy-static.yml",
        "services/users/src/routes/users.test.ts",
      ])
    ).toBe(true);
  });
});

// ── mapFilesToSurfaces ──────────────────────────────────────────────

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

// ── findStalestZone ─────────────────────────────────────────────────

describe("findStalestZone", () => {
  it("returns a valid zone", () => {
    expect(ZONES).toContain(findStalestZone(buildInventory()));
  });

  it("prefers unchecked zones over recently checked ones", () => {
    const inv = buildInventory();
    const updated: AuditInventory = {
      ...inv,
      surfaces: inv.surfaces.map((s) =>
        s.zone === "marketing" ? { ...s, lastChecked: new Date().toISOString() } : s
      ),
    };
    expect(findStalestZone(updated)).not.toBe("marketing");
  });
});

// ── updateSurfaceScore ──────────────────────────────────────────────

describe("updateSurfaceScore", () => {
  const scores: LighthouseScores = {
    performance: 0.95,
    accessibility: 0.98,
    bestPractices: 0.92,
    seo: 0.97,
  };

  it("updates lastChecked, lastScore, and appends to checkHistory", () => {
    const updated = updateSurfaceScore(buildInventory().surfaces[0], scores);
    expect(updated.lastChecked).toBeTruthy();
    expect(updated.lastScore).toEqual(scores);
    expect(updated.checkHistory).toHaveLength(1);
    expect(updated.checkCount).toBe(1);
  });

  it("caps checkHistory at 10 entries", () => {
    let s = buildInventory().surfaces[0];
    for (let i = 0; i < 12; i++) s = updateSurfaceScore(s, scores);
    expect(s.checkHistory).toHaveLength(10);
    expect(s.checkCount).toBe(12);
  });
});

// ── detectRegression ────────────────────────────────────────────────

describe("detectRegression", () => {
  it("returns null when no previous score", () => {
    expect(
      detectRegression(buildInventory().surfaces[0], {
        performance: 0.95,
        accessibility: 0.98,
        bestPractices: 0.92,
        seo: 0.97,
      })
    ).toBeNull();
  });

  it("detects regression when score drops >0.05", () => {
    const s: AuditSurface = {
      ...buildInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
    };
    const reg = detectRegression(s, {
      performance: 0.85,
      accessibility: 0.98,
      bestPractices: 0.92,
      seo: 0.97,
    });
    expect(reg).not.toBeNull();
    expect(reg!.category).toBe("performance");
    expect(reg!.drop).toBeCloseTo(0.1);
  });

  it("returns null when drop <=0.05", () => {
    const s: AuditSurface = {
      ...buildInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
    };
    expect(
      detectRegression(s, {
        performance: 0.92,
        accessibility: 0.98,
        bestPractices: 0.92,
        seo: 0.97,
      })
    ).toBeNull();
  });

  it("reports worst regression across categories", () => {
    const s: AuditSurface = {
      ...buildInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.95, bestPractices: 0.95, seo: 0.95 },
    };
    const reg = detectRegression(s, {
      performance: 0.8,
      accessibility: 0.85,
      bestPractices: 0.95,
      seo: 0.95,
    });
    expect(reg!.category).toBe("performance");
    expect(reg!.drop).toBeCloseTo(0.15);
  });
});
