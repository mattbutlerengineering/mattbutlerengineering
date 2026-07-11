#!/usr/bin/env node
/**
 * issue-zone.mjs — estimate an issue's merge-train zone and compose a
 * breadth-first (zone-spread) claim batch for the implement-queue.
 *
 * WHY THIS EXISTS — the N² branch-update tax (see ADR-023):
 * `main` is `strict` (ADR-016: a branch must be up-to-date before it merges).
 * The merge train holds a **per-zone** lock (`scripts/merge-train-lock.mjs`).
 * Stacking multiple same-zone PRs therefore serializes: each merge makes the
 * siblings out-of-date, forcing `gh pr update-branch` + a full CI re-run per
 * sibling. Claiming a batch that spreads across **distinct** zones lets those
 * PRs merge without invalidating one another.
 *
 * This module never invents a second zone list. It derives the `<root>/<name>`
 * vocabulary straight from merge-train-lock (`WORKSPACE_ROOTS` + `zoneForPath`),
 * so the estimate and the lock always agree.
 *
 * Public API:
 *   issueZone(issue)                         → string | null   (estimated zone)
 *   selectZoneSpreadBatch(candidates, opts)  → issue[]         (spread batch)
 *   SCOPE_ZONE_MAP                           → Map<scope, zone> (scope → zone)
 *   buildScopeZoneMap(repoRoot?)             → Map<scope, zone> (rescan helper)
 *
 * @module issue-zone
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKSPACE_ROOTS, zoneForPath } from "./merge-train-lock.mjs";

// Repo root resolved from this module's own location (scripts/ → repo root),
// so the workspace scan is independent of the caller's cwd.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Default parallel-worker ceiling — mirrors MAX_CONCURRENT_WORKERS in
// scripts/worker-dispatch.mjs and the "claim up to 3" batch in the skill.
const DEFAULT_MAX_WORKERS = 3;

// ---------------------------------------------------------------------------
// Scope → zone map
// ---------------------------------------------------------------------------

/**
 * Builds the scope→zone map by scanning the merge-train workspace roots.
 *
 * The conventional-commit scope is, by repo convention, the workspace package
 * directory name (`packages/rialto` → scope `rialto`). Scanning the real dirs
 * keeps the map from drifting out of a hand-maintained list, and each zone
 * string is produced by `zoneForPath` so the format is identical to the lock's.
 *
 * On a scope collision across roots, the earliest root in `WORKSPACE_ROOTS`
 * wins (deterministic; there are currently no cross-root basename collisions).
 *
 * @param {string} [repoRoot] — repo root to scan (default: resolved from module)
 * @returns {Map<string, string>} scope → `<root>/<name>` zone
 */
function buildScopeZoneMap(repoRoot = REPO_ROOT) {
  const map = new Map();
  for (const root of WORKSPACE_ROOTS) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(repoRoot, root), { withFileTypes: true });
    } catch {
      continue; // a root may be absent in some checkouts
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const scope = entry.name;
      if (map.has(scope)) continue; // first (highest-precedence) root wins
      // Reuse merge-train-lock's path→zone formatting → guaranteed vocabulary.
      map.set(scope, zoneForPath(`${root}/${scope}/package.json`));
    }
  }
  return map;
}

/**
 * The scope→zone map for this repo, built once at module load.
 * @type {Map<string, string>}
 */
const SCOPE_ZONE_MAP = buildScopeZoneMap();

// ---------------------------------------------------------------------------
// Zone estimation
// ---------------------------------------------------------------------------

/**
 * Extracts the conventional-commit scope tokens from a title.
 *
 * Handles `type(scope): …`, `type(scope)!: …`, and comma-separated scopes
 * (`type(a,b): …`). A scopeless (`type: …`) or non-conventional title yields
 * an empty list. Tokens are lower-cased for case-insensitive matching.
 *
 * @param {string} title
 * @returns {string[]}
 */
function parseScopes(title) {
  if (typeof title !== "string") return [];
  const match = /^\s*[a-zA-Z]+(?:\(([^)]*)\))?!?:/.exec(title.trim());
  if (!match || !match[1]) return [];
  return match[1]
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Estimates the merge-train zone an issue's PR will most likely occupy.
 *
 * Derivation mirrors `zoneForPaths` in merge-train-lock: a changeset that maps
 * to exactly one workspace zone gets that zone; anything cross-cutting (scopes
 * spanning >1 zone, an unknown/non-workspace scope, or no scope at all) → `null`
 * = the GLOBAL lock, which serializes against everything (the conservative
 * choice for a cross-cutting PR).
 *
 * @param {{ title?: string, labels?: unknown, body?: unknown }} issue
 * @returns {string | null} `<root>/<name>` zone, or null for global
 */
function issueZone(issue) {
  const title = issue && typeof issue === "object" ? issue.title : undefined;
  const scopes = parseScopes(title);
  if (scopes.length === 0) return null;

  // Each scope resolves to a workspace zone or null (global). A single distinct
  // zone → that zone; a single distinct null → global; a mix (or >1 zone) →
  // cross-cutting → global. Identical to merge-train-lock's zoneForPaths.
  const zones = new Set(scopes.map((s) => SCOPE_ZONE_MAP.get(s) ?? null));
  if (zones.size === 1) return [...zones][0];
  return null;
}

// ---------------------------------------------------------------------------
// Batch composition
// ---------------------------------------------------------------------------

/**
 * Composes a claim batch that maximizes distinct merge-train zones.
 *
 * Preserving the caller's priority order, it takes at most one issue per
 * distinct zone (up to `maxWorkers`), deferring same-zone surplus to a later
 * batch. `null`-zone (global/cross-cutting) issues each occupy the single
 * global slot, so at most ONE global is scheduled per batch — a global PR takes
 * the global lock and serializes against every other train, so co-scheduling
 * two would reintroduce the very serialization this avoids.
 *
 * Pure and deterministic: no I/O, no mutation of inputs.
 *
 * @param {Array<object>} candidates — issues in priority order (highest first)
 * @param {{ maxWorkers?: number }} [opts]
 * @returns {Array<object>} selected issues (subset of `candidates`, in order)
 */
function selectZoneSpreadBatch(candidates, { maxWorkers = DEFAULT_MAX_WORKERS } = {}) {
  if (!Array.isArray(candidates) || maxWorkers <= 0) return [];

  const batch = [];
  const occupied = new Set(); // holds zone strings and, at most once, null
  for (const issue of candidates) {
    if (batch.length >= maxWorkers) break;
    const zone = issueZone(issue);
    if (occupied.has(zone)) continue; // zone already claimed → defer this one
    occupied.add(zone); // null counts as its own single occupancy
    batch.push(issue);
  }
  return batch;
}

export { issueZone, selectZoneSpreadBatch, buildScopeZoneMap, SCOPE_ZONE_MAP, DEFAULT_MAX_WORKERS };
