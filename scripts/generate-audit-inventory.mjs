#!/usr/bin/env node

/**
 * Generates .audit-state/inventory.json from the surface registry.
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

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { SURFACE_REGISTRY, INVENTORY_VERSION } from "@mbe/agent-core";

const inventory = {
  surfaces: SURFACE_REGISTRY,
  lastUpdated: new Date().toISOString(),
  version: INVENTORY_VERSION,
};

const repoRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const outPath = join(repoRoot, ".audit-state", "inventory.json");

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(inventory, null, 2));

console.log(`Wrote ${inventory.surfaces.length} surfaces to ${outPath}`);

export { SURFACE_REGISTRY };
