#!/usr/bin/env node

/**
 * Fails when `changeset version` would error before it ever reaches the
 * Release workflow (#3322).
 *
 * Root cause of the incident this guards against: `packages/rialto`
 * declared `@mbe/api-client` (a `private: true` workspace-only package) as
 * a `peerDependencies` entry. `.changeset/config.json` has no
 * `privatePackages.version` override, so private packages are always
 * "skipped" for versioning (`@changesets/should-skip-package`). A
 * `peerDependencies`/`dependencies` edge onto a skipped package makes the
 * *depending* package's tree invalid unless it's skipped too
 * (`@changesets/config`'s `alsoSkipDependentsOfSkipped` rule) —
 * `devDependencies` edges are exempt (`ignoreDevDependencies: true`).
 * rialto is public and versioned by design, so `changeset version` errored
 * with "Invalid tree" on every push to main once #5713 removed the
 * NPM_TOKEN credential guard that used to skip the step (it silently
 * masked this for ~5 months while 34+ changesets stacked up).
 *
 * `changeset status` runs the exact same `@changesets/config` validation
 * `changeset version` does — both call `readConfig`, where the rule lives
 * — but never touches `@changesets/get-github-info`, so it needs no
 * `GITHUB_TOKEN` and produces no side effects. Confirmed locally by
 * toggling the bug back in: `status` fails with the identical "Invalid
 * tree" message `version` does, on the identical config. That makes it a
 * cheap, safe proxy for "would the Release workflow's Version packages
 * step error right now" — run on every PR via `pnpm repo-audit`, this
 * catches the class before it merges, not after it reaches main.
 *
 * Deliberately NOT re-implemented against `@changesets/config` internals
 * directly: that would mean depending on a private changesets subpackage
 * not declared anywhere in this repo's package.json and re-deriving a
 * validation rule that already exists, drifting the moment changesets
 * changes it. Shelling out to the real `changeset status` binary is a
 * thinner, more honest surface — it can never disagree with what
 * `changeset version` actually does.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runCheck } from "./lib/fitness-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGESET_BIN = join(ROOT, "node_modules", ".bin", "changeset");

/**
 * Pure classifier over a `changeset status` invocation's raw result.
 * Exported so tests cover the parsing logic without spawning a process.
 *
 * @param {{ status: number | null, output: string }} result
 * @returns {string[]} findings; empty means PASS
 */
export function classifyChangesetStatus({ status, output }) {
  if (status === 0) return [];

  const configErrorMatch = output.match(/Found issues in your config:\n([\s\S]*?)\n🦋/);
  if (configErrorMatch) {
    return configErrorMatch[1]
      .split("\n")
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean);
  }

  return [output.trim() || `changeset status exited ${status}`];
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-changeset-tree.mjs");

if (isMain) {
  const result = spawnSync(CHANGESET_BIN, ["status"], { cwd: ROOT, encoding: "utf-8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const findings = classifyChangesetStatus({ status: result.status, output });

  process.exit(
    runCheck({
      name: "changeset tree validity",
      findings,
      formatFinding: (line) => line,
      passMessage: "PASS: changeset tree validity (`changeset version` would not error)",
      failMessage:
        "FAIL: `changeset version` would error before it reaches the Release workflow.\n" +
        "This is almost always a `dependencies`/`peerDependencies` edge (NOT\n" +
        "devDependencies) from a versioned package onto a private or ignored one —\n" +
        "changesets treats every non-dev edge as real, so the private side being\n" +
        "skipped makes the public side an invalid tree unless it's skipped too.\n" +
        'Fix by moving the edge to "devDependencies" if the public package only\n' +
        "needs it inside this workspace, or by revisiting .changeset/config.json's\n" +
        "ignore/privatePackages settings. See .claude/rules/gotchas.md § Releases.\n" +
        "Raw `changeset status` output:",
    })
  );
}
