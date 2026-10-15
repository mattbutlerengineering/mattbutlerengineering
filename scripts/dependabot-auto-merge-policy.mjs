#!/usr/bin/env node
/**
 * Pure policy for `dependabot-auto-merge.yml` (#6650).
 *
 * Decided by Matt 2026-10-14: auto-merge on green CI, patch/minor only, for
 * (a) GitHub Actions owned by `actions` or `github`, and (b) all `@types/*`
 * packages regardless of dependency type. Everything else stays manual.
 *
 * Fail-closed: a missing group, empty name list, missing update type, or a
 * name failing its group's prefix check is "manual". The prefix check is a
 * second line of defence so an edit to dependabot.yml's group patterns cannot
 * silently widen the set of PRs that merge themselves.
 *
 * The workflow branches on the printed `action`, never on the exit code, so a
 * policy "manual" is not a red step.
 *
 * CLI:
 *   dependabot-auto-merge-policy.mjs decide --ecosystem <e> --group <g>
 *     --update-type <t> --dependency-names <comma-separated>
 */

import { fileURLToPath } from "node:url";

const MAJOR = "version-update:semver-major";
const OFFICIAL_ACTION_NAME = /^(actions|github)\//;
const TYPES_NAME = /^@types\//;
const NPM_ECOSYSTEMS = new Set(["npm", "npm_and_yarn"]);

const merge = (reason) => ({ action: "merge", reason });
const manual = (reason) => ({ action: "manual", reason });

function describeManual(ecosystem) {
  if (NPM_ECOSYSTEMS.has(ecosystem)) {
    return "This is a production dependency update and requires manual review.";
  }
  if (ecosystem === "github_actions") {
    return "This is a third-party GitHub Action update and requires manual review.";
  }
  return "This update is not covered by the auto-merge policy and requires manual review.";
}

/**
 * @param {{ ecosystem?: string, group?: string, updateType?: string, dependencyNames?: string[] }} input
 * @returns {{ action: "merge" | "manual", reason: string }}
 */
export function decideDependabotMerge({
  ecosystem = "",
  group = "",
  updateType = "",
  dependencyNames = [],
} = {}) {
  const names = Array.isArray(dependencyNames) ? dependencyNames : [];

  if (!updateType) return manual("Update type is unknown; requires manual review.");
  if (updateType === MAJOR) return manual("Major version updates require manual review.");
  if (names.length === 0) return manual("No dependency names reported; requires manual review.");

  if (group === "dev-deps") return merge("Dev dependency patch/minor update.");

  if (group === "official-actions") {
    return names.every((n) => OFFICIAL_ACTION_NAME.test(n))
      ? merge("Official (actions/*, github/*) GitHub Action patch/minor update.")
      : manual("Group contains a non-official GitHub Action; requires manual review.");
  }

  if (group === "types") {
    return names.every((n) => TYPES_NAME.test(n))
      ? merge("@types/* patch/minor update.")
      : manual("Group contains a non-@types package; requires manual review.");
  }

  return manual(describeManual(ecosystem));
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand !== "decide") {
    console.error(
      "Usage: dependabot-auto-merge-policy.mjs decide --ecosystem <e> --group <g> " +
        "--update-type <t> --dependency-names <comma-separated>"
    );
    process.exit(1);
  }

  const dependencyNames = (readFlag(rest, "--dependency-names") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

  const decision = decideDependabotMerge({
    ecosystem: readFlag(rest, "--ecosystem") ?? "",
    group: readFlag(rest, "--group") ?? "",
    updateType: readFlag(rest, "--update-type") ?? "",
    dependencyNames,
  });
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
