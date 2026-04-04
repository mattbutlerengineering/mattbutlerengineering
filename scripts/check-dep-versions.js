#!/usr/bin/env node

/**
 * Architecture fitness test: verifies key shared dependencies use the same
 * version range across all workspace packages.
 *
 * Prevents the class of bug where different packages resolve different major
 * versions of the same dependency (e.g., vitest 3.x vs 4.x), leading to
 * subtle behavior differences in tests or builds.
 *
 * Usage: node scripts/check-dep-versions.js
 * Exit code: 0 if consistent, 1 if mismatches found
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Dependencies that must be consistent across all workspace packages
const SYNCED_DEPS = [
  "vitest",
  "typescript",
  "eslint",
  "fastify",
  "prisma",
  "@prisma/client",
];

const WORKSPACE_DIRS = ["packages", "services", "apps", "tools"];

function discoverPackageJsons() {
  const results = [];

  for (const dir of WORKSPACE_DIRS) {
    const fullDir = join(root, dir);
    if (!existsSync(fullDir)) continue;

    for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(fullDir, entry.name, "package.json");
      if (!existsSync(pkgPath)) continue;

      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      results.push({
        name: pkg.name || `${dir}/${entry.name}`,
        path: `${dir}/${entry.name}/package.json`,
        deps: { ...pkg.dependencies, ...pkg.devDependencies },
      });
    }
  }

  // Also check infrastructure/pulumi
  const pulumiPkg = join(root, "infrastructure", "pulumi", "package.json");
  if (existsSync(pulumiPkg)) {
    const pkg = JSON.parse(readFileSync(pulumiPkg, "utf-8"));
    results.push({
      name: pkg.name || "infrastructure/pulumi",
      path: "infrastructure/pulumi/package.json",
      deps: { ...pkg.dependencies, ...pkg.devDependencies },
    });
  }

  return results;
}

const packages = discoverPackageJsons();
const mismatches = [];

console.log(`Checking ${SYNCED_DEPS.length} shared dependencies across ${packages.length} packages...\n`);

for (const dep of SYNCED_DEPS) {
  const versions = new Map();

  for (const pkg of packages) {
    const version = pkg.deps[dep];
    if (!version) continue;
    // Skip workspace protocol references
    if (version.startsWith("workspace:")) continue;
    // Skip catalog references
    if (version.startsWith("catalog:")) continue;

    if (!versions.has(version)) {
      versions.set(version, []);
    }
    versions.get(version).push(pkg.path);
  }

  if (versions.size > 1) {
    mismatches.push({ dep, versions });
  }
}

if (mismatches.length === 0) {
  console.log("PASS: All shared dependencies are version-consistent.");
} else {
  console.log(`FAIL: Found ${mismatches.length} dependency version mismatch(es):\n`);
  for (const { dep, versions } of mismatches) {
    console.log(`  ${dep}:`);
    for (const [version, paths] of versions) {
      console.log(`    ${version} — ${paths.join(", ")}`);
    }
    console.log("");
  }
  console.log(
    "Align all packages to the same version range.\n" +
      "Tip: use pnpm catalog or pnpm.overrides in root package.json for centralized version management."
  );
  process.exit(1);
}
