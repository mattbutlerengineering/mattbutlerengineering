#!/usr/bin/env node

/**
 * bootstrap-worktree.mjs — decides whether a worktree needs
 * `pnpm install` / a `turbo build` of dist-consumed packages before tests,
 * typecheck, or an app dev server can run in it (docs/features/bootstrap-worktree).
 *
 * Pure core (WO-6): `decideBootstrapSteps` and `distConsumedPackages`.
 * Probes + CLI (WO-7): thin `fs` wrappers that feed the pure core, plus a
 * `--check`-aware entrypoint invoked as `pnpm bootstrap:worktree`. The
 * probes reuse `dep-graph-discovery.mjs`'s workspace-glob parsing (the
 * same no-yaml-dep `pnpm-workspace.yaml` reader every other
 * workspace-enumerating check in this repo uses) rather than re-parsing it
 * here.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverWorkspaceGlobs, resolveGlob } from "./dep-graph-discovery.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const DIST_ENTRYPOINT_KEYS = ["main", "module", "types", "exports"];

/**
 * True when a package.json entrypoint value (string, or an object of
 * string leaves — the exports map shape) resolves under dist/ anywhere.
 */
function resolvesUnderDist(value) {
  if (typeof value === "string") {
    return value.replace(/^\.\//, "").startsWith("dist/");
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(resolvesUnderDist);
  }
  return false;
}

/**
 * Pure filter over parsed workspace package.json descriptors
 * (`{ name, dir, json }`) → the subset that consume their own `dist/`
 * build output via main/module/types/exports. Returns `{ name, dir }`.
 */
export function distConsumedPackages(workspacePkgs) {
  if (!Array.isArray(workspacePkgs)) {
    throw new TypeError("distConsumedPackages: workspacePkgs must be an array");
  }
  return workspacePkgs
    .filter(({ json }) => DIST_ENTRYPOINT_KEYS.some((key) => resolvesUnderDist(json?.[key])))
    .map(({ name, dir }) => ({ name, dir }));
}

/**
 * Pure decision: ordered bootstrap steps from three probed facts. Install
 * is decided by `!hasNodeModules || lockNewer`; build by
 * `missingDists.length > 0`. Install always precedes build. Fails closed
 * on invalid input rather than guessing (the `classifyBuildFreshness`
 * discipline — gotchas.md § Build / pnpm / turbo).
 */
export function decideBootstrapSteps({ hasNodeModules, lockNewer, missingDists }) {
  if (typeof hasNodeModules !== "boolean") {
    throw new TypeError("decideBootstrapSteps: hasNodeModules must be a boolean");
  }
  if (typeof lockNewer !== "boolean") {
    throw new TypeError("decideBootstrapSteps: lockNewer must be a boolean");
  }
  if (!Array.isArray(missingDists)) {
    throw new TypeError("decideBootstrapSteps: missingDists must be an array");
  }

  const steps = [];
  if (!hasNodeModules || lockNewer) {
    steps.push({ step: "install" });
  }
  if (missingDists.length > 0) {
    steps.push({ step: "build", packages: missingDists });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Probes (thin fs layer) — exposed for tests but not unit-tested beyond
// smoke per architecture.md §1: each is a direct fs.statSync/existsSync
// wrapper, so the pure-core tests above already cover the decision logic
// they feed.
// ---------------------------------------------------------------------------

/** Does `<repoRoot>/node_modules` exist at all? */
export function hasNodeModulesProbe(repoRoot = REPO_ROOT) {
  return existsSync(join(repoRoot, "node_modules"));
}

/**
 * Is `pnpm-lock.yaml` newer than pnpm's own install receipt
 * (`node_modules/.modules.yaml`)? Falls back to the `node_modules` dir
 * mtime when the receipt is absent — no content hashing, pnpm itself
 * reconciles on install (architecture.md assumptions).
 */
export function isLockNewerProbe(repoRoot = REPO_ROOT) {
  const lockPath = join(repoRoot, "pnpm-lock.yaml");
  if (!existsSync(lockPath)) return false;

  const receiptPath = join(repoRoot, "node_modules", ".modules.yaml");
  const fallbackPath = join(repoRoot, "node_modules");
  const statPath = existsSync(receiptPath) ? receiptPath : fallbackPath;
  if (!existsSync(statPath)) return false;

  return statSync(lockPath).mtimeMs > statSync(statPath).mtimeMs;
}

/**
 * Parsed `{ name, dir, json }` descriptors for every workspace package,
 * via the same `pnpm-workspace.yaml` glob reader `check-changeset-tree.mjs`
 * and the dep-graph generators already use — no duplicate parser here.
 */
export function listWorkspacePackagesProbe(repoRoot = REPO_ROOT) {
  const globs = discoverWorkspaceGlobs(repoRoot);
  return globs.flatMap((glob) =>
    resolveGlob(glob, repoRoot).map(({ pkgJsonPath, wsDir }) => {
      const json = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      return { name: json.name, dir: wsDir, json };
    })
  );
}

/**
 * Names of dist-consuming workspace packages whose `dist/` directory is
 * missing — the `missingDists` input `decideBootstrapSteps` expects.
 */
export function missingDistsProbe(repoRoot = REPO_ROOT) {
  const consumers = distConsumedPackages(listWorkspacePackagesProbe(repoRoot));
  return consumers
    .filter(({ dir }) => !existsSync(join(repoRoot, dir, "dist")))
    .map(({ name }) => name);
}

/** Runs the three probes above and decides the bootstrap steps for `repoRoot`. */
export function probeBootstrapSteps(repoRoot = REPO_ROOT) {
  return decideBootstrapSteps({
    hasNodeModules: hasNodeModulesProbe(repoRoot),
    lockNewer: isLockNewerProbe(repoRoot),
    missingDists: missingDistsProbe(repoRoot),
  });
}

// ---------------------------------------------------------------------------
// CLI — no-args runs the decided steps; `--check` only prints them (the
// hook's probe, WO-8). Non-zero exit only when an executed step itself
// fails; the no-op path spawns no pnpm/turbo at all (SC-2).
// ---------------------------------------------------------------------------

/** One line per decided step, or the fixed no-op line when `steps` is `[]`. */
export function formatBootstrapDecision(steps) {
  if (steps.length === 0) return "bootstrap-worktree: nothing to do.";
  const parts = steps.map((step) =>
    step.step === "install" ? "install" : `build (${step.packages.join(", ")})`
  );
  return `bootstrap-worktree: pending — ${parts.join(", then ")}.`;
}

function runBootstrapStep(step, repoRoot, exec) {
  if (step.step === "install") {
    exec("pnpm", ["install", "--frozen-lockfile"], { cwd: repoRoot, stdio: "inherit" });
    return;
  }
  const filters = step.packages.map((pkg) => `--filter=${pkg}`);
  exec("pnpm", ["exec", "turbo", "run", "build", ...filters], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

export function runBootstrap(argv = [], { repoRoot = REPO_ROOT, exec = execFileSync } = {}) {
  const checkOnly = argv.includes("--check");
  const steps = probeBootstrapSteps(repoRoot);

  process.stdout.write(`${formatBootstrapDecision(steps)}\n`);
  if (checkOnly) return;

  for (const step of steps) {
    runBootstrapStep(step, repoRoot, exec);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runBootstrap(process.argv.slice(2));
  } catch (err) {
    console.error(`[bootstrap-worktree] Error: ${err.message}`);
    process.exit(1);
  }
}
