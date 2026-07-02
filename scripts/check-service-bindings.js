#!/usr/bin/env node

/**
 * Architecture fitness test: verifies service binding names are consistent
 * across all three locations where they're defined:
 *
 * 1. infrastructure/worker/wrangler.toml — [[services]] binding names
 * 2. infrastructure/worker/routes-config.json — staticRoutes[].binding
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
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function parseWranglerBindings(root = DEFAULT_ROOT) {
  const content = readFileSync(join(root, "infrastructure", "worker", "wrangler.toml"), "utf-8");
  const bindings = [];
  const pattern = /\[\[services\]\]\s*\nbinding\s*=\s*"(\w+)"/g;
  let found;
  while ((found = pattern.exec(content)) !== null) {
    bindings.push(found[1]);
  }
  return bindings.sort();
}

export function parseEdgeRouterBindings(root = DEFAULT_ROOT) {
  const config = JSON.parse(
    readFileSync(join(root, "infrastructure", "worker", "routes-config.json"), "utf-8")
  );
  return config.staticRoutes.map((r) => r.binding).sort();
}

export function parsePulumiBindings(root = DEFAULT_ROOT) {
  const content = readFileSync(join(root, "infrastructure", "pulumi", "index.ts"), "utf-8");
  const bindings = [];
  const pattern = /\{\s*name:\s*"(\w+)",\s*service:/g;
  let found;
  while ((found = pattern.exec(content)) !== null) {
    bindings.push(found[1]);
  }
  return bindings.sort();
}

/** Pure comparison of the 3 binding-name lists — returns mismatch findings, never logs. */
export function diffBindings(wrangler, edgeRouter, pulumi) {
  const findings = [];
  const wranglerStr = JSON.stringify(wrangler);
  const edgeRouterStr = JSON.stringify(edgeRouter);
  const pulumiStr = JSON.stringify(pulumi);

  if (wranglerStr !== edgeRouterStr) {
    const inWrangler = wrangler.filter((b) => !edgeRouter.includes(b));
    const inEdgeRouter = edgeRouter.filter((b) => !wrangler.includes(b));
    if (inWrangler.length > 0) {
      findings.push({
        message: `In wrangler.toml but NOT routes-config.json: ${inWrangler.join(", ")}`,
      });
    }
    if (inEdgeRouter.length > 0) {
      findings.push({
        message: `In routes-config.json but NOT wrangler.toml: ${inEdgeRouter.join(", ")}`,
      });
    }
  }

  if (edgeRouterStr !== pulumiStr) {
    const inEdgeRouter = edgeRouter.filter((b) => !pulumi.includes(b));
    const inPulumi = pulumi.filter((b) => !edgeRouter.includes(b));
    if (inEdgeRouter.length > 0) {
      findings.push({
        message: `In routes-config.json but NOT pulumi/index.ts: ${inEdgeRouter.join(", ")}`,
      });
    }
    if (inPulumi.length > 0) {
      findings.push({
        message: `In pulumi/index.ts but NOT routes-config.json: ${inPulumi.join(", ")}`,
      });
    }
  }

  return findings;
}

/** Pure end-to-end aggregation — parses the 3 sources and diffs them. */
export function findServiceBindingFindings(root = DEFAULT_ROOT) {
  const wrangler = parseWranglerBindings(root);
  const edgeRouter = parseEdgeRouterBindings(root);
  const pulumi = parsePulumiBindings(root);
  const findings = diffBindings(wrangler, edgeRouter, pulumi);
  return { wrangler, edgeRouter, pulumi, findings };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-service-bindings.js");

if (isMain) {
  const { wrangler, edgeRouter, pulumi, findings } = findServiceBindingFindings();

  console.log("Checking service binding consistency across 3 sources...\n");
  console.log(`  wrangler.toml:        [${wrangler.join(", ")}]`);
  console.log(`  routes-config.json:   [${edgeRouter.join(", ")}]`);
  console.log(`  pulumi/index.ts:      [${pulumi.join(", ")}]`);
  console.log("");

  const exitCode = runCheck({
    name: "service binding consistency",
    findings,
    formatFinding: (f) => f.message,
    passMessage: "PASS: All 3 sources define the same service bindings.",
    failMessage: "FAIL: Service binding mismatch detected:\n",
  });

  if (exitCode !== 0) {
    console.log("\nUpdate all 3 files to use the same set of service bindings.");
  }

  process.exit(exitCode);
}
