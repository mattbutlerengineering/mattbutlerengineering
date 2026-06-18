/**
 * Create GitHub issues for failing checks, deduplicating via `state.issuesCreated`.
 *
 * Reuses `gh` CLI (already required for every other skill in this repo).
 * No network calls from inside the check functions themselves — only at
 * "apply" time, via this module.
 */

import { execFileSync } from "node:child_process";

/**
 * @param {number} issueNumber
 * @returns {"open" | "closed" | "missing"}
 */
function getIssueState(issueNumber) {
  try {
    const out = execFileSync(
      "gh",
      ["issue", "view", String(issueNumber), "--json", "state", "--jq", ".state"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const s = out.trim().toLowerCase();
    if (s === "open") return "open";
    if (s === "closed") return "closed";
    return "missing";
  } catch {
    return "missing";
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
    `**Detection:** any of:`,
    ...patterns.map((p) => `- \`${p}\``),
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
 * Dedup rules (match site-audit pattern):
 *   1. If `issuesCreated[criterionId]` is open    → skip (don't spam).
 *   2. If `issuesCreated[criterionId]` is closed  → create a fresh issue, overwrite entry.
 *   3. If no entry yet                            → create, store.
 *
 * @param {Array<import("../sources/types.js").Criterion>} failing
 * @param {Record<string, number>} existingIssues
 * @param {{ dryRun?: boolean, extraLabels?: string[] }} [opts]
 * @returns {{ issuesCreated: Record<string, number>, createdCount: number, skippedOpen: number }}
 */
export function applyIssuesForFailures(failing, existingIssues, opts = {}) {
  const updated = { ...existingIssues };
  let createdCount = 0;
  let skippedOpen = 0;

  for (const c of failing) {
    const prior = existingIssues[c.id];
    if (prior) {
      const state = getIssueState(prior);
      if (state === "open") {
        skippedOpen += 1;
        continue;
      }
      // Closed or missing — fall through to create a fresh one.
    }

    const title = `[ACMM ${c.id} · L${c.level} ${c.category}] ${c.name}`;
    const body = buildIssueBody(c);

    if (opts.dryRun) {
      updated[c.id] = -1; // placeholder
      createdCount += 1;
      continue;
    }

    const labels = ["acmm", "audit", ...(opts.extraLabels || [])];
    const num = createIssue(title, body, labels);
    updated[c.id] = num;
    createdCount += 1;
  }

  return { issuesCreated: updated, createdCount, skippedOpen };
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
