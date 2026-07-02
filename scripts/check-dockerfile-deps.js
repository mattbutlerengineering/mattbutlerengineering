#!/usr/bin/env node

/**
 * Architecture fitness test: verifies every @mbe/* dependency declared in
 * a service's package.json is present in its Dockerfile (COPY + build steps).
 *
 * Catches the class of bug where a workspace package is added as a dependency
 * but never included in the Docker build context — works locally via pnpm
 * workspace resolution but fails in production Docker builds.
 *
 * Usage: node scripts/check-dockerfile-deps.js
 * Exit code: 0 if all deps present, 1 if any missing
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SERVICES = ["users", "reservations", "agent"];

// Config-only packages that don't need to be in Docker builds
// (they're devDependencies used at build time, not runtime)
const IGNORED_PACKAGES = new Set(["@mbe/config"]);

function getWorkspacePackages(deps) {
  return Object.keys(deps)
    .filter((name) => name.startsWith("@mbe/") && !IGNORED_PACKAGES.has(name))
    .map((name) => ({
      name,
      dirName: name.replace("@mbe/", ""),
    }));
}

function getPackageDir(pkgName, root) {
  const shortName = pkgName.replace("@mbe/", "");
  // Check packages/ first, then other locations
  const candidates = [join(root, "packages", shortName), join(root, "tools", shortName)];
  for (const dir of candidates) {
    if (existsSync(join(dir, "package.json"))) {
      return `packages/${shortName}`;
    }
  }
  return `packages/${shortName}`;
}

/** Pure check for a single service — returns findings, never logs or exits. */
export function checkService(serviceName, root = DEFAULT_ROOT) {
  const serviceDir = join(root, "services", serviceName);
  const pkgPath = join(serviceDir, "package.json");
  const dockerfilePath = join(serviceDir, "Dockerfile");

  if (!existsSync(dockerfilePath)) {
    return { serviceName, errors: [], skipped: true };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const dockerfile = readFileSync(dockerfilePath, "utf-8");

  const workspaceDeps = getWorkspacePackages({ ...pkg.dependencies });
  const errors = [];

  for (const dep of workspaceDeps) {
    const pkgDir = getPackageDir(dep.name, root);

    // Check that the package.json is COPYed (for pnpm install)
    const copyPkgPattern = new RegExp(`COPY\\s+${pkgDir}/package\\.json`);
    if (!copyPkgPattern.test(dockerfile)) {
      errors.push(`${dep.name}: missing COPY ${pkgDir}/package.json in builder stage`);
    }

    // Check that the source is COPYed (for building)
    const copySrcPattern = new RegExp(`COPY\\s+${pkgDir}(/src)?\\s+`);
    if (!copySrcPattern.test(dockerfile)) {
      errors.push(`${dep.name}: missing COPY ${pkgDir} in builder stage`);
    }
  }

  return { serviceName, errors, skipped: false };
}

/**
 * Pure aggregation across services — returns per-service results plus a
 * flattened findings list for the shared reporter.
 */
export function findDockerfileDepsFindings(root = DEFAULT_ROOT, services = DEFAULT_SERVICES) {
  const results = services.map((serviceName) => checkService(serviceName, root));
  const findings = results.flatMap((result) =>
    result.skipped ? [] : result.errors.map((error) => ({ service: result.serviceName, error }))
  );
  return { results, findings };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-dockerfile-deps.js");

if (isMain) {
  console.log("Checking Dockerfile dependencies for all services...\n");

  const { results, findings } = findDockerfileDepsFindings();

  for (const result of results) {
    if (result.skipped) {
      console.log(`  ${result.serviceName}: skipped (no Dockerfile)`);
    } else if (result.errors.length === 0) {
      console.log(`  ${result.serviceName}: all @mbe/* deps present in Dockerfile`);
    } else {
      console.log(`  ${result.serviceName}: MISSING dependencies in Dockerfile:`);
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }
  }

  console.log("");

  const exitCode = runCheck({
    name: "Dockerfile dependency sync",
    findings,
    passMessage: "PASS: All @mbe/* dependencies are present in all Dockerfiles.",
    failMessage:
      "FAIL: Some @mbe/* dependencies are missing from Dockerfiles.\n" +
      "Add the missing COPY and build steps to the affected Dockerfiles.\n" +
      "See services/users/Dockerfile for the expected pattern.",
  });
  process.exit(exitCode);
}
