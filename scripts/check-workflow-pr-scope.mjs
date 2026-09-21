#!/usr/bin/env node

/**
 * Fails when a workflow reads pull requests without granting itself
 * pull-request read.
 *
 * A `GITHUB_TOKEN` without pull-request access is not refused when it reads
 * PRs. GitHub filters the results it may not see and answers **200 with an
 * empty list**. Every downstream consumer therefore observes "there are no
 * pull requests" and proceeds confidently on that, with a green step and no
 * error anywhere in the log. Declaring any `permissions:` block at all sets
 * every unlisted scope to `none`, so the omission is easy to make and
 * impossible to see at review time.
 *
 * Four instances before this check existed:
 *   - #5556  the landing page's proof strip rendered "0 PRs merged" — the
 *            measured value, written to a snapshot by a green job.
 *   - #5603/#5606/#5607/#5609/#5610/#5611  routine-liveness filed six issues
 *            declaring six healthy routines dark. All six were the `pr-title`
 *            signatures; the one `issue-label` routine classified correctly,
 *            because `issues: write` implies read.
 *   - revert-rca-detection  read a PR body through `gh pr view`, with an
 *            `|| echo ""` fallback that turned the empty result into an empty
 *            body the RCA then reasoned over.
 *   - stale-in-progress  decided whether an in-progress issue had an active
 *            PR. The empty list is not an exception, so its `catch` never
 *            fired and `recentPR` was always null — re-queueing issues that a
 *            worker had a live PR open on.
 *
 * The check is deliberately shallow: it asks whether a workflow that reads
 * PRs *anywhere* grants the scope *anywhere*. It does not try to match a
 * specific step to a specific job's permissions block. A per-job analysis
 * needs a real YAML parse and would trade a large false-negative surface for
 * precision this problem does not need — the fix is always "add the scope",
 * and granting it at file level is correct in every instance above.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { runCheck } from "./lib/fitness-check.mjs";

/** Reads of pull requests that a token without the scope silently empties. */
const PR_READ_PATTERNS = [
  /\bgh\s+pr\s+(?:list|view|diff|checks)\b/,
  /\bghClient\.pr\.(?:list|view)\b/,
  /\/search\/issues\b/,
  /\bis:pr\b/,
  /\blistPullRequests\b/,
  /\bpulls\/\$\{/,
];

/** Either scope satisfies the read; `write` implies `read`. */
const PR_SCOPE = /^\s*pull-requests:\s*(read|write)\s*$/m;

/**
 * Strips comments before matching, in both YAML and JS.
 *
 * Without this the check is wrong in both directions at once, which
 * `visual-diff-ref-sweep.yml` demonstrated on the first run: it grants
 * `pull-requests: read # gh pr list — which PRs are still open`, and that
 * single line both defeated the scope match (the trailing comment broke the
 * end-of-line anchor) and supplied a phantom `gh pr list` for the reader
 * match. A correctly-configured workflow was reported as the bug.
 *
 * A `#` is only a comment when it opens a token, so `--search "#${number}"`
 * survives — that form appears in stale-in-progress.yml's real command and
 * must not be truncated away.
 *
 * @param {string} source
 * @returns {string} source with comment text blanked out
 */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1")
    .replace(/(^|\s)#[^\n]*/g, "$1");
}

/** A workflow with no `permissions:` block keeps the repo default, which is not this bug. */
const PERMISSIONS_BLOCK = /^permissions:/m;

/**
 * @param {string} source - file contents to inspect
 * @returns {boolean} whether it reads pull requests
 */
export function readsPullRequests(source) {
  const code = stripComments(source);
  return PR_READ_PATTERNS.some((pattern) => pattern.test(code));
}

/**
 * The gate, as a pure decision.
 *
 * `scripts` maps a script path to its contents so a workflow that reads PRs
 * only indirectly — by running `node scripts/foo.mjs` — is still caught.
 * That indirection is exactly how routine-liveness.yml hid: the workflow
 * body contains no `gh pr` at all.
 *
 * @param {object} input
 * @param {{ name: string, source: string }[]} input.workflows
 * @param {Record<string, string>} [input.scripts] - path -> contents
 * @returns {{ findings: string[] }} Offending workflow names; empty means PASS.
 */
export function evaluateWorkflowPrScope({ workflows, scripts = {} }) {
  const findings = [];

  for (const { name, source } of workflows) {
    const declared = stripComments(source);
    if (!PERMISSIONS_BLOCK.test(declared)) continue;
    if (PR_SCOPE.test(declared)) continue;

    if (readsPullRequests(source)) {
      findings.push(`${name} — reads pull requests directly`);
      continue;
    }

    const invoked = [...declared.matchAll(/scripts\/[A-Za-z0-9./_-]+\.(?:mjs|js)/g)].map(
      (m) => m[0]
    );
    const culprit = [...new Set(invoked)].find(
      (path) => scripts[path] && readsPullRequests(scripts[path])
    );
    if (culprit) findings.push(`${name} — runs ${culprit}, which reads pull requests`);
  }

  return { findings };
}

export const FAIL_MESSAGE =
  "FAIL: these workflows read pull requests without granting pull-request read.\n" +
  "A token lacking the scope is NOT refused — GitHub filters out the results it\n" +
  "cannot see and returns 200 with an empty list, so the job goes green while\n" +
  "every consumer concludes there are no pull requests (#5556, #5603-#5611).\n" +
  "Declaring any permissions: block sets unlisted scopes to none.\n" +
  "Fix: add `pull-requests: read` to the workflow's permissions block.\n" +
  "Offending workflows:";

/* c8 ignore start -- thin CLI over the pure functions above; exercised via repo-audit */
const isMain = process.argv[1] && process.argv[1].endsWith("check-workflow-pr-scope.mjs");

if (isMain) {
  const read = (dir, file) => readFileSync(join(dir, file), "utf-8");

  const workflows = readdirSync(".github/workflows")
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => ({
      name: `.github/workflows/${file}`,
      source: read(".github/workflows", file),
    }));

  const scripts = Object.fromEntries(
    readdirSync("scripts")
      .filter((file) => file.endsWith(".mjs") || file.endsWith(".js"))
      .map((file) => [`scripts/${file}`, read("scripts", file)])
  );

  const { findings } = evaluateWorkflowPrScope({ workflows, scripts });

  process.exit(
    runCheck({
      name: "workflow pull-request scope",
      findings,
      formatFinding: (line) => line,
      passMessage: "PASS: workflow pull-request scope (every PR reader grants the scope)",
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
