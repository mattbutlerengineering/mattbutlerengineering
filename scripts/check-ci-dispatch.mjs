#!/usr/bin/env node

/**
 * Architecture fitness test: every workflow that opens a pull request must also
 * dispatch ci.yml on that PR's branch.
 *
 * GitHub's anti-recursion rule means events produced with the job's
 * GITHUB_TOKEN — including a PR opened by `gh pr create` or
 * peter-evans/create-pull-request — never trigger another workflow. So the
 * `pull_request` CI run never fires, the required `CI Gate` check never
 * reports, and the PR sits permanently BLOCKED with no way to merge.
 *
 * `workflow_dispatch` is a documented exception to that rule (it is an
 * explicit API call, not a passive event), so `gh workflow run ci.yml --ref
 * <branch>` produces a CI run on the branch head and unblocks the merge.
 * That call needs `actions: write`, which is checked too — without it the
 * dispatch fails at run time and the PR is blocked exactly as before.
 *
 * Usage: node scripts/check-ci-dispatch.mjs
 * Exit code: 0 if every PR-opening workflow dispatches CI, 1 otherwise
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const OPENS_PR = /gh\s+pr\s+create|peter-evans\/create-pull-request/;
const DISPATCHES_CI = /gh\s+workflow\s+run\s+ci\.yml/;
const GRANTS_ACTIONS_WRITE = /^\s*actions:\s*write\s*$/m;

/** Pure check for a single workflow — returns findings, never logs or exits. */
export function checkWorkflow(name, content) {
  const createsPr = OPENS_PR.test(content);
  const dispatchesCi = DISPATCHES_CI.test(content);
  const errors = [];

  if (createsPr && !dispatchesCi) {
    errors.push(
      "opens a pull request but never dispatches CI on its branch — " +
        'add a `gh workflow run ci.yml --ref "$BRANCH"` step after the PR is created'
    );
  } else if (createsPr && !GRANTS_ACTIONS_WRITE.test(content)) {
    errors.push(
      "dispatches CI but does not grant `actions: write` — " +
        "the dispatch will fail at run time and the PR stays blocked"
    );
  }

  return { name, createsPr, dispatchesCi, errors };
}

/** Scans every workflow in `<root>/.github/workflows`. */
export function findCiDispatchFindings(root = DEFAULT_ROOT) {
  const workflowsDir = join(root, ".github", "workflows");

  if (!existsSync(workflowsDir)) {
    return { results: [], findings: [] };
  }

  const results = readdirSync(workflowsDir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .sort()
    .map((file) => checkWorkflow(file, readFileSync(join(workflowsDir, file), "utf-8")));

  const findings = results.flatMap((result) =>
    result.errors.map((error) => ({ workflow: result.name, error }))
  );

  return { results, findings };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-ci-dispatch.mjs");

if (isMain) {
  const { findings } = findCiDispatchFindings();

  const exitCode = runCheck({
    name: "CI dispatch on automation PRs",
    findings,
    formatFinding: (finding) => `${finding.workflow}: ${finding.error}`,
    passMessage: "PASS: Every workflow that opens a PR dispatches CI on its branch.",
    failMessage:
      "FAIL: Some workflows open a PR that CI will never run on.\n" +
      "A GITHUB_TOKEN-authored PR does not trigger the `pull_request` event, so the\n" +
      "required CI Gate check never reports and the PR cannot be merged.\n" +
      "See .github/workflows/pr-metrics.yml for the expected dispatch pattern.",
  });
  process.exit(exitCode);
}
