import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

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
export const INVENTORY_VERSION = 1;

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

export interface Regression {
  readonly surfaceId: string;
  readonly category: keyof LighthouseScores;
  readonly previousScore: number;
  readonly currentScore: number;
  readonly drop: number;
}

// ── Surface Builder ─────────────────────────────────────────────────

function surface(
  id: string,
  zone: Zone,
  type: "page" | "api_endpoint",
  path: string,
  sourceFiles: readonly string[],
  auth: "none" | "auth0" = "none"
): AuditSurface {
  return {
    id,
    zone,
    type,
    url: `${BASE_URL}${path}`,
    sourceFiles,
    auth,
    lastChecked: null,
    lastScore: null,
    checkHistory: [],
    checkCount: 0,
  };
}

// ── Surface Registry ────────────────────────────────────────────────

const SURFACE_REGISTRY: readonly AuditSurface[] = [
  // Marketing
  surface("marketing:home", "marketing", "page", "/", [
    "apps/marketing/src/pages/HomePage.tsx",
    "apps/marketing/src/App.tsx",
  ]),

  // Hospitality
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

  // Rialto Web (key pages — not all 60+)
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

  // Gen
  surface("gen:playground", "gen", "page", "/gen", [
    "apps/gen/src/pages/PlaygroundPage.tsx",
  ], "auth0"),

  // API Health Endpoints
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

// ── Build ───────────────────────────────────────────────────────────

export function buildInventory(): AuditInventory {
  return {
    surfaces: SURFACE_REGISTRY,
    lastUpdated: new Date().toISOString(),
    version: INVENTORY_VERSION,
  };
}

// ── Merge ───────────────────────────────────────────────────────────

export function mergeInventory(
  fresh: AuditInventory,
  existing: AuditInventory
): AuditInventory {
  const existingMap = new Map(existing.surfaces.map((s) => [s.id, s]));

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

// ── Load / Save ─────────────────────────────────────────────────────

const INVENTORY_PATH = ".audit-state/inventory.json";

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

// ── Non-Auditable File Detection ────────────────────────────────────

/**
 * Glob-style patterns for files that never affect auditable surfaces.
 * When ALL changed files match these patterns, the smoke audit can be skipped entirely.
 */
const NON_AUDITABLE_PATTERNS: readonly RegExp[] = [
  // Documentation
  /^docs\//,
  /\.md$/,
  // CI / GitHub config
  /^\.github\//,
  /\.ya?ml$/,
  // Test files
  /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  // Claude / editor / repo config
  /^\.claude\//,
  /^\.gitignore$/,
  /^turbo\.json$/,
];

/**
 * Returns true when the file is known to have no effect on any auditable surface.
 * The smoke audit can be skipped when every changed file satisfies this check.
 */
export function isNonAuditableFile(filePath: string): boolean {
  return NON_AUDITABLE_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Returns true when every file in the list is non-auditable, meaning no
 * Lighthouse or API health checks are needed for this set of changes.
 *
 * An empty list returns false (nothing to skip).
 */
export function allFilesNonAuditable(changedFiles: readonly string[]): boolean {
  if (changedFiles.length === 0) return false;
  return changedFiles.every(isNonAuditableFile);
}

// ── File-to-Surface Mapping ─────────────────────────────────────────

const FRONTEND_ZONES: readonly Zone[] = ["marketing", "hospitality", "rialto", "gen"];

function fileToZones(filePath: string): readonly Zone[] | "all" | null {
  if (filePath.startsWith("infrastructure/")) return "all";
  if (filePath.startsWith("packages/rialto/")) return FRONTEND_ZONES;

  const appMatch = filePath.match(/^apps\/([^/]+)\//);
  if (appMatch) {
    const zoneMap: Record<string, Zone> = {
      marketing: "marketing",
      hospitality: "hospitality",
      "rialto-web": "rialto",
      gen: "gen",
    };
    const zone = zoneMap[appMatch[1]];
    return zone ? [zone] : null;
  }

  const svcMatch = filePath.match(/^services\/([^/]+)\//);
  if (svcMatch) {
    const zoneMap: Record<string, Zone> = {
      users: "api:users",
      reservations: "api:reservations",
      agent: "api:agent",
    };
    const zone = zoneMap[svcMatch[1]];
    return zone ? [zone] : null;
  }

  if (filePath.startsWith("packages/")) return FRONTEND_ZONES;

  return null;
}

export function mapFilesToSurfaces(
  inventory: AuditInventory,
  changedFiles: readonly string[]
): readonly AuditSurface[] {
  const matchedIds = new Set<string>();

  for (const file of changedFiles) {
    const zones = fileToZones(file);

    if (zones === "all") return [...inventory.surfaces];
    if (zones === null) continue;

    // Exact sourceFile match → specific surface
    for (const s of inventory.surfaces) {
      if (s.sourceFiles.some((sf) => file.startsWith(sf) || file === sf)) {
        matchedIds.add(s.id);
      }
    }

    // For frontend apps: page files map to specific surfaces (handled above).
    // Shared files (components, layouts, etc.) map to all surfaces in zone.
    // For services: ALL files map to all surfaces in that service's zone.
    const isFrontendPageFile = file.includes("/pages/") && !file.startsWith("services/");
    if (!isFrontendPageFile) {
      for (const zone of zones) {
        for (const s of inventory.surfaces) {
          if (s.zone === zone) matchedIds.add(s.id);
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
  s: AuditSurface,
  scores: LighthouseScores
): AuditSurface {
  const entry: ScoreEntry = { timestamp: new Date().toISOString(), scores };
  const history = [...s.checkHistory, entry].slice(-MAX_HISTORY);

  return {
    ...s,
    lastChecked: entry.timestamp,
    lastScore: scores,
    checkHistory: history,
    checkCount: s.checkCount + 1,
  };
}

// ── Regression Detection ────────────────────────────────────────────

const REGRESSION_THRESHOLD = 0.05;

export function detectRegression(
  s: AuditSurface,
  newScores: LighthouseScores
): Regression | null {
  if (!s.lastScore) return null;

  const categories: (keyof LighthouseScores)[] = [
    "performance",
    "accessibility",
    "bestPractices",
    "seo",
  ];

  let worst: Regression | null = null;

  for (const cat of categories) {
    const drop = s.lastScore[cat] - newScores[cat];
    if (drop > REGRESSION_THRESHOLD && (!worst || drop > worst.drop)) {
      worst = {
        surfaceId: s.id,
        category: cat,
        previousScore: s.lastScore[cat],
        currentScore: newScores[cat],
        drop,
      };
    }
  }

  return worst;
}
