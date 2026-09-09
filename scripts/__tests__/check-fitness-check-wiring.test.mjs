/**
 * Regression guard for #4628: a `scripts/check-*.{mjs,js}` fitness check can
 * be fully implemented and fully unit-tested while running as part of
 * nothing — not `repo-audit`, not any workflow, not `.husky/`. That state
 * looked like protection (`scripts/check-hook-wiring.mjs` and
 * `scripts/check-deploy-secret-provisioning.mjs` both passed by hand) while
 * actually running in zero CI jobs, exactly the class `check-hook-wiring.mjs`
 * itself was built (#3607) to catch for `.claude/hooks/`. This closes the
 * same gap for the fitness-check scripts themselves, generalising rather
 * than asserting only the two instances #4628 found — see #4627 for the
 * third (`check-workflow-deps.mjs`), already wired.
 *
 * A check counts as wired if its filename appears (as a literal substring)
 * in root `package.json`, `.husky/pre-push`, or any `.github/workflows/*.yml`
 * file — or is listed in ALLOWLIST with a one-line reason.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * `scripts/check-*.{mjs,js}` files intentionally not wired into repo-audit
 * or a workflow. Key: filename. Value: one-line reason.
 */
export const ALLOWLIST = {
  "check-api-surface-invariants.mjs":
    "probes a live deployment; lives in post-deploy-check.yml only, deliberately excluded from repo-audit (see #4628)",
};

/** POSIX-relative filenames of every top-level scripts/check-*.{mjs,js} file. */
export function listCheckScripts(root = ROOT) {
  return readdirSync(join(root, "scripts"))
    .filter((f) => /^check-.*\.(mjs|js)$/.test(f))
    .sort();
}

/** Text of everything that can make a fitness check "wired". */
export function collectWiringHaystack(root = ROOT) {
  const texts = [
    readFileSync(join(root, "package.json"), "utf-8"),
    readFileSync(join(root, ".husky", "pre-push"), "utf-8"),
  ];
  const workflowsDir = join(root, ".github", "workflows");
  for (const file of readdirSync(workflowsDir)) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    texts.push(readFileSync(join(workflowsDir, file), "utf-8"));
  }
  return texts.join("\n");
}

/** Fitness-check scripts referenced nowhere and not allowlisted. */
export function findOrphanedFitnessChecks(root = ROOT, allowlist = ALLOWLIST) {
  const haystack = collectWiringHaystack(root);
  return listCheckScripts(root).filter((file) => !(file in allowlist) && !haystack.includes(file));
}

describe("every scripts/check-*.{mjs,js} fitness check is wired somewhere", () => {
  it("has no orphaned check script in the real repo tree", () => {
    expect(findOrphanedFitnessChecks()).toEqual([]);
  });
});
