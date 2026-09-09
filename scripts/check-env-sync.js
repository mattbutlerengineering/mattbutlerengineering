#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Env vars injected by platform/runtime — not expected in .env.example
const PLATFORM_VARS = new Set([
  "NODE_ENV",
  "DEBUG",
  "HOME",
  "PATH",
  "CI",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  // Signal-specific endpoint overrides, which OTel prefers over the generic
  // key above. Pre-registered rather than currently required: the scanner
  // only matches a literal `process.env.NAME` (see processRe below), and
  // packages/observability reads these through resolveTelemetryPlan(env),
  // which indexes a parameter with named constants — invisible to that
  // regex. These entries take effect the moment any module reads them
  // directly, and they are platform-injected either way, never hand-set.
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_SERVICE_NAME",
  "SENTRY_RELEASE",
  "DEV",
  "PROD",
  "MODE",
  "SSR",
  "BASE_URL",
  // Deploy-pipeline injected (upserted into the DO app spec by
  // .github/workflows/deploy-services.yml) — never hand-configured.
  "DEPLOY_SHA",
  "DEPLOY_PR_NUMBER",
  "DEPLOY_AUTHOR",
  // Set automatically by npm/pnpm when running package.json scripts.
  "npm_package_version",
]);

// Vars read only by build-time tooling (e.g. a codegen CLI script) that never
// runs inside a live service process — excluded explicitly, not incidentally.
const BUILD_TIME_VARS = new Set([
  "OUTPUT_FILE", // packages/rialto-catalog/scripts/generate-catalog.ts
  "CATALOG_OUTPUT_FILE", // packages/rialto-catalog/scripts/generate-catalog.ts
]);

const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

export function collectEnvVars(packageDir) {
  const vars = new Set();

  const files = walkFiles(packageDir, {
    match: (name) => SOURCE_EXT_RE.test(name) && !TEST_FILE_RE.test(name),
  });

  for (const file of files) {
    const content = readFileSync(file, "utf-8");

    // Match process.env.VAR
    const processRe = /process\.env\.(\w+)/g;
    let m;
    while ((m = processRe.exec(content)) !== null) {
      vars.add(m[1]);
    }

    // Match import.meta.env.VAR
    const metaRe = /import\.meta\.env\.(\w+)/g;
    while ((m = metaRe.exec(content)) !== null) {
      vars.add(m[1]);
    }
  }

  return vars;
}

export function parseEnvExample(filePath) {
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, "utf-8");
  const vars = new Set();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Match both active and commented-out vars: VAR=value or # VAR=value
    const m = trimmed.match(/^#?\s*([A-Z_][A-Z0-9_]*)=/);
    if (m) {
      vars.add(m[1]);
    }
  }
  return vars;
}

/**
 * Maps every workspace package's `name` (from package.json) to its absolute
 * directory, scoped to `packages/*` and `services/*` — the two groups whose
 * source can run inside a live service process at runtime.
 */
export function resolveWorkspacePackages(root) {
  const packages = new Map();

  for (const group of ["packages", "services"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;

    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = join(groupDir, entry.name, "package.json");
      if (!existsSync(pkgJsonPath)) continue;

      try {
        const { name } = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        if (name) packages.set(name, join(groupDir, entry.name));
      } catch {
        // Malformed package.json — skip rather than aborting the whole scan.
      }
    }
  }

  return packages;
}

/**
 * BFS over a package's dependencies + devDependencies, returning the set of
 * workspace package directories it transitively depends on (resolved via
 * `workspacePackages`, so only in-repo packages match — external npm deps
 * are never in that map). A service depending on `@mbe/service-bootstrap`
 * (which itself depends on `@mbe/observability`) gets observability's
 * directory in its closure: env vars observability reads at runtime are
 * reads the service process performs too, just one hop removed.
 */
export function resolveDependencyClosure(packageDir, workspacePackages) {
  const visited = new Set([packageDir]);
  const queue = [packageDir];

  while (queue.length > 0) {
    const dir = queue.shift();
    const pkgJsonPath = join(dir, "package.json");
    if (!existsSync(pkgJsonPath)) continue;

    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    } catch {
      continue;
    }

    const depNames = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const depName of depNames) {
      const depDir = workspacePackages.get(depName);
      if (!depDir || visited.has(depDir)) continue;
      visited.add(depDir);
      queue.push(depDir);
    }
  }

  visited.delete(packageDir);
  return visited;
}

/** Only `services/*` are long-running processes that host shared-package code at runtime. */
function isServicePackage(packageDir, root) {
  return relative(root, packageDir).split(sep)[0] === "services";
}

/**
 * Pure aggregation across every `.env.example` in the repo — returns, per
 * package, which code-referenced env vars are missing from its example file.
 *
 * For `services/*`, "code-referenced" includes vars read by the service's
 * transitive `packages/*` workspace dependencies, not just its own source —
 * those packages run inside the service process and have no `.env.example`
 * of their own (see resolveDependencyClosure).
 */
export function findEnvSyncFindings(root = DEFAULT_ROOT) {
  const exampleFiles = walkFiles(root, { match: (name) => name === ".env.example" });
  const workspacePackages = resolveWorkspacePackages(root);

  return exampleFiles.map((envExamplePath) => {
    const packageDir = dirname(envExamplePath);
    const packageRelativePath = relative(root, packageDir);

    const ownVars = collectEnvVars(packageDir);
    const closureVars = isServicePackage(packageDir, root)
      ? [...resolveDependencyClosure(packageDir, workspacePackages)].flatMap((depDir) => [
          ...collectEnvVars(depDir),
        ])
      : [];
    const codeVars = new Set([...ownVars, ...closureVars]);

    const exampleVars = parseEnvExample(envExamplePath);

    const missing = [...codeVars]
      .filter((v) => !PLATFORM_VARS.has(v))
      .filter((v) => !BUILD_TIME_VARS.has(v))
      .filter((v) => !exampleVars.has(v))
      .sort();

    return { packageRelativePath, missing };
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-env-sync.js");

if (isMain) {
  console.log("🔍 Checking .env.example completeness across monorepo...\n");

  const results = findEnvSyncFindings();

  for (const { packageRelativePath, missing } of results) {
    if (missing.length === 0) {
      console.log(`  ✅ ${packageRelativePath}: all env vars documented`);
    } else {
      console.log(`  ❌ ${packageRelativePath}: MISSING from .env.example:`);
      for (const v of missing) {
        console.log(`     - ${v}`);
      }
    }
  }

  console.log("");

  const findings = results.filter((r) => r.missing.length > 0);
  const exitCode = runCheck({
    name: "env sync",
    findings,
    passMessage: "PASS: All env vars are documented in .env.example files.",
    failMessage:
      "FAIL: Some env vars used in code are not documented in .env.example.\n" +
      "Add missing vars to the corresponding .env.example file (for services/*, this\n" +
      "includes vars read by their packages/* workspace dependencies).\n" +
      "If a var is platform-injected, add it to PLATFORM_VARS in this script.\n" +
      "If a var is read only by build-time tooling, add it to BUILD_TIME_VARS instead.",
  });
  process.exit(exitCode);
}
