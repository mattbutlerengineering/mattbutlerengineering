/**
 * scripts-test-dist-preflight.mjs — vitest globalSetup for `pnpm --dir
 * scripts test` (#6840).
 *
 * `scripts`' `test` script runs vitest directly, not through turbo, so it
 * never gets `turbo.json`'s `test.dependsOn: ["^build"]`. On a freshly
 * installed, unbuilt checkout the workspace packages it imports
 * (`@mbe/gh-client`, `@mbe/agent-core`) have no `dist/`, and ~33 test files
 * fail to load with a bare `Failed to resolve entry for package` that points
 * at the (correct) exports map instead of the missing build.
 *
 * This preflight reads `scripts/package.json`'s `workspace:` dependencies,
 * finds every `dist/` file their manifests point at, and aborts the run
 * naming the missing files and the one command that builds them. It only
 * stats files, so an already-built checkout pays no build cost. It checks
 * existence, not staleness — `agent-core-build-freshness.mjs` owns the
 * stale-dist question. An unreadable manifest fails closed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BUILD_COMMAND = "pnpm build --filter '@mbe/scripts^...'";

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

function workspaceDependencyNames(manifest) {
  const all = { ...manifest.dependencies, ...manifest.devDependencies };
  return Object.entries(all)
    .filter(([, range]) => String(range).startsWith("workspace:"))
    .map(([name]) => name)
    .sort();
}

function stringLeaves(value) {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(stringLeaves);
  return [];
}

function distTargets(manifest) {
  const targets = manifest.exports ? stringLeaves(manifest.exports) : stringLeaves(manifest.main);
  return [...new Set(targets.filter((t) => /^(\.\/)?dist\//.test(t)))];
}

/**
 * Pure: which `workspace:` dependencies of `consumerManifest` point at
 * `dist/` files that do not exist.
 *
 * @param {{consumerManifest: object, readManifest: (name: string) => object, exists: (name: string, relPath: string) => boolean}} input
 * @returns {{missing: {name: string, files: string[]}[], undeterminable: {name: string, reason: string}[]}}
 */
export function findMissingWorkspaceDists({ consumerManifest, readManifest, exists }) {
  const missing = [];
  const undeterminable = [];
  for (const name of workspaceDependencyNames(consumerManifest)) {
    let manifest;
    try {
      manifest = readManifest(name);
    } catch (error) {
      undeterminable.push({ name, reason: String(error?.message ?? error) });
      continue;
    }
    const files = distTargets(manifest).filter((relPath) => !exists(name, relPath));
    if (files.length > 0) missing.push({ name, files });
  }
  return { missing, undeterminable };
}

/**
 * Pure: the error message for a preflight result, or `null` when clean.
 *
 * @param {{missing: {name: string, files: string[]}[], undeterminable: {name: string, reason: string}[]}} result
 * @returns {string|null}
 */
export function formatPreflightError({ missing, undeterminable }) {
  if (missing.length === 0 && undeterminable.length === 0) return null;
  const lines = ["scripts tests need their workspace dependencies built first:"];
  for (const { name, files } of missing) lines.push(`  ${name}: missing ${files.join(", ")}`);
  for (const { name, reason } of undeterminable) {
    lines.push(`  ${name}: could not read its package.json (${reason})`);
  }
  lines.push(
    "",
    `Fix: ${BUILD_COMMAND}`,
    "(`pnpm test` from the repo root builds these automatically via turbo's ^build.)"
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// vitest globalSetup
// ---------------------------------------------------------------------------

export default function preflight({ scriptsDir = __dirname } = {}) {
  const consumerManifest = JSON.parse(
    fs.readFileSync(path.join(scriptsDir, "package.json"), "utf8")
  );
  const packageDir = (name) => path.join(scriptsDir, "node_modules", name);
  const message = formatPreflightError(
    findMissingWorkspaceDists({
      consumerManifest,
      readManifest: (name) =>
        JSON.parse(fs.readFileSync(path.join(packageDir(name), "package.json"), "utf8")),
      exists: (name, relPath) => fs.existsSync(path.join(packageDir(name), relPath)),
    })
  );
  if (message) {
    const error = new Error(message);
    // The message is the whole diagnosis; vitest's internal frames only bury it.
    error.stack = message;
    throw error;
  }
}
