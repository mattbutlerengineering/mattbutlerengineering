# Layered Audit System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-route site audit with a change-driven, inventory-tracked, parallel audit system with three modes: Smoke (per-commit), Sweep (weekly rotation), Scout (monthly suggestions).

**Architecture:** A new `audit-inventory.ts` module in agent-core handles surface inventory (build, load, save, query). The site-audit skill is rewritten to dispatch one of three modes based on the argument. Smoke mode uses `git diff` + file-to-surface mapping. Sweep mode rotates through zones by staleness. Scout mode does AI-driven codebase analysis.

**Tech Stack:** TypeScript (agent-core), Markdown (skill), JSON (inventory state), git CLI, gh CLI, Lighthouse CLI, Playwright MCP

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/agent-core/src/audit-inventory.ts` | Types, inventory build/load/save, file-to-surface mapping, zone staleness, regression detection |
| `packages/agent-core/src/__tests__/audit-inventory.test.ts` | Unit tests for all inventory logic |
| `.claude/skills/site-audit/SKILL.md` | Rewritten skill with 3 modes, parallel dispatch, inventory integration |
| `.claude/skills/ship-loop/SKILL.md` | Add A2.5 Smoke Audit step |

---

### Task 1: Audit Inventory Types and Constants

**Files:**
- Create: `packages/agent-core/src/audit-inventory.ts`

- [ ] **Step 1: Write the failing test — types and constants exist**

Create `packages/agent-core/src/__tests__/audit-inventory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  ZONES,
  BASE_URL,
  type AuditInventory,
  type AuditSurface,
  type Zone,
} from "../audit-inventory.js";

