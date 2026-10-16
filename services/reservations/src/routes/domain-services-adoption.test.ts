import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fitness guard for the domain-service seam (issues #3357, #6773).
 *
 * Route plugins resolve their services from `fastify.services`; a value-level
 * import of one of the seam's singletons from `../services/<x>.js` would
 * silently bypass `buildApp({ services })` injection. Type-only imports and
 * non-service exports (error classes, helpers) are fine.
 */
const SEAM_MEMBERS = new Set([
  "availabilityService",
  "venueService",
  "venueGroupService",
  "tableService",
  "reservationService",
  "guestService",
  "floorPlanService",
  "holdService",
  "depositService",
  "waitlistService",
  "briefingService",
]);

const routesDir = dirname(fileURLToPath(import.meta.url));

const IMPORT_RE = /import\b([^;{}]*)\{([^}]*)\}\s*from\s*["']\.\.\/services\/[^"']+\.js["']/g;

/** Seam members a source file imports at value level from `../services/*.js`. */
function valueLevelSeamImports(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    if (/\btype\b/.test(match[1] ?? "")) continue; // `import type { ... }`
    for (const specifier of (match[2] ?? "").split(",")) {
      const trimmed = specifier.trim();
      if (!trimmed || trimmed.startsWith("type ")) continue; // inline `type X`
      const imported = (trimmed.split(/\s+as\s+/)[0] ?? "").trim();
      if (SEAM_MEMBERS.has(imported)) found.push(imported);
    }
  }
  return found;
}

describe("valueLevelSeamImports", () => {
  it("flags a value import of a seam member, multiline and aliased", () => {
    const src = `import {\n  venueService,\n  venueGroupService as groups,\n  VenueBootstrapForbiddenError,\n} from "../services/venue.js";`;
    expect(valueLevelSeamImports(src)).toEqual(["venueService", "venueGroupService"]);
  });

  it("allows type imports and non-service exports", () => {
    expect(
      valueLevelSeamImports(`import type { venueService } from "../services/venue.js";`)
    ).toEqual([]);
    expect(
      valueLevelSeamImports(
        `import { type tableService, TableTransitionError } from "../services/table.js";`
      )
    ).toEqual([]);
  });
});

describe("route files adopt the DomainServices seam", () => {
  const routeFiles = readdirSync(routesDir).filter(
    (name) => name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name)
  );

  it("finds the route files", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it.each(routeFiles)("%s imports no DomainServices member at value level", (name) => {
    const source = readFileSync(join(routesDir, name), "utf8");
    expect(valueLevelSeamImports(source)).toEqual([]);
  });
});
