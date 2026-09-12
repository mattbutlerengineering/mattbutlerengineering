#!/usr/bin/env node

/**
 * Regenerates .audit-state/inventory.json from the surface registry,
 * merging in any real check results already recorded by
 * scripts/record-audit-check.mjs (via loadInventory()'s mergeInventory() —
 * see packages/agent-core/src/audit-surface-registry.ts).
 *
 * Before #4966 this script had two bugs: it wrote a fresh inventory
 * (null/0/[] score fields for every surface) unconditionally instead of
 * merging in prior real check results, AND it ran that write as an
 * unguarded top-level side effect with no CLI-entrypoint check — so merely
 * importing this module for its SURFACE_REGISTRY re-export (exactly what
 * this file's own test does) clobbered the real
 * .audit-state/inventory.json. Both are fixed here: the write only runs
 * from the CLI entrypoint, via regenerateInventory().
 *
 * The surface registry is defined once, in
 * packages/agent-core/src/audit-surface-registry.ts (SURFACE_REGISTRY),
 * and re-exported by @mbe/agent-core. This script imports it rather than
 * hand-maintaining a duplicate copy — see #3043.
 *
 * Requires packages/agent-core to be built first (`pnpm --filter @mbe/agent-core build`),
 * since @mbe/agent-core's package.json exports resolve to its compiled dist output.
 *
 * Usage: node scripts/generate-audit-inventory.mjs
 */

import { loadInventory, saveInventory, SURFACE_REGISTRY } from "@mbe/agent-core";

/**
 * Loads the existing inventory (if any) merged with the current surface
 * registry, writes it back, and returns it.
 *
 * @param {string} repoRoot
 * @returns {Promise<import("@mbe/agent-core").AuditInventory>}
 */
export async function regenerateInventory(repoRoot) {
  const inventory = await loadInventory(repoRoot);
  await saveInventory(repoRoot, inventory);
  return inventory;
}

/* c8 ignore start -- CLI entrypoint, exercised via regenerateInventory() above */
const isMain = process.argv[1] && process.argv[1].endsWith("generate-audit-inventory.mjs");

if (isMain) {
  const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const inventory = await regenerateInventory(repoRoot);
  console.log(
    `Wrote ${inventory.surfaces.length} surfaces to ${repoRoot}/.audit-state/inventory.json`
  );
}
/* c8 ignore stop */

export { SURFACE_REGISTRY };
