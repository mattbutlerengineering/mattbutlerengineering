/**
 * Create GitHub issues for failing checks, deduplicating via `state.issuesCreated`.
 *
 * Reuses `gh` CLI (already required for every other skill in this repo).
 * No network calls from inside the check functions themselves — only at
 * "apply" time, via this module.
 *
 * The skip/create/reopen decision itself is delegated to the shared
 * `fileIssue()` module (#3672) — this file only supplies the gh-CLI-backed
 * side effects it needs.
 */

import { execFileSync } from "node:child_process";
import { checkDetectionLabel, isCheckCriterion } from "./detection-label.js";
import { fileIssue, isIssueNotFoundError } from "../../../../scripts/lib/issue-filing.mjs";

/**
 * Map gh's `state`/`stateReason` to a fileIssue state. CLOSED + NOT_PLANNED is
 * an Owner veto and must never be reopened.
 *
 * @param {string} state
 * @param {string | null | undefined} stateReason
 * @returns {"open" | "closed" | "vetoed" | "error"}
 */
export function classifyIssueState(state, stateReason) {
  const s = String(state).toLowerCase();
  if (s === "open") return "open";
  if (s === "closed") {
    return String(stateReason ?? "").toLowerCase() === "not_planned" ? "vetoed" : "closed";
  }
  return "error";
}

/**
 * @param {number} issueNumber
 * @returns {"open" | "closed" | "vetoed" | "missing" | "error"}
 */
function getIssueState(issueNumber) {
  try {
    const out = execFileSync(
      "gh",
      ["issue", "view", String(issueNumber), "--json", "state,stateReason"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const { state, stateReason } = JSON.parse(out);
    return classifyIssueState(state, stateReason);
  } catch (err) {
    return isIssueNotFoundError(err) ? "missing" : "error";
  }
}

/**
 * Create a GitHub issue and return its number.
 * @param {string} title
 * @param {string} body
 * @param {string[]} labels
 * @returns {number} issue number
 */
function createIssue(title, body, labels) {
  // `gh issue create` prints the issue URL on success. Parse the number from its tail.
  const args = ["issue", "create", "--title", title, "--body", body];
  for (const L of labels) args.push("--label", L);
  const url = execFileSync("gh", args, { encoding: "utf-8" }).trim();
  const match = url.match(/\/issues\/(\d+)\s*$/);
  if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
  return parseInt(match[1], 10);
}

/**
 * Reopen a previously-closed GitHub issue.
 * @param {number} issueNumber
 */
function reopenIssue(issueNumber) {
  execFileSync("gh", ["issue", "reopen", String(issueNumber)], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Build the GitHub issue body for a failing ACMM criterion, including agent frontmatter.
 *
 * ACMM gap issues default to haiku tier (small, file-presence tasks).
 * Humans can edit the agent block to override the tier before the issue-worker picks it up.
 *
 * @param {import("../sources/types.js").Criterion} c
 * @returns {string}
 */
export function buildIssueBody(c) {
  const patterns = Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern];

  return [
    `**Missing canonical-ACMM criterion.**`,
    ``,
    `- **Source:** ${c.source}`,
    `- **Level:** L${c.level}`,
    `- **Category:** ${c.category}`,
    `- **Name:** ${c.name}`,
    ``,
    `**Description:**`,
    c.description,
    ``,
    `**Why it matters:**`,
    c.rationale,
    ``,
    ...(c.details ? [`**Implementation note:**`, c.details, ``] : []),
    ...(isCheckCriterion(c)
      ? [`**Detection:** ${checkDetectionLabel(c)}`]
      : [`**Detection:** any of:`, ...patterns.map((p) => `- \`${p}\``)]),
    ``,
    `_Filed automatically by \`/acmm-audit --apply\`. See \`.claude/acmm/report.md\` for the full scorecard._`,
    ``,
    `\`\`\`yaml agent`,
    `model: haiku  # ACMM gap issues are typically small file-presence tasks`,
    `budget: 0.25`,
    `\`\`\``,
  ].join("\n");
}

/**
 * Apply issues for failing canonical-ACMM criteria. Returns updated `issuesCreated` map.
 *
 * Dedup rules — decided by the shared `fileIssue()` module (#3672), keyed on
 * criterion id against `issuesCreated`:
 *   1. No entry yet                        → create, store.
 *   2. Entry, issue currently open          → skip (don't spam).
 *   3. Entry, issue currently closed        → reopen the existing issue (no dupe).
 *   4. Entry, closed as "not planned"       → skip-vetoed (Owner veto, never reopen).
 *
 * @param {Array<import("../sources/types.js").Criterion>} failing
 * @param {Record<string, number>} existingIssues
 * @param {{ dryRun?: boolean, extraLabels?: string[] }} [opts]
 * @returns {{ issuesCreated: Record<string, number>, createdCount: number, skippedOpen: number, skippedVetoed: number, reopenedCount: number }}
 */
export function applyIssuesForFailures(failing, existingIssues, opts = {}) {
  let ledger = { ...existingIssues };
  let createdCount = 0;
  let skippedOpen = 0;
  let skippedVetoed = 0;
  let reopenedCount = 0;

  for (const c of failing) {
    if (opts.dryRun) {
      // Preview mode never talks to gh — always reports as a would-be create.
      ledger = { ...ledger, [c.id]: -1 };
      createdCount += 1;
      continue;
    }

    const title = `[ACMM ${c.id} · L${c.level} ${c.category}] ${c.name}`;
    const body = buildIssueBody(c);
    const labels = ["acmm", "audit", ...(opts.extraLabels || [])];

    const result = fileIssue({ title, body, labels, dedupeKey: c.id }, ledger, {
      getIssueState,
      createIssue,
      reopenIssue,
    });
    ledger = result.ledger;

    if (result.action === "skip") skippedOpen += 1;
    else if (result.action === "skip-vetoed") skippedVetoed += 1;
    else if (result.action === "create") createdCount += 1;
    else if (result.action === "reopen") reopenedCount += 1;
  }

  return { issuesCreated: ledger, createdCount, skippedOpen, skippedVetoed, reopenedCount };
}

/**
 * Ensure the `acmm` and `ready` labels exist on the current repo. Idempotent.
 * Caller handles the one-shot nature — running repeatedly is cheap but noisy.
 */
export function ensureAcmmLabel() {
  try {
    execFileSync(
      "gh",
      [
        "label",
        "create",
        "acmm",
        "--color",
        "d4a030",
        "--description",
        "AI Codebase Maturity Model finding",
        "--force",
      ],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    execFileSync(
      "gh",
      [
        "label",
        "create",
        "ready",
        "--color",
        "0e8a16",
        "--description",
        "Task is ready for an autonomous agent to pick up",
        "--force",
      ],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch {
    // --force succeeds when label exists; any other failure is non-fatal (user may lack perms)
  }
}
