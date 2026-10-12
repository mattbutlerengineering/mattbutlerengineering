#!/usr/bin/env node
/**
 * collect-queue-telemetry-from-github.mjs — scheduled backstop for
 * metrics/queue-telemetry.jsonl (#5921, root cause in
 * docs/fixes/queue-telemetry-root-cause.md).
 *
 * In-session rows are only persisted by a prose step in an ephemeral session,
 * so days with no /implement-queue session (or a session that skipped Phase 4)
 * leave gaps. This collector runs on a GitHub Actions runner (where `gh`
 * exists) and derives one pending row per merged agent PR the file does not
 * already cover, so the file keeps gaining rows without a human step.
 *
 * Fidelity tradeoff: tokens, tool uses, duration, model tier and reviewer
 * verdict only exist inside the worker session and cannot be reconstructed
 * from GitHub, so they are written as null. Outcome fields are left null too;
 * reconcile-queue-telemetry.mjs fills them. In-session rows, when present,
 * always win (the store refuses a placeholder for any covered PR).
 *
 * Pure core (`deriveTelemetryRows`) + a thin CLI. Node builtins and sibling
 * modules only (scripts/check-workflow-deps.mjs).
 *
 * Usage: node scripts/collect-queue-telemetry-from-github.mjs [--days 7] [--limit 100]
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAgentPr } from "../plugins/acmm/scripts/agent-pr.js";
import {
  appendTelemetryRow,
  coveredPrNumbers,
  readTelemetryRows,
} from "./queue-telemetry-store.mjs";

const CLOSING_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i;

/** @param {unknown} body @returns {number|null} */
export function extractClosedIssue(body) {
  if (typeof body !== "string") return null;
  const m = CLOSING_RE.exec(body);
  return m ? Number(m[1]) : null;
}

/**
 * Derive pending telemetry rows from merged PRs. Pure.
 *
 * @param {Array<object>} prs - `gh pr list --state merged --json ...` output.
 * @param {Array<object>} existingRows - Current queue-telemetry rows.
 * @returns {{ rows: object[], skipped: {existing: number, notAgent: number, noIssue: number} }}
 */
export function deriveTelemetryRows(prs, existingRows) {
  const covered = coveredPrNumbers(existingRows);
  const skipped = { existing: 0, notAgent: 0, noIssue: 0 };
  const rows = [];

  for (const pr of prs) {
    if (!isAgentPr(pr)) {
      skipped.notAgent += 1;
      continue;
    }
    if (covered.has(pr.number)) {
      skipped.existing += 1;
      continue;
    }
    const issue = extractClosedIssue(pr.body);
    if (issue === null) {
      skipped.noIssue += 1;
      continue;
    }
    rows.push({
      issue_number: issue,
      labels: [],
      model_tier: null,
      subagent_tokens: null,
      tool_uses: null,
      duration_ms: null,
      pr_number: pr.number,
      merged: null,
      ci_first_pass: null,
      rework_cycles: null,
      reviewer_verdict: null,
      claimed_at: pr.createdAt,
      merged_at: null,
      cost_usd: null,
    });
  }

  rows.sort((a, b) => a.claimed_at.localeCompare(b.claimed_at));
  return { rows, skipped };
}

/** @param {string[]} argv @param {string} name @param {number} fallback */
function numArg(argv, name, fallback) {
  const i = argv.indexOf(name);
  const n = i === -1 ? NaN : Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function main(argv) {
  const days = numArg(argv, "--days", 7);
  const limit = numArg(argv, "--limit", 100);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const raw = execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "merged",
      "--base",
      "main",
      "--search",
      `merged:>=${since}`,
      "--limit",
      String(limit),
      "--json",
      "number,headRefName,author,body,labels,createdAt,mergedAt",
    ],
    { encoding: "utf8" }
  );
  const prs = JSON.parse(raw);
  const { rows, skipped } = deriveTelemetryRows(prs, readTelemetryRows());

  let written = 0;
  for (const row of rows) {
    if (appendTelemetryRow(row, { ifPrAbsent: true }).written) written += 1;
  }
  console.log(
    `queue-telemetry: ${prs.length} merged PRs scanned, ${written} rows appended ` +
      `(skipped: ${skipped.existing} already recorded, ${skipped.notAgent} non-agent, ${skipped.noIssue} no closing issue)`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
