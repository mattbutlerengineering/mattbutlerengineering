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
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SERVICES_DIR = join(root, "services");

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

function getPackageDir(pkgName) {
  const shortName = pkgName.replace("@mbe/", "");
  // Check packages/ first, then other locations
  const candidates = [
    join(root, "packages", shortName),
    join(root, "tools", shortName),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "package.json"))) {
      return `packages/${shortName}`;
    }
  }
  return `packages/${shortName}`;
}

function checkService(serviceName) {
  const serviceDir = join(SERVICES_DIR, serviceName);
  const pkgPath = join(serviceDir, "package.json");
  const dockerfilePath = join(serviceDir, "Dockerfile");

  if (!existsSync(dockerfilePath)) {
    return { serviceName, errors: [], skipped: true };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const dockerfile = readFileSync(dockerfilePath, "utf-8");

  const allDeps = { ...pkg.dependencies };
  const workspaceDeps = getWorkspacePackages(allDeps);

  const errors = [];

  for (const dep of workspaceDeps) {
    const pkgDir = getPackageDir(dep.name);

    // Check that the package.json is COPYed (for pnpm install)
    const copyPkgPattern = new RegExp(
      `COPY\\s+${pkgDir}/package\\.json`
    );
    if (!copyPkgPattern.test(dockerfile)) {
      errors.push(
        `${dep.name}: missing COPY ${pkgDir}/package.json in builder stage`
      );
    }

    // Check that the source is COPYed (for building)
    const copySrcPattern = new RegExp(
      `COPY\\s+${pkgDir}(/src)?\\s+`
    );
    if (!copySrcPattern.test(dockerfile)) {
      errors.push(`${dep.name}: missing COPY ${pkgDir} in builder stage`);
    }
  }

  return { serviceName, errors, skipped: false };
}

// Run checks
const services = ["users", "reservations", "agent"];
let hasErrors = false;

console.log("Checking Dockerfile dependencies for all services...\n");

for (const service of services) {
  const result = checkService(service);

  if (result.skipped) {
    console.log(`  ${service}: skipped (no Dockerfile)`);
    continue;
  }

  if (result.errors.length === 0) {
    console.log(`  ${service}: all @mbe/* deps present in Dockerfile`);
  } else {
    hasErrors = true;
    console.log(`  ${service}: MISSING dependencies in Dockerfile:`);
    for (const error of result.errors) {
      console.log(`    - ${error}`);
    }
  }
}

console.log("");

if (hasErrors) {
  console.log(
    "FAIL: Some @mbe/* dependencies are missing from Dockerfiles.\n" +
      "Add the missing COPY and build steps to the affected Dockerfiles.\n" +
      "See services/users/Dockerfile for the expected pattern."
  );
  process.exit(1);
} else {
  console.log("PASS: All @mbe/* dependencies are present in all Dockerfiles.");
}
