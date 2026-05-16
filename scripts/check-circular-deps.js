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

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const WORKSPACE_DIRS = ["packages", "services", "apps", "tools"];

function discoverPackages() {
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

function findCycles(packages) {
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

// Run
const packages = discoverPackages();
console.log(`Checking ${packages.size} workspace packages for circular dependencies...\n`);

const cycles = findCycles(packages);

if (cycles.length === 0) {
  console.log("PASS: No circular dependencies found.");
} else {
  console.log(`FAIL: Found ${cycles.length} circular dependency cycle(s):\n`);
  for (const cycle of cycles) {
    console.log(`  ${cycle}`);
  }
  console.log(
    "\nResolve these cycles by extracting shared code into a new package " +
      "or inverting the dependency direction."
  );
  process.exit(1);
}
