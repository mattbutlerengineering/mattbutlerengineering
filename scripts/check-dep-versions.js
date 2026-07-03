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
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Dependencies that must be consistent across all workspace packages
const SYNCED_DEPS = [
  "vitest",
  "typescript",
  "eslint",
  "fastify",
  "prisma",
  "@prisma/client",
  "zod",
  "react",
  "react-dom",
  "vite",
];

const WORKSPACE_DIRS = ["packages", "services", "apps", "tools"];

/** Pure discovery of every workspace package.json's merged deps. */
export function discoverPackageJsons(root = DEFAULT_ROOT) {
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

/**
 * Pure comparison — for each synced dep, groups packages by resolved version
 * (skipping workspace:/catalog: protocol references) and reports any dep
 * that resolves to more than one version.
 */
export function findVersionMismatches(packages, syncedDeps = SYNCED_DEPS) {
  const mismatches = [];

  for (const dep of syncedDeps) {
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

  return mismatches;
}

/** Pure end-to-end aggregation — discovers packages then diffs versions. */
export function findDepVersionFindings(root = DEFAULT_ROOT, syncedDeps = SYNCED_DEPS) {
  const packages = discoverPackageJsons(root);
  const mismatches = findVersionMismatches(packages, syncedDeps);
  return { packages, mismatches };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-dep-versions.js");

if (isMain) {
  const { packages, mismatches } = findDepVersionFindings();

  console.log(
    `Checking ${SYNCED_DEPS.length} shared dependencies across ${packages.length} packages...\n`
  );

  const exitCode = runCheck({
    name: "dependency version consistency",
    findings: mismatches,
    passMessage: "PASS: All shared dependencies are version-consistent.",
    failMessage: `FAIL: Found ${mismatches.length} dependency version mismatch(es):\n`,
  });

  if (exitCode !== 0) {
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
  }

  process.exit(exitCode);
}
