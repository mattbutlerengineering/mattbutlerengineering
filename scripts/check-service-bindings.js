#!/usr/bin/env node

/**
 * Architecture fitness test: verifies service binding names are consistent
 * across all three locations where they're defined:
 *
 * 1. infrastructure/worker/wrangler.toml — [[services]] binding names
 * 2. infrastructure/worker/edge-router.js — STATIC_SITE_BINDINGS array
 * 3. infrastructure/pulumi/index.ts — bindings array with { name, service }
 *
 * Catches the class of bug where a Worker is renamed in one file but not the
 * others, causing silent routing failures at runtime.
 *
 * Usage: node scripts/check-service-bindings.js
 * Exit code: 0 if in sync, 1 if mismatches found
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function parseWranglerBindings() {
  const content = readFileSync(
    join(root, "infrastructure", "worker", "wrangler.toml"),
    "utf-8"
  );
  const bindings = [];
  const pattern = /\[\[services\]\]\s*\nbinding\s*=\s*"(\w+)"/g;
  let found;
  while ((found = pattern.exec(content)) !== null) {
    bindings.push(found[1]);
  }
  return bindings.sort();
}

function parseEdgeRouterBindings() {
  const content = readFileSync(
    join(root, "infrastructure", "worker", "edge-router.js"),
    "utf-8"
  );
  const found = content.match(/STATIC_SITE_BINDINGS\s*=\s*\[([^\]]+)\]/);
  if (!found) return [];
  return found[1]
    .split(",")
    .map((s) => s.trim().replace(/['"]/g, ""))
    .filter(Boolean)
    .sort();
}

function parsePulumiBindings() {
  const content = readFileSync(
    join(root, "infrastructure", "pulumi", "index.ts"),
    "utf-8"
  );
  const bindings = [];
  const pattern = /\{\s*name:\s*"(\w+)",\s*service:/g;
  let found;
  while ((found = pattern.exec(content)) !== null) {
    bindings.push(found[1]);
  }
  return bindings.sort();
}

// Run
const wrangler = parseWranglerBindings();
const edgeRouter = parseEdgeRouterBindings();
const pulumi = parsePulumiBindings();

console.log("Checking service binding consistency across 3 sources...\n");
console.log(`  wrangler.toml:   [${wrangler.join(", ")}]`);
console.log(`  edge-router.js:  [${edgeRouter.join(", ")}]`);
console.log(`  pulumi/index.ts: [${pulumi.join(", ")}]`);
console.log("");

const wranglerStr = JSON.stringify(wrangler);
const edgeRouterStr = JSON.stringify(edgeRouter);
const pulumiStr = JSON.stringify(pulumi);

const allMatch = wranglerStr === edgeRouterStr && edgeRouterStr === pulumiStr;

if (allMatch) {
  console.log("PASS: All 3 sources define the same service bindings.");
} else {
  console.log("FAIL: Service binding mismatch detected:\n");

  if (wranglerStr !== edgeRouterStr) {
    const inWrangler = wrangler.filter((b) => !edgeRouter.includes(b));
    const inEdgeRouter = edgeRouter.filter((b) => !wrangler.includes(b));
    if (inWrangler.length > 0)
      console.log(`  In wrangler.toml but NOT edge-router.js: ${inWrangler.join(", ")}`);
    if (inEdgeRouter.length > 0)
      console.log(`  In edge-router.js but NOT wrangler.toml: ${inEdgeRouter.join(", ")}`);
  }

  if (edgeRouterStr !== pulumiStr) {
    const inEdgeRouter = edgeRouter.filter((b) => !pulumi.includes(b));
    const inPulumi = pulumi.filter((b) => !edgeRouter.includes(b));
    if (inEdgeRouter.length > 0)
      console.log(`  In edge-router.js but NOT pulumi/index.ts: ${inEdgeRouter.join(", ")}`);
    if (inPulumi.length > 0)
      console.log(`  In pulumi/index.ts but NOT edge-router.js: ${inPulumi.join(", ")}`);
  }

  console.log(
    "\nUpdate all 3 files to use the same set of service bindings."
  );
  process.exit(1);
}
