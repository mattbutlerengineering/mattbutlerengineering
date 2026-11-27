#!/usr/bin/env node

/**
 * Fails when any open issue carries `ready` together with `ready-for-human`
 * (#9426) or `needs-human` (#9884).
 *
 * `ready` means an agent can pick the issue up now; `ready-for-human` means an
 * agent cannot proceed. They are mutually exclusive by design, but nothing
 * enforced it and #4670, #7715 and #9234 carried both. Write-time exclusion
 * lives in `stale-human-blocked.mjs`; this is the backstop for every other
 * writer (including a human applying a label by hand).
 *
 * The check reads live GitHub state. When `gh` cannot answer (no token in the
 * environment, a GraphQL-blocked CCR session, offline) it prints an explicit
 * UNVERIFIED line and exits `UNVERIFIED_EXIT_CODES["github-unreachable"]`,
 * which `run-repo-audit.mjs` maps to its UNVERIFIED outcome: reported apart
 * from PASS, but not reddening the run for an environmental reason.
 *
 * It exits non-zero rather than 0 (#9922) because exit 0 made the audit print
 * `PASS check-ready-label-exclusive` for a gate that never ran -- and `gh`
 * answering is the exception, not the rule: GraphQL-backed `gh issue list` is
 * blocked in CCR sessions and CI's Build job passes no token, so the only
 * place the query actually resolves is a developer machine. A skipped gate
 * reading exactly like a green one is the failure class of #5527-#5531.
 */

import { execFileSync } from "node:child_process";

import { runCheck } from "./lib/fitness-check.mjs";

const READY_LABEL = "ready";
const READY_FOR_HUMAN_LABEL = "ready-for-human";
const NEEDS_HUMAN_LABEL = "needs-human";
export const HUMAN_BLOCKING_LABELS = [READY_FOR_HUMAN_LABEL, NEEDS_HUMAN_LABEL];

/**
 * Why the check could not produce a verdict, as a distinct non-zero exit code
 * (the same attribution pattern as `check-rialto-changeset.mjs`'s
 * `BLOCKED_EXIT_CODES`). `run-repo-audit.mjs` declares this code in the
 * check's `unverified` map; an undeclared code stays a plain failure.
 */
export const UNVERIFIED_EXIT_CODES = {
  "github-unreachable": 13,
};

const names = (issue) => (issue?.labels ?? []).map((l) => (typeof l === "string" ? l : l?.name));

/**
 * Pure: open issues carrying both labels.
 *
 * @param {Array<{number:number,title?:string,state?:string,labels?:Array}>} issues
 * @returns {{ findings: string[] }}
 */
export function findConflictingIssues(issues) {
  const findings = (issues ?? [])
    .filter((i) => String(i?.state ?? "OPEN").toUpperCase() === "OPEN")
    .filter((i) => names(i).includes(READY_LABEL))
    .filter((i) => HUMAN_BLOCKING_LABELS.some((l) => names(i).includes(l)))
    .map((i) => `#${i.number}${i.title ? ` ${i.title}` : ""}`);
  return { findings };
}

/** @returns {Array} open `ready` issues, straight from `gh`; the pure check filters for the human-blocking labels. */
function listReadyIssues() {
  const raw = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      READY_LABEL,
      "--json",
      "number,title,state,labels",
      "--limit",
      "200",
    ],
    { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(raw);
}

/* c8 ignore start -- thin CLI over the pure function above; exercised via repo-audit */
if (process.argv[1] && process.argv[1].endsWith("check-ready-label-exclusive.mjs")) {
  let issues;
  try {
    issues = listReadyIssues();
  } catch (error) {
    const reason = String(error.message).split("\n")[0];
    process.stdout.write(
      `UNVERIFIED: check-ready-label-exclusive could not query GitHub (${reason})\n`
    );
    process.exit(UNVERIFIED_EXIT_CODES["github-unreachable"]);
  }
  const { findings } = findConflictingIssues(issues);
  process.exit(
    runCheck({
      name: "ready / human-blocked exclusivity",
      findings,
      formatFinding: (line) => line,
      failMessage: `FAIL: open issues carry \`${READY_LABEL}\` with \`${READY_FOR_HUMAN_LABEL}\` or \`${NEEDS_HUMAN_LABEL}\` (mutually exclusive). Remove \`${READY_LABEL}\`:`,
    })
  );
}
/* c8 ignore stop */
