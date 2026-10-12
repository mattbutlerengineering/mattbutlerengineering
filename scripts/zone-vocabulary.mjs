#!/usr/bin/env node
/**
 * zone-vocabulary.mjs — the repo's "zone" vocabulary: which workspace area owns
 * a changed path.
 *
 * Used by the queue profile to pick a merge-train lock zone, by issue-zone.mjs to
 * estimate an issue's zone, and by dep-graph-discovery / regen-manifest /
 * collect-e2e-stability for workspace-tree classification. Pure, no I/O.
 *
 * @module zone-vocabulary
 */

// Top-level workspace roots that define a "zone". A changed file under one of
// these (e.g. apps/hospitality/...) belongs to the `<root>/<name>` zone.
// Consumed elsewhere (dep-graph-discovery.mjs, regen-manifest.mjs) for real
// pnpm-workspace classification — never add a non-pnpm-workspace root here.
const WORKSPACE_ROOTS = ["apps", "packages", "services"];

// Additional top-level trees that are large/active enough (CI + automation
// workflows) to deserve their own `<root>/<name>` zone, same shape as
// WORKSPACE_ROOTS, but kept as a SEPARATE constant: unlike WORKSPACE_ROOTS
// this is consumed only by zoneForPath below, never by the pnpm-workspace
// classifiers. `.claude` is deliberately excluded — `.claude/skills/**`
// is genuinely cross-cutting (see issue-zone.mjs's `skills` → null test).
const EXTRA_ZONE_ROOTS = [".github"];

// Zone used for any changed file that is NOT under a workspace root
// (top-level config, docs/**, scripts/**, infrastructure/**, .claude/**, etc.).
const ROOT_ZONE = "root";

/**
 * Maps a single changed file path to its zone.
 * `apps/<x>/...` → `apps/<x>`; same for packages/services. Everything else → "root".
 *
 * @param {string} filePath — repo-relative changed path (POSIX separators)
 * @returns {string}
 */
function zoneForPath(filePath) {
  const segments = filePath.split("/");
  const root = segments[0];
  if (segments.length >= 2 && (WORKSPACE_ROOTS.includes(root) || EXTRA_ZONE_ROOTS.includes(root))) {
    return `${root}/${segments[1]}`;
  }
  return ROOT_ZONE;
}

/**
 * Derives a single zone for a changeset.
 *
 * - All files map to the same zone  → that zone (per-zone lock).
 * - Files span multiple zones, or the changeset is empty → null.
 *
 * A `null` result means the caller should fall back to the GLOBAL lock
 * (no `--zone`), which serializes against every other train — the safe,
 * conservative choice for a cross-cutting PR.
 *
 * @param {string[]} paths — repo-relative changed paths
 * @returns {string | null}
 */
function zoneForPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return null;
  }
  const zones = new Set(paths.map(zoneForPath));
  return zones.size === 1 ? [...zones][0] : null;
}

// Prefixes that define the "frontend" tree: apps/** and packages/rialto/**.
// A DIFFERENT question from zoneForPath: zoneForPath answers "which
// workspace zone owns this path" (every apps/packages/services path has
// one); isFrontendPath answers "is this path front-end code" (most
// packages/* and all of services/* are NOT frontend, even though
// zoneForPath gives them a real, non-root zone).
const FRONTEND_PREFIXES = ["apps/", "packages/rialto/"];

/**
 * True when `filePath` is under the frontend tree (`apps/**` or
 * `packages/rialto/**`).
 *
 * @param {string} filePath — repo-relative path (POSIX separators)
 * @returns {boolean}
 */
function isFrontendPath(filePath) {
  return FRONTEND_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

export { WORKSPACE_ROOTS, zoneForPath, zoneForPaths, isFrontendPath };
