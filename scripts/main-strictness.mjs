#!/usr/bin/env node
/**
 * main-strictness.mjs — fail-closed probe for whether `main`'s branch
 * protection requires branches to be up to date ("strict").
 *
 * WHY (ADR-027, amending ADR-023): the implement-queue's zone-spread batch
 * composer may admit several same-zone issues with disjoint file scopes ONLY
 * when main is measured non-strict. Branch protection is repo STATE, not repo
 * code (gotchas § CI), so it is re-probed each iteration.
 *
 * Fail closed: only a successfully parsed literal `strict: false` yields
 * `{ strictMain: false }`. Any error, non-JSON, or missing/non-boolean field
 * yields `{ strictMain: true }` — today's one-issue-per-zone behaviour.
 *
 * This script is READ-ONLY: it issues one GET and never edits protection.
 *
 * CLI: `node scripts/main-strictness.mjs` prints `{"strictMain":<bool>}`.
 *
 * @module main-strictness
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STRICT = Object.freeze({ strictMain: true });
const NOT_STRICT = Object.freeze({ strictMain: false });

/**
 * Pure classifier.
 *
 * @param {unknown} output — raw stdout of the `gh api` call
 * @param {unknown} error — truthy if the call failed
 * @returns {{ strictMain: boolean }}
 */
function classifyMainStrictness(output, error) {
  if (error || typeof output !== "string") return { ...STRICT };
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { ...STRICT };
  }
  if (parsed !== null && typeof parsed === "object" && parsed.strict === false) {
    return { ...NOT_STRICT };
  }
  return { ...STRICT };
}

/**
 * Thin wrapper: one GET against the required-status-checks endpoint.
 *
 * @returns {{ strictMain: boolean }}
 */
function probeMainStrictness() {
  let output = null;
  let error = null;
  try {
    output = execFileSync(
      "gh",
      ["api", "repos/{owner}/{repo}/branches/main/protection/required_status_checks"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch (err) {
    error = err;
  }
  return classifyMainStrictness(output, error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(probeMainStrictness())}\n`);
}

export { classifyMainStrictness, probeMainStrictness };
