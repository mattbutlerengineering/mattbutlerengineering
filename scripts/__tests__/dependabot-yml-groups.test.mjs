/**
 * Pins the `.github/dependabot.yml` grouping shape that
 * `scripts/dependabot-auto-merge-policy.mjs` depends on (#6650,
 * architecture.md § 1): `github-actions` gets an `official-actions` group
 * (`actions/*`, `github/*`), and npm gets a `types` group (`@types/*`, no
 * `dependency-type` key) with `@types/*` removed from `dev-deps`'s patterns
 * so every package name matches exactly one group.
 *
 * Matching is simulated with dependabot's own semantics: `patterns` are
 * matched against the full package name (scoped names keep their `@`), and
 * `exclude-patterns` subtracts from that. A `*` in a pattern is a glob
 * wildcard, not regex `.*` sugar applied elsewhere in the repo.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadDependabotConfig() {
  return loadYaml(readFileSync(resolve(ROOT, ".github/dependabot.yml"), "utf8"));
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesAny(patterns, name) {
  return (patterns ?? []).some((pattern) => globToRegExp(pattern).test(name));
}

/** Groups (in declaration order) a package name would land in, dependabot-style. */
function matchingGroups(groups, name) {
  return Object.entries(groups ?? {})
    .filter(([, group]) => matchesAny(group.patterns, name))
    .filter(([, group]) => !matchesAny(group["exclude-patterns"], name))
    .map(([groupName]) => groupName);
}

function npmUpdate(config) {
  return config.updates.find((update) => update["package-ecosystem"] === "npm");
}

function githubActionsUpdate(config) {
  return config.updates.find((update) => update["package-ecosystem"] === "github-actions");
}

describe(".github/dependabot.yml groups (#6650)", () => {
  it("github-actions ecosystem declares an official-actions group for actions/* and github/*", () => {
    const update = githubActionsUpdate(loadDependabotConfig());
    expect(update.groups?.["official-actions"]?.patterns).toEqual(["actions/*", "github/*"]);
  });

  it("official-actions matches actions/* and github/* names, not third-party actions", () => {
    const update = githubActionsUpdate(loadDependabotConfig());
    expect(matchingGroups(update.groups, "actions/setup-node")).toEqual(["official-actions"]);
    expect(matchingGroups(update.groups, "github/codeql-action/upload-sarif")).toEqual([
      "official-actions",
    ]);
    expect(matchingGroups(update.groups, "hadolint/hadolint-action")).toEqual([]);
  });

  it("npm ecosystem declares a types group with no dependency-type key", () => {
    const update = npmUpdate(loadDependabotConfig());
    const typesGroup = update.groups?.types;
    expect(typesGroup?.patterns).toEqual(["@types/*"]);
    expect(typesGroup).not.toHaveProperty("dependency-type");
  });

  it("dev-deps no longer lists @types/* among its patterns", () => {
    const update = npmUpdate(loadDependabotConfig());
    expect(update.groups?.["dev-deps"]?.patterns).not.toContain("@types/*");
  });

  it("every sample npm package name matches exactly one group", () => {
    const update = npmUpdate(loadDependabotConfig());
    const samples = ["@types/node", "vitest", "@vitest/coverage-v8", "eslint", "zod"];
    for (const name of samples) {
      const groups = matchingGroups(update.groups, name);
      expect(groups, `expected exactly one group for ${name}, got [${groups}]`).toHaveLength(1);
    }
    expect(matchingGroups(update.groups, "@types/node")).toEqual(["types"]);
  });
});
