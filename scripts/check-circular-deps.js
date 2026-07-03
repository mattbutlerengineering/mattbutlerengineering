#!/usr/bin/env node

/**
 * Architecture fitness test: detects circular dependencies between @mbe/*
 * workspace packages by walking the dependency graph from each package.json.
 *
 * Catches cycles like A → B → C → A that cause cryptic Turbo build failures
 * or infinite resolution loops.
 *
 * Usage: node scripts/check-circular-deps.js
 * Exit code: 0 if no cycles, 1 if any found
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_DIRS = ["packages", "services", "apps", "tools"];

/** Pure discovery of @mbe/* dep edges across every workspace package.json. */
export function discoverPackages(root = DEFAULT_ROOT) {
  const packages = new Map();

  for (const dir of WORKSPACE_DIRS) {
    const fullDir = join(root, dir);
    if (!existsSync(fullDir)) continue;

    for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(fullDir, entry.name, "package.json");
      if (!existsSync(pkgPath)) continue;

      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (!pkg.name) continue;

      const mbeDeps = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      }).filter((name) => name.startsWith("@mbe/"));

      packages.set(pkg.name, { deps: mbeDeps, dir: `${dir}/${entry.name}` });
    }
  }

  // Also check infrastructure/pulumi
  const pulumiPkg = join(root, "infrastructure", "pulumi", "package.json");
  if (existsSync(pulumiPkg)) {
    const pkg = JSON.parse(readFileSync(pulumiPkg, "utf-8"));
    if (pkg.name) {
      const mbeDeps = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      }).filter((name) => name.startsWith("@mbe/"));
      packages.set(pkg.name, { deps: mbeDeps, dir: "infrastructure/pulumi" });
    }
  }

  return packages;
}

/** Pure DFS cycle detection over the discovered package graph — no I/O. */
export function findCycles(packages) {
  const cycles = [];

  for (const [startName] of packages) {
    const visited = new Set();
    const path = [];

    function dfs(name) {
      if (path.includes(name)) {
        const cycleStart = path.indexOf(name);
        const cycle = [...path.slice(cycleStart), name];
        // Normalize: start from the lexically smallest package to deduplicate
        const minIdx = cycle.indexOf(cycle.slice(0, -1).reduce((a, b) => (a < b ? a : b)));
        const normalized = [
          ...cycle.slice(minIdx, -1),
          ...cycle.slice(0, minIdx),
          cycle[minIdx],
        ].join(" → ");
        if (!cycles.includes(normalized)) {
          cycles.push(normalized);
        }
        return;
      }

      if (visited.has(name)) return;
      visited.add(name);

      const pkg = packages.get(name);
      if (!pkg) return;

      path.push(name);
      for (const dep of pkg.deps) {
        dfs(dep);
      }
      path.pop();
    }

    dfs(startName);
  }

  return cycles;
}

/** Pure end-to-end aggregation — discovers packages then finds cycles. */
export function findCircularDepFindings(root = DEFAULT_ROOT) {
  const packages = discoverPackages(root);
  const cycles = findCycles(packages);
  return { packages, cycles };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-circular-deps.js");

if (isMain) {
  const { packages, cycles } = findCircularDepFindings();
  console.log(`Checking ${packages.size} workspace packages for circular dependencies...\n`);

  const exitCode = runCheck({
    name: "circular dependencies",
    findings: cycles,
    formatFinding: (cycle) => cycle,
    passMessage: "PASS: No circular dependencies found.",
    failMessage: `FAIL: Found ${cycles.length} circular dependency cycle(s):\n`,
  });

  if (exitCode !== 0) {
    console.log(
      "\nResolve these cycles by extracting shared code into a new package " +
        "or inverting the dependency direction."
    );
  }

  process.exit(exitCode);
}
