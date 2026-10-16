#!/usr/bin/env node

/**
 * dependabot-auto-merge-policy.mjs — auto-merge decision for
 * `.github/workflows/dependabot-auto-merge.yml` (#6650).
 *
 * Extracted to a pure module so the merge rule and its test coverage live
 * next to each other instead of inline workflow YAML — mirrors
 * `merge-queue-eligibility.mjs` / `merge-queue.yml`.
 *
 * `decideDependabotMerge` double-checks dependency names against the
 * group's own prefix (owner for official-actions, `@types/` for types), not
 * just the group label — defense in depth so a future `dependabot.yml`
 * pattern edit cannot silently widen the merge set (architecture.md § 2
 * assumption). Fail closed throughout: an unknown/empty group, empty
 * `dependencyNames`, or any name failing its group's prefix check all fall
 * through to manual.
 */

import { fileURLToPath } from "node:url";

const OFFICIAL_ACTION_PREFIX = /^(actions|github)\//;
const TYPES_PREFIX = "@types/";

/**
 * Pure policy decision. Rules, in order (architecture.md § 2):
 *
 * 1. `updateType === "version-update:semver-major"` -> manual.
 * 2. `group === "dev-deps"` -> merge (existing behavior, unchanged).
 * 3. `group === "official-actions"` AND every name matches
 *    `^(actions|github)\//` -> merge.
 * 4. `group === "types"` AND every name starts `@types/` -> merge.
 * 5. Otherwise manual — reason names "production dependency" only for an
 *    npm ecosystem; a non-npm update is described as what it is.
 *
 * @param {{ ecosystem?: string, group?: string, updateType?: string, dependencyNames?: string[] }} input
 * @returns {{ action: "merge" | "manual", reason: string }}
 */
export function decideDependabotMerge({
  ecosystem = "",
  group = "",
  updateType = "",
  dependencyNames = [],
} = {}) {
  if (updateType === "version-update:semver-major") {
    return { action: "manual", reason: "semver-major update requires human approval" };
  }

  if (group === "dev-deps") {
    return { action: "merge", reason: "dev-deps group — unchanged existing behavior" };
  }

  if (group === "official-actions") {
    if (
      dependencyNames.length > 0 &&
      dependencyNames.every((name) => OFFICIAL_ACTION_PREFIX.test(name))
    ) {
      return { action: "merge", reason: "official-actions group — actions/* or github/* owner" };
    }
    return {
      action: "manual",
      reason: "official-actions group but a dependency name failed the owner-prefix check",
    };
  }

  if (group === "types") {
    if (
      dependencyNames.length > 0 &&
      dependencyNames.every((name) => name.startsWith(TYPES_PREFIX))
    ) {
      return { action: "merge", reason: "types group — every dependency is @types/*" };
    }
    return {
      action: "manual",
      reason: "types group but a dependency name failed the @types/ prefix check",
    };
  }

  const isNpm = ecosystem === "npm_and_yarn" || ecosystem === "npm";
  return {
    action: "manual",
    reason: isNpm
      ? "production dependency (no auto-merge group) — requires human approval"
      : "third-party GitHub Action (no auto-merge group) — requires human approval",
  };
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand !== "decide") {
    console.error(
      "Usage: dependabot-auto-merge-policy.mjs decide --ecosystem <ecosystem> " +
        "--group <group> --update-type <update-type> --dependency-names <comma-separated-names>"
    );
    process.exit(1);
  }

  const ecosystem = readFlag(rest, "--ecosystem") ?? "";
  const group = readFlag(rest, "--group") ?? "";
  const updateType = readFlag(rest, "--update-type") ?? "";
  const dependencyNamesFlag = readFlag(rest, "--dependency-names") ?? "";
  const dependencyNames = dependencyNamesFlag
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  process.stdout.write(
    `${JSON.stringify(decideDependabotMerge({ ecosystem, group, updateType, dependencyNames }))}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