describe("audit-inventory constants", () => {
  it("exports all zone values", () => {
    expect(ZONES).toContain("marketing");
    expect(ZONES).toContain("hospitality");
    expect(ZONES).toContain("rialto");
    expect(ZONES).toContain("gen");
    expect(ZONES).toContain("api:users");
    expect(ZONES).toContain("api:reservations");
    expect(ZONES).toContain("api:agent");
    expect(ZONES).toHaveLength(7);
  });

  it("exports the base URL", () => {
    expect(BASE_URL).toBe("https://mattbutlerengineering.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the types and constants**

Create `packages/agent-core/src/audit-inventory.ts`:

```typescript
// ── Types ───────────────────────────────────────────────────────────

export type Zone =
  | "marketing"
  | "hospitality"
  | "rialto"
  | "gen"
  | "api:users"
  | "api:reservations"
  | "api:agent";

export const ZONES: readonly Zone[] = [
  "marketing",
  "hospitality",
  "rialto",
  "gen",
  "api:users",
  "api:reservations",
  "api:agent",
];

export const BASE_URL = "https://mattbutlerengineering.com";

export interface LighthouseScores {
  readonly performance: number;
  readonly accessibility: number;
  readonly bestPractices: number;
  readonly seo: number;
}

export interface ScoreEntry {
  readonly timestamp: string;
  readonly scores: LighthouseScores;
}

export interface AuditSurface {
  readonly id: string;
  readonly zone: Zone;
  readonly type: "page" | "api_endpoint";
  readonly url: string;
  readonly sourceFiles: readonly string[];
  readonly auth: "none" | "auth0";
  readonly lastChecked: string | null;
  readonly lastScore: LighthouseScores | null;
  readonly checkHistory: readonly ScoreEntry[];
  readonly checkCount: number;
}

export interface AuditInventory {
  readonly surfaces: readonly AuditSurface[];
  readonly lastUpdated: string;
  readonly version: number;
}

export const INVENTORY_VERSION = 1;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/audit-inventory.ts packages/agent-core/src/__tests__/audit-inventory.test.ts
git commit -m "feat: add audit inventory types and constants"
```

---

### Task 2: Build Inventory from Hardcoded Surface Registry

Rather than parsing route files (fragile, multiple router patterns), define the full surface registry as a constant. This is rebuilt when routes change — but routes change infrequently enough that a hardcoded registry with a `sourceFiles` mapping is more reliable than AST parsing.

**Files:**
- Modify: `packages/agent-core/src/audit-inventory.ts`
- Modify: `packages/agent-core/src/__tests__/audit-inventory.test.ts`

- [ ] **Step 1: Write the failing test — buildInventory returns surfaces**

Add to `audit-inventory.test.ts`:

```typescript
import { buildInventory } from "../audit-inventory.js";

describe("buildInventory", () => {
  it("returns an inventory with all registered surfaces", () => {
    const inventory = buildInventory();

    expect(inventory.version).toBe(1);
    expect(inventory.surfaces.length).toBeGreaterThan(20);
    expect(inventory.lastUpdated).toBeTruthy();
  });

  it("includes marketing surfaces", () => {
    const inventory = buildInventory();
    const marketing = inventory.surfaces.filter((s) => s.zone === "marketing");

    expect(marketing.length).toBeGreaterThanOrEqual(1);
    expect(marketing[0].url).toContain("mattbutlerengineering.com");
  });

  it("includes hospitality surfaces with auth", () => {
    const inventory = buildInventory();
    const hospitality = inventory.surfaces.filter((s) => s.zone === "hospitality");

    expect(hospitality.length).toBeGreaterThanOrEqual(10);
    expect(hospitality.every((s) => s.auth === "auth0")).toBe(true);
  });

  it("includes API endpoint surfaces", () => {
    const inventory = buildInventory();
    const apis = inventory.surfaces.filter((s) => s.type === "api_endpoint");

    expect(apis.length).toBeGreaterThanOrEqual(3);
  });

  it("all surfaces have sourceFiles", () => {
    const inventory = buildInventory();

    for (const surface of inventory.surfaces) {
      expect(surface.sourceFiles.length).toBeGreaterThan(0);
    }
  });

  it("all surfaces have null lastChecked and lastScore", () => {
    const inventory = buildInventory();

    for (const surface of inventory.surfaces) {
      expect(surface.lastChecked).toBeNull();
      expect(surface.lastScore).toBeNull();
      expect(surface.checkCount).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: FAIL — buildInventory not exported

- [ ] **Step 3: Write buildInventory with the surface registry**

Add to `audit-inventory.ts`:

```typescript
// ── Surface Registry ────────────────────────────────────────────────

function surface(
  id: string,
  zone: Zone,
  type: "page" | "api_endpoint",
  path: string,
  sourceFiles: readonly string[],
  auth: "none" | "auth0" = "none"
): AuditSurface {
  const url =
    type === "api_endpoint"
      ? `${BASE_URL}${path}`
      : `${BASE_URL}${path}`;

  return {
    id,
    zone,
    type,
    url,
    sourceFiles,
    auth,
    lastChecked: null,
    lastScore: null,
    checkHistory: [],
    checkCount: 0,
  };
}

const SURFACE_REGISTRY: readonly AuditSurface[] = [
  // ── Marketing ───────────────────────────────────────────────────
  surface("marketing:home", "marketing", "page", "/", [
    "apps/marketing/src/pages/HomePage.tsx",
    "apps/marketing/src/App.tsx",
  ]),

  // ── Hospitality ─────────────────────────────────────────────────
  surface("hospitality:home", "hospitality", "page", "/hospitality", [
    "apps/hospitality/src/pages/HomePage.tsx",
  ], "auth0"),
  surface("hospitality:reservations", "hospitality", "page", "/hospitality/reservations", [
    "apps/hospitality/src/pages/ReservationsPage.tsx",
  ], "auth0"),
  surface("hospitality:timeline", "hospitality", "page", "/hospitality/timeline", [
    "apps/hospitality/src/pages/TimelinePage.tsx",
  ], "auth0"),
  surface("hospitality:guests", "hospitality", "page", "/hospitality/guests", [
    "apps/hospitality/src/pages/GuestsPage.tsx",
  ], "auth0"),
  surface("hospitality:floor-plans", "hospitality", "page", "/hospitality/floor-plans", [
    "apps/hospitality/src/pages/FloorPlansPage.tsx",
  ], "auth0"),
  surface("hospitality:booking-widget", "hospitality", "page", "/hospitality/booking-widget", [
    "apps/hospitality/src/pages/BookingWidgetDemoPage.tsx",
  ], "auth0"),
  surface("hospitality:onboarding", "hospitality", "page", "/hospitality/onboarding", [
    "apps/hospitality/src/pages/VenueOnboardingPage.tsx",
  ], "auth0"),
  surface("hospitality:profile", "hospitality", "page", "/hospitality/profile", [
    "apps/hospitality/src/pages/ProfilePage.tsx",
  ], "auth0"),
  surface("hospitality:settings", "hospitality", "page", "/hospitality/settings", [
    "apps/hospitality/src/pages/SettingsPage.tsx",
  ], "auth0"),
  surface("hospitality:admin", "hospitality", "page", "/hospitality/admin", [
    "apps/hospitality/src/pages/AdminPage.tsx",
  ], "auth0"),

  // ── Rialto Web (sample of key pages — not all 60+) ─────────────
  surface("rialto:overview", "rialto", "page", "/rialto", [
    "apps/rialto-web/src/pages/OverviewPage.tsx",
  ]),
  surface("rialto:button", "rialto", "page", "/rialto/components/button", [
    "apps/rialto-web/src/pages/ButtonPage.tsx",
    "packages/rialto/src/components/button",
  ]),
  surface("rialto:input", "rialto", "page", "/rialto/components/input", [
    "apps/rialto-web/src/pages/InputPage.tsx",
    "packages/rialto/src/components/input",
  ]),
  surface("rialto:table", "rialto", "page", "/rialto/components/table", [
    "apps/rialto-web/src/pages/TablePage.tsx",
    "packages/rialto/src/components/table",
  ]),
  surface("rialto:dialog", "rialto", "page", "/rialto/components/dialog", [
    "apps/rialto-web/src/pages/DialogPage.tsx",
    "packages/rialto/src/components/dialog",
  ]),
  surface("rialto:dashboard-example", "rialto", "page", "/rialto/examples/dashboard", [
    "apps/rialto-web/src/pages/examples/DashboardExamplePage.tsx",
  ]),
  surface("rialto:login-demo", "rialto", "page", "/rialto/demos/login", [
    "apps/rialto-web/src/pages/demos/SignIn.tsx",
  ]),

  // ── Gen ─────────────────────────────────────────────────────────
  surface("gen:playground", "gen", "page", "/gen", [
    "apps/gen/src/pages/PlaygroundPage.tsx",
  ], "auth0"),

  // ── API Health Endpoints ────────────────────────────────────────
  surface("api:users:health", "api:users", "api_endpoint", "/api/v1/users/health", [
    "services/users/src/routes/health.ts",
    "services/users/src/app.ts",
  ]),
  surface("api:reservations:health", "api:reservations", "api_endpoint", "/api/health", [
    "services/reservations/src/routes/health.ts",
    "services/reservations/src/app.ts",
  ]),
  surface("api:agent:health", "api:agent", "api_endpoint", "/api/gen/health", [
    "services/agent/src/routes/health.ts",
    "services/agent/src/app.ts",
  ]),
];

// ── Builder ─────────────────────────────────────────────────────────

export function buildInventory(): AuditInventory {
  return {
    surfaces: SURFACE_REGISTRY,
    lastUpdated: new Date().toISOString(),
    version: INVENTORY_VERSION,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/audit-inventory.ts packages/agent-core/src/__tests__/audit-inventory.test.ts
git commit -m "feat: add audit surface registry and buildInventory"
```

---

### Task 3: Inventory Load/Save and Merge

**Files:**
- Modify: `packages/agent-core/src/audit-inventory.ts`
- Modify: `packages/agent-core/src/__tests__/audit-inventory.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `audit-inventory.test.ts`:

```typescript
import { loadInventory, saveInventory, mergeInventory } from "../audit-inventory.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe("loadInventory", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns fresh inventory when file does not exist", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const inventory = await loadInventory("/repo");

    expect(inventory.surfaces.length).toBeGreaterThan(0);
    expect(inventory.surfaces[0].lastChecked).toBeNull();
  });

  it("loads and merges with existing inventory", async () => {
    const existing: AuditInventory = {
      surfaces: [{
        id: "marketing:home",
        zone: "marketing",
        type: "page",
        url: "https://mattbutlerengineering.com/",
        sourceFiles: ["apps/marketing/src/pages/HomePage.tsx"],
        auth: "none",
        lastChecked: "2026-03-28T10:00:00Z",
        lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
        checkHistory: [{ timestamp: "2026-03-28T10:00:00Z", scores: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 } }],
        checkCount: 1,
      }],
      lastUpdated: "2026-03-28T10:00:00Z",
      version: 1,
    };

    vi.mocked(readFile).mockResolvedValue(JSON.stringify(existing));

    const inventory = await loadInventory("/repo");
    const home = inventory.surfaces.find((s) => s.id === "marketing:home");

    expect(home?.lastChecked).toBe("2026-03-28T10:00:00Z");
    expect(home?.checkCount).toBe(1);
  });
});

describe("saveInventory", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(mkdir).mockResolvedValue(undefined); vi.mocked(writeFile).mockResolvedValue(undefined); });

  it("writes inventory to .audit-state/inventory.json", async () => {
    const inventory = buildInventory();
    await saveInventory("/repo", inventory);

    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      "/repo/.audit-state/inventory.json",
      expect.stringContaining("marketing:home")
    );
  });
});

describe("mergeInventory", () => {
  it("preserves check data for existing surfaces", () => {
    const fresh = buildInventory();
    const existing: AuditInventory = {
      surfaces: [{
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
      }],
      lastUpdated: "2026-03-28T10:00:00Z",
      version: 1,
    };

    const merged = mergeInventory(fresh, existing);
    const home = merged.surfaces.find((s) => s.id === "marketing:home");

    expect(home?.lastChecked).toBe("2026-03-28T10:00:00Z");
    expect(home?.checkCount).toBe(5);
    expect(merged.surfaces.length).toBe(fresh.surfaces.length);
  });

  it("drops surfaces that no longer exist in fresh", () => {
    const fresh = buildInventory();
    const existing: AuditInventory = {
      surfaces: [{
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
      }],
      lastUpdated: "2026-03-28T10:00:00Z",
      version: 1,
    };

    const merged = mergeInventory(fresh, existing);

    expect(merged.surfaces.find((s) => s.id === "deleted:page")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement load, save, and merge**

Add to `audit-inventory.ts`:

```typescript
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const INVENTORY_PATH = ".audit-state/inventory.json";

export function mergeInventory(
  fresh: AuditInventory,
  existing: AuditInventory
): AuditInventory {
  const existingMap = new Map(
    existing.surfaces.map((s) => [s.id, s])
  );

  const merged = fresh.surfaces.map((freshSurface) => {
    const prev = existingMap.get(freshSurface.id);
    if (!prev) return freshSurface;

    return {
      ...freshSurface,
      lastChecked: prev.lastChecked,
      lastScore: prev.lastScore,
      checkHistory: prev.checkHistory,
      checkCount: prev.checkCount,
    };
  });

  return {
    surfaces: merged,
    lastUpdated: new Date().toISOString(),
    version: INVENTORY_VERSION,
  };
}

export async function loadInventory(repoPath: string): Promise<AuditInventory> {
  const filePath = join(repoPath, INVENTORY_PATH);
  const fresh = buildInventory();

  try {
    const content = await readFile(filePath, "utf-8");
    const existing = JSON.parse(content) as AuditInventory;
    return mergeInventory(fresh, existing);
  } catch {
    return fresh;
  }
}

export async function saveInventory(
  repoPath: string,
  inventory: AuditInventory
): Promise<void> {
  const filePath = join(repoPath, INVENTORY_PATH);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(inventory, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/audit-inventory.ts packages/agent-core/src/__tests__/audit-inventory.test.ts
git commit -m "feat: add audit inventory load, save, and merge"
```

---

### Task 4: File-to-Surface Mapping and Zone Staleness

**Files:**
- Modify: `packages/agent-core/src/audit-inventory.ts`
- Modify: `packages/agent-core/src/__tests__/audit-inventory.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `audit-inventory.test.ts`:

```typescript
import { mapFilesToSurfaces, findStalestZone, updateSurfaceScore } from "../audit-inventory.js";

describe("mapFilesToSurfaces", () => {
  it("maps a page file to its specific surface", () => {
    const inventory = buildInventory();
    const surfaces = mapFilesToSurfaces(inventory, [
      "apps/hospitality/src/pages/TimelinePage.tsx",
    ]);

    expect(surfaces.some((s) => s.id === "hospitality:timeline")).toBe(true);
  });

  it("maps a shared component file to all surfaces in that app zone", () => {
    const inventory = buildInventory();
    const surfaces = mapFilesToSurfaces(inventory, [
      "apps/hospitality/src/components/DashboardLayout.tsx",
    ]);

    const hospitalityIds = surfaces.filter((s) => s.zone === "hospitality");
    expect(hospitalityIds.length).toBeGreaterThan(1);
  });

  it("maps rialto package changes to all frontend zones", () => {
    const inventory = buildInventory();
    const surfaces = mapFilesToSurfaces(inventory, [
      "packages/rialto/src/components/button/Button.tsx",
    ]);

    const zones = new Set(surfaces.map((s) => s.zone));
    expect(zones.has("marketing")).toBe(true);
    expect(zones.has("hospitality")).toBe(true);
    expect(zones.has("rialto")).toBe(true);
  });

  it("maps service route files to API surfaces", () => {
    const inventory = buildInventory();
    const surfaces = mapFilesToSurfaces(inventory, [
      "services/users/src/routes/users.ts",
    ]);

    expect(surfaces.some((s) => s.zone === "api:users")).toBe(true);
  });

  it("maps infrastructure changes to all surfaces", () => {
    const inventory = buildInventory();
    const surfaces = mapFilesToSurfaces(inventory, [
      "infrastructure/worker/edge-router.js",
    ]);

    expect(surfaces.length).toBe(inventory.surfaces.length);
  });

  it("ignores files outside apps/services/packages/infrastructure", () => {
    const inventory = buildInventory();
    const surfaces = mapFilesToSurfaces(inventory, [
      "docs/README.md",
      ".github/workflows/ci.yml",
    ]);

    expect(surfaces).toHaveLength(0);
  });

  it("deduplicates surfaces", () => {
    const inventory = buildInventory();
    const surfaces = mapFilesToSurfaces(inventory, [
      "apps/hospitality/src/pages/TimelinePage.tsx",
      "apps/hospitality/src/components/DashboardLayout.tsx",
    ]);

    const ids = surfaces.map((s) => s.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

describe("findStalestZone", () => {
  it("returns zone with oldest average lastChecked", () => {
    const inventory = buildInventory();
    // All surfaces have null lastChecked, so any zone is valid
    const zone = findStalestZone(inventory);
    expect(ZONES).toContain(zone);
  });

  it("prefers zones with null lastChecked over checked zones", () => {
    const inventory = buildInventory();
    // Mark all marketing surfaces as recently checked
    const updated: AuditInventory = {
      ...inventory,
      surfaces: inventory.surfaces.map((s) =>
        s.zone === "marketing"
          ? { ...s, lastChecked: new Date().toISOString() }
          : s
      ),
    };

    const zone = findStalestZone(updated);
    expect(zone).not.toBe("marketing");
  });
});

describe("updateSurfaceScore", () => {
  it("updates lastChecked, lastScore, and appends to checkHistory", () => {
    const surface = buildInventory().surfaces[0];
    const scores: LighthouseScores = {
      performance: 0.95,
      accessibility: 0.98,
      bestPractices: 0.92,
      seo: 0.97,
    };

    const updated = updateSurfaceScore(surface, scores);

    expect(updated.lastChecked).toBeTruthy();
    expect(updated.lastScore).toEqual(scores);
    expect(updated.checkHistory).toHaveLength(1);
    expect(updated.checkCount).toBe(1);
  });

  it("caps checkHistory at 10 entries", () => {
    let surface = buildInventory().surfaces[0];
    const scores: LighthouseScores = { performance: 0.9, accessibility: 0.9, bestPractices: 0.9, seo: 0.9 };

    for (let i = 0; i < 12; i++) {
      surface = updateSurfaceScore(surface, scores);
    }

    expect(surface.checkHistory).toHaveLength(10);
    expect(surface.checkCount).toBe(12);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Implement mapping, staleness, and score update**

Add to `audit-inventory.ts`:

```typescript
// ── File-to-Surface Mapping ─────────────────────────────────────────

const FRONTEND_ZONES: readonly Zone[] = ["marketing", "hospitality", "rialto", "gen"];

function fileToZones(filePath: string): readonly Zone[] | "all" | null {
  if (filePath.startsWith("infrastructure/")) return "all";
  if (filePath.startsWith("packages/rialto/")) return FRONTEND_ZONES;

  const appMatch = filePath.match(/^apps\/([^/]+)\//);
  if (appMatch) {
    const app = appMatch[1];
    const zoneMap: Record<string, Zone> = {
      marketing: "marketing",
      hospitality: "hospitality",
      "rialto-web": "rialto",
      gen: "gen",
    };
    const zone = zoneMap[app];
    return zone ? [zone] : null;
  }

  const svcMatch = filePath.match(/^services\/([^/]+)\//);
  if (svcMatch) {
    const svc = svcMatch[1];
    const zoneMap: Record<string, Zone> = {
      users: "api:users",
      reservations: "api:reservations",
      agent: "api:agent",
    };
    const zone = zoneMap[svc];
    return zone ? [zone] : null;
  }

  if (filePath.startsWith("packages/")) {
    return FRONTEND_ZONES;
  }

  return null;
}

export function mapFilesToSurfaces(
  inventory: AuditInventory,
  changedFiles: readonly string[]
): readonly AuditSurface[] {
  const matchedIds = new Set<string>();

  for (const file of changedFiles) {
    const zones = fileToZones(file);

    if (zones === "all") {
      return [...inventory.surfaces];
    }

    if (zones === null) continue;

    // Check for exact sourceFile match first
    for (const surface of inventory.surfaces) {
      if (surface.sourceFiles.some((sf) => file.startsWith(sf) || file === sf)) {
        matchedIds.add(surface.id);
      }
    }

    // If no exact match, add all surfaces in the affected zones
    for (const zone of zones) {
      const isPageFile = file.includes("/pages/") || file.includes("/routes/");
      if (!isPageFile) {
        for (const surface of inventory.surfaces) {
          if (surface.zone === zone) {
            matchedIds.add(surface.id);
          }
        }
      }
    }
  }

  return inventory.surfaces.filter((s) => matchedIds.has(s.id));
}

// ── Zone Staleness ──────────────────────────────────────────────────

export function findStalestZone(inventory: AuditInventory): Zone {
  const zoneAges = new Map<Zone, number>();

  for (const zone of ZONES) {
    const zoneSurfaces = inventory.surfaces.filter((s) => s.zone === zone);
    if (zoneSurfaces.length === 0) continue;

    const avgAge =
      zoneSurfaces.reduce((sum, s) => {
        if (!s.lastChecked) return sum + Infinity;
        return sum + (Date.now() - new Date(s.lastChecked).getTime());
      }, 0) / zoneSurfaces.length;

    zoneAges.set(zone, avgAge);
  }

  let stalest: Zone = ZONES[0];
  let maxAge = -1;

  for (const [zone, age] of zoneAges) {
    if (age > maxAge) {
      maxAge = age;
      stalest = zone;
    }
  }

  return stalest;
}

// ── Score Update ────────────────────────────────────────────────────

const MAX_HISTORY = 10;

export function updateSurfaceScore(
  surface: AuditSurface,
  scores: LighthouseScores
): AuditSurface {
  const entry: ScoreEntry = {
    timestamp: new Date().toISOString(),
    scores,
  };

  const history = [...surface.checkHistory, entry].slice(-MAX_HISTORY);

  return {
    ...surface,
    lastChecked: entry.timestamp,
    lastScore: scores,
    checkHistory: history,
    checkCount: surface.checkCount + 1,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/agent-core && npx vitest run src/__tests__/audit-inventory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/audit-inventory.ts packages/agent-core/src/__tests__/audit-inventory.test.ts
git commit -m "feat: add file-to-surface mapping, zone staleness, and score tracking"
```

---

### Task 5: Regression Detection

**Files:**
- Modify: `packages/agent-core/src/audit-inventory.ts`
- Modify: `packages/agent-core/src/__tests__/audit-inventory.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `audit-inventory.test.ts`:

```typescript
import { detectRegression } from "../audit-inventory.js";

describe("detectRegression", () => {
  it("returns null when no previous score exists", () => {
    const surface = buildInventory().surfaces[0];
    const newScores: LighthouseScores = { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 };

    const regression = detectRegression(surface, newScores);
    expect(regression).toBeNull();
  });

  it("detects regression when score drops >0.05", () => {
    const surface: AuditSurface = {
      ...buildInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
    };
    const newScores: LighthouseScores = { performance: 0.85, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 };

    const regression = detectRegression(surface, newScores);

    expect(regression).not.toBeNull();
    expect(regression!.category).toBe("performance");
    expect(regression!.previousScore).toBe(0.95);
    expect(regression!.currentScore).toBe(0.85);
  });

  it("returns null when score drops <=0.05", () => {
    const surface: AuditSurface = {
      ...buildInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 },
    };
    const newScores: LighthouseScores = { performance: 0.92, accessibility: 0.98, bestPractices: 0.92, seo: 0.97 };

    const regression = detectRegression(surface, newScores);
    expect(regression).toBeNull();
  });

  it("reports the worst regression when multiple categories drop", () => {
    const surface: AuditSurface = {
      ...buildInventory().surfaces[0],
      lastScore: { performance: 0.95, accessibility: 0.95, bestPractices: 0.95, seo: 0.95 },
    };
    const newScores: LighthouseScores = { performance: 0.80, accessibility: 0.85, bestPractices: 0.95, seo: 0.95 };

    const regression = detectRegression(surface, newScores);

    expect(regression).not.toBeNull();
    expect(regression!.category).toBe("performance");
    expect(regression!.drop).toBeCloseTo(0.15);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement detectRegression**

Add to `audit-inventory.ts`:

```typescript
// ── Regression Detection ────────────────────────────────────────────

export interface Regression {
  readonly surfaceId: string;
  readonly category: keyof LighthouseScores;
  readonly previousScore: number;
  readonly currentScore: number;
  readonly drop: number;
}

const REGRESSION_THRESHOLD = 0.05;

export function detectRegression(
  surface: AuditSurface,
  newScores: LighthouseScores
): Regression | null {
  if (!surface.lastScore) return null;

  const categories: (keyof LighthouseScores)[] = [
    "performance",
    "accessibility",
    "bestPractices",
    "seo",
  ];

  let worstRegression: Regression | null = null;

  for (const category of categories) {
    const previous = surface.lastScore[category];
    const current = newScores[category];
    const drop = previous - current;

    if (drop > REGRESSION_THRESHOLD) {
      if (!worstRegression || drop > worstRegression.drop) {
        worstRegression = {
          surfaceId: surface.id,
          category,
          previousScore: previous,
          currentScore: current,
          drop,
        };
      }
    }
  }

  return worstRegression;
}
```

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/agent-core/src/audit-inventory.ts packages/agent-core/src/__tests__/audit-inventory.test.ts
git commit -m "feat: add audit regression detection"
```

---

### Task 6: Export from agent-core index

**Files:**
- Modify: `packages/agent-core/src/index.ts`

- [ ] **Step 1: Add exports**

Add to `packages/agent-core/src/index.ts`:

```typescript
// Audit inventory
export {
  buildInventory,
  loadInventory,
  saveInventory,
  mergeInventory,
  mapFilesToSurfaces,
  findStalestZone,
  updateSurfaceScore,
  detectRegression,
  ZONES,
  BASE_URL,
  INVENTORY_VERSION,
} from "./audit-inventory.js";
export type {
  AuditInventory,
  AuditSurface,
  LighthouseScores,
  ScoreEntry,
  Zone,
  Regression,
} from "./audit-inventory.js";
```

- [ ] **Step 2: Run full test suite + lint + typecheck**

Run: `cd packages/agent-core && pnpm test && pnpm lint && pnpm typecheck`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add packages/agent-core/src/index.ts
git commit -m "feat: export audit inventory from agent-core"
```

---

### Task 7: Rewrite site-audit skill with 3 modes

**Files:**
- Modify: `.claude/skills/site-audit/SKILL.md`

- [ ] **Step 1: Rewrite the skill**

Replace the contents of `.claude/skills/site-audit/SKILL.md` with the full 3-mode skill definition. The new skill:
- Parses the argument for mode: `smoke`, `sweep`, `scout`, or defaults to `smoke`
- **Smoke mode:** Runs `git diff HEAD~1 --name-only`, maps to surfaces, dispatches parallel subagents per surface, detects regressions, creates issues
- **Sweep mode:** Loads inventory, finds stalest zone, dispatches parallel subagents (waves of 5), updates inventory scores, creates issues for below-threshold scores
- **Scout mode:** AI reviews inventory trends, `npm outdated`, TODOs/FIXMEs, bundle sizes, and creates max 3 `feature`/`meta-improvement` issues
- Preserves existing safety rules (max 5 issues, deduplication, never modify code)
- Preserves existing authenticated testing instructions for hospitality
- Preserves existing issue format and labels

The skill should instruct the executor to:
1. Load inventory via `cat .audit-state/inventory.json` (or build fresh if missing)
2. Run the mode-specific logic
3. Save updated inventory back to `.audit-state/inventory.json`
4. Report coverage stats at the end

- [ ] **Step 2: Verify skill loads**

Run: `/site-audit smoke` (dry run — verify it parses correctly)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/site-audit/SKILL.md
git commit -m "feat: rewrite site-audit skill with smoke/sweep/scout modes"
```

---

### Task 8: Add A2.5 Smoke Audit to ship-loop

**Files:**
- Modify: `.claude/skills/ship-loop/SKILL.md`

- [ ] **Step 1: Add the smoke audit step**

Add between A2 (Security Audit) and A3 (Gather Issues) in the ship-loop skill:

```markdown
### A2.5. Smoke Audit

After merging a PR, run a targeted audit on affected surfaces:

```bash
# Get files changed in the last merge
CHANGED=$(git diff HEAD~1 --name-only)
```

Then invoke `/site-audit smoke` which will:
1. Map changed files to affected surfaces
2. Run Lighthouse + console checks in parallel
3. Detect regressions against stored scores
4. Create `ci-fix` + `audit` issues for any regressions found

If no files in `apps/`, `services/`, `packages/`, or `infrastructure/` changed, skip this step.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/ship-loop/SKILL.md
git commit -m "feat: add smoke audit step to ship-loop Phase A"
```

---

### Task 9: Add .audit-state to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .audit-state to .gitignore**

The inventory file contains timestamps and scores specific to each environment. It should not be committed.

Add to `.gitignore`:

```
# Audit state (per-environment, not committed)
.audit-state/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .audit-state to gitignore"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full agent-core test suite**

Run: `cd packages/agent-core && pnpm test`
Expected: All tests pass (151 existing + new audit-inventory tests)

- [ ] **Step 2: Run lint and typecheck**

Run: `cd packages/agent-core && pnpm lint && pnpm typecheck`
Expected: Clean

- [ ] **Step 3: Verify inventory build works**

Run: `cd $(git rev-parse --show-toplevel) && node -e "import('./packages/agent-core/dist/audit-inventory.js').then(m => { const inv = m.buildInventory(); console.log(inv.surfaces.length + ' surfaces registered'); })"`
Expected: "20+ surfaces registered" (exact count depends on registry)

- [ ] **Step 4: Verify .audit-state is gitignored**

Run: `echo "test" > .audit-state/test.json && git status`
Expected: `.audit-state/` does not appear in untracked files
