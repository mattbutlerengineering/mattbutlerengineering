#!/usr/bin/env node

/**
 * bootstrap-worktree.mjs — decides whether a worktree needs
 * `pnpm install` / a `turbo build` of dist-consumed packages before tests,
 * typecheck, or an app dev server can run in it (docs/features/bootstrap-worktree).
 *
 * Only the pure core lives here so far (WO-6): `decideBootstrapSteps` and
 * `distConsumedPackages`. The fs probe layer and CLI/`--check` entrypoint
 * are WO-7.
 */

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
