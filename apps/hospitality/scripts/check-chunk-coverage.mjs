#!/usr/bin/env node
// Guards against the decorative-gate class of #4594 and #7261: a chunk that
// ships in dist/ with zero size-limit budget, so growth in it is invisible to
// `size:check`. Originally vendor-only (`*-vendor-*.js`); #7261 measured the
// shared `floor-plan-*.js` app chunk absorbing more than twice the growth of
// its budgeted siblings across two PRs while every budget reported green, so
// the check now covers EVERY built JS chunk at or above the floor. Each such
// chunk must either match a `size-limit` path glob in package.json or an
// entry in the explicit allowlist below — a new unbudgeted chunk fails this
// check instead of silently escaping it. Chunks below the floor are exempt:
// requiring a budget on noise would make the guard demand busywork instead of
// catching real regressions.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = path.join(APP_DIR, "dist", "assets");

export const COVERAGE_FLOOR_BYTES = 5 * 1024; // raw bytes; below this, a chunk is noise

// Chunks seen at or above the floor that deliberately carry no budget yet.
// Each entry is a size-limit-style glob over the built filename. The contract:
// when a PR grows one of these surfaces, promote the entry to a real measured
// budget in package.json's size-limit array (and remove it here — the
// "disjoint from budgeted globs" test enforces that). Never add a new chunk
// here just to get past the check without saying why.
export const UNBUDGETED_CHUNK_ALLOWLIST = [
  // Route-level lazy pages: growth usually tracks deliberate feature work on
  // that one page, and the page-level budgets that exist (FloorPlanEditorPage,
  // VenueOnboardingPage) were added when a PR actually fought for bytes there.
  "dist/assets/AdminPage-*.js",
  "dist/assets/AvailabilityPage-*.js",
  "dist/assets/BookingWidgetDemoPage-*.js",
  "dist/assets/BriefingPage-*.js",
  // Crossed the floor (4890 -> 6529 B raw) with no code change when the
  // vite 8.3.5 bump (#7713) moved apply-room-template.ts out of the budgeted
  // floor-plan-* chunk (-1671 B) into this page: a relocation, not growth.
  "dist/assets/FloorPlansPage-*.js",
  "dist/assets/GuestsPage-*.js",
  "dist/assets/HomePage-*.js",
  "dist/assets/ManageReservationPage-*.js",
  "dist/assets/MenusPage-*.js",
  "dist/assets/ProfilePage-*.js",
  "dist/assets/ReservationsPage-*.js",
  "dist/assets/SettingsPage-*.js",
  "dist/assets/TimelinePage-*.js",
  "dist/assets/WaitlistPage-*.js",
  // Shared app chunks hoisted by Rollup (multiple importers each):
  "dist/assets/DashboardLayout-*.js",
  "dist/assets/GuestCard-*.js",
  "dist/assets/GuestHistoryStrip-*.js",
  "dist/assets/booking-widget-*.js",
  "dist/assets/cancellation-policy-*.js",
  "dist/assets/create-query-hook-*.js",
  "dist/assets/onboarding-steps-*.js",
  "dist/assets/room-templates-*.js",
  "dist/assets/useSSESync-*.js",
  // Localization: full catalogs per locale plus the i18next/react-i18next
  // runtime; sized by translated copy, not by accidental bundling.
  "dist/assets/es-MX-*.js",
  "dist/assets/fr-CA-*.js",
  "dist/assets/useTranslation-*.js",
  // Library code Rollup names after its source dir, not a manualChunks group:
  "dist/assets/browser-*.js",
  "dist/assets/dist-*.js", // workspace package dist passthrough
  "dist/assets/index.esm-*.js",
];

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

/**
 * Pure coverage decision. `sizeOf(file)` returns raw bytes and may throw;
 * a chunk whose size cannot be read is reported in `unreadable` rather than
 * skipped — fail closed, per #7261.
 */
export function findCoverageGaps({ files, sizeOf, sizeLimitPaths, allowlist, floorBytes }) {
  const budgeted = sizeLimitPaths.map(globToRegExp);
  const allowed = allowlist.map(globToRegExp);
  const uncovered = [];
  const unreadable = [];

  for (const file of files) {
    if (!file.endsWith(".js")) continue;

    let size;
    try {
      size = sizeOf(file);
    } catch {
      unreadable.push(file);
      continue;
    }

    if (size < floorBytes) continue;

    const relativePath = `dist/assets/${file}`;
    if (budgeted.some((pattern) => pattern.test(relativePath))) continue;
    if (allowed.some((pattern) => pattern.test(relativePath))) continue;
    uncovered.push(file);
  }

  return { uncovered, unreadable };
}

function main() {
  let files;
  try {
    files = readdirSync(ASSETS_DIR);
  } catch {
    console.error(`dist/assets not found at ${ASSETS_DIR} — run "pnpm build" before size:check.`);
    process.exit(1);
  }

  const { "size-limit": sizeLimitConfig } = JSON.parse(
    readFileSync(path.join(APP_DIR, "package.json"), "utf8")
  );

  const { uncovered, unreadable } = findCoverageGaps({
    files,
    sizeOf: (file) => statSync(path.join(ASSETS_DIR, file)).size,
    sizeLimitPaths: sizeLimitConfig.map(({ path: p }) => p),
    allowlist: UNBUDGETED_CHUNK_ALLOWLIST,
    floorBytes: COVERAGE_FLOOR_BYTES,
  });

  if (uncovered.length > 0 || unreadable.length > 0) {
    if (uncovered.length > 0) {
      console.error(
        `${uncovered.length} built chunk(s) have no size-limit budget and no allowlist entry:\n` +
          uncovered.map((file) => `  - ${file}`).join("\n") +
          '\nAdd a "size-limit" entry in apps/hospitality/package.json (preferred), or an\n' +
          "explicit allowlist entry with a reason in scripts/check-chunk-coverage.mjs."
      );
    }
    if (unreadable.length > 0) {
      console.error(
        `${unreadable.length} chunk(s) could not be sized (failing closed):\n` +
          unreadable.map((file) => `  - ${file}`).join("\n")
      );
    }
    process.exit(1);
  }

  process.stdout.write("All budget-worthy chunks have size-limit or allowlist coverage.\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
