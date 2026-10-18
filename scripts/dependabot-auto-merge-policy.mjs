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
 * Arm state (review M1, #6577): the decision above is made once per run, but
 * an armed auto-merge persists and GitHub merges whatever the head is when
 * CI goes green. #6577 merged a human "fix CI" commit that way. So every run
 * also reads the PR's live commits and auto-merge state, and
 * `decideArmState()` arms only when the policy says merge AND every commit is
 * Dependabot's; otherwise it disarms whatever is armed.
 *
 * CLI:
 *   dependabot-auto-merge-policy.mjs decide --ecosystem <e> --group <g>
 *     --update-type <t> --dependency-names <comma-separated>
 *   dependabot-auto-merge-policy.mjs arm-state --decision <merge|manual|none>
 *     --commits-file <gh api --paginate --slurp output> --auto-merge-enabled <true|false>
 */

import { readFileSync } from "node:fs";
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

const DEPENDABOT_LOGIN = "dependabot[bot]";
// GitHub's own committer identity: a commit Dependabot creates is committed
// by `web-flow` and signed by GitHub (measured on #6577's `31b7603202`).
const GITHUB_COMMITTER_LOGIN = "web-flow";

/**
 * A commit counts as Dependabot's only if all three hold. Author alone is
 * spoofable (the login is resolved from the author email); a verified
 * signature with `web-flow` as committer means GitHub itself created it, so a
 * local amend or rebase of a Dependabot commit (committer = the human) and an
 * unsigned commit carrying Dependabot's email both fail.
 *
 * @param {any} commit one item of GET /repos/{o}/{r}/pulls/{n}/commits
 */
export function isDependabotCommit(commit) {
  return (
    commit?.author?.login === DEPENDABOT_LOGIN &&
    commit?.committer?.login === GITHUB_COMMITTER_LOGIN &&
    commit?.commit?.verification?.verified === true
  );
}

/**
 * Every commit on the PR, not just the head: a foreign commit under a later
 * Dependabot commit would still merge. Accepts `--paginate --slurp` pages.
 * Fails closed on empty or malformed input.
 *
 * @param {unknown} commitsOrPages
 */
export function allCommitsByDependabot(commitsOrPages) {
  if (!Array.isArray(commitsOrPages)) return false;
  const commits = commitsOrPages.flat();
  return commits.length > 0 && commits.every(isDependabotCommit);
}

/**
 * @param {{ decision?: string, commitsByDependabot?: boolean, autoMergeEnabled?: boolean }} input
 * @returns {{ state: "arm" | "disarm" | "noop", reason: string }}
 */
export function decideArmState({ decision, commitsByDependabot, autoMergeEnabled } = {}) {
  const armed = autoMergeEnabled === true;
  if (decision === "merge" && commitsByDependabot === true) {
    return armed
      ? { state: "noop", reason: "Already armed for an all-Dependabot PR." }
      : { state: "arm", reason: "Policy decided merge and every commit is Dependabot's." };
  }
  let why = "This PR carries a commit not authored by Dependabot.";
  if (commitsByDependabot === true) {
    why =
      decision === "manual"
        ? "The auto-merge policy no longer decides merge for this PR."
        : "This run was not triggered by Dependabot, so the policy was not re-evaluated.";
  }
  return armed
    ? { state: "disarm", reason: `${why} Auto-merge disabled; requires manual review.` }
    : { state: "noop", reason: `${why} Nothing armed.` };
}

function readCommitsFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // fail closed: unreadable commits are not Dependabot's
  }
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function armStateCli(rest) {
  const commitsFile = readFlag(rest, "--commits-file");
  const result = decideArmState({
    decision: readFlag(rest, "--decision") ?? "",
    commitsByDependabot: allCommitsByDependabot(commitsFile ? readCommitsFile(commitsFile) : null),
    // Unknown auto-merge state counts as armed, so the run disarms (fail closed).
    autoMergeEnabled: readFlag(rest, "--auto-merge-enabled") !== "false",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand === "arm-state") {
    armStateCli(rest);
    return;
  }

  if (subcommand !== "decide") {
    console.error(
      "Usage: dependabot-auto-merge-policy.mjs decide --ecosystem <e> --group <g> " +
        "--update-type <t> --dependency-names <comma-separated>\n" +
        "       dependabot-auto-merge-policy.mjs arm-state --decision <d> " +
        "--commits-file <f> --auto-merge-enabled <true|false>"
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
