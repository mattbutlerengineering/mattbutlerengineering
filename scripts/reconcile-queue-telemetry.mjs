#!/usr/bin/env node
/**
 * reconcile-queue-telemetry.mjs — fill the outcome fields queue-telemetry rows
 * are written without.
 *
 * queue-telemetry-store.mjs appends rows at worker-completion time, when
 * merged/merged_at/ci_first_pass/rework_cycles are unknowable. This script is
 * the reconciliation pass those fields have always promised: for each
 * incomplete row, it asks GitHub (REST only) what became of the PR, joins the
 * cost ledgers, and rewrites the sink.
 *
 * A row is "incomplete" when any reconcilable field (merged, merged_at,
 * ci_first_pass, reviewer_verdict, cost_usd, model_tier) is null and has no
 * `unknown_reasons` entry. Rows whose every field is known or carries a reason
 * are never re-fetched, so a second run makes zero calls (idempotent).
 *
 * Field semantics after reconciliation (per-row merge: reconcile-telemetry-row.mjs):
 *   merged          MERGED → true; CLOSED → false; OPEN → row left pending
 *   merged_at       PR mergedAt (merged rows only)
 *   rework_cycles   max(0, commitCount − 1) — extra commits after the first
 *   ci_first_pass   CI Gate result on the PR's first head SHA when GitHub has
 *                   one. FALLBACK when it has none: merged && rework_cycles
 *                   === 0, the old heuristic (a squash-merged single-commit PR
 *                   never needed a fix-up push; undercounts reruns that passed
 *                   without a new commit).
 *   reviewer_verdict, cost_usd, model_tier   from the PR comments and the cost
 *                   ledgers; unknown ones record why in `unknown_reasons`.
 *
 *   human_touch_reason  rows merged by this pass with rework_cycles > 0 only —
 *                   why a non-author commit was needed, per
 *                   classify-human-touch.mjs. Omitted (not null) when
 *                   unmatchable, matching the backfill script's semantics (#4239).
 *
 * A `{ error }` (or throw) from the PR source leaves the row as it was: a
 * transient failure is not an answer. Rows with no PR older than 30 days are
 * marked merged=false and get `no-pr` on the outcome fields that can never be
 * known. GitHub lookups are capped per run (`--max-calls`, default 50); the
 * cost lookup is local and uncounted.
 *
 * Pure core with dependency injection, matching queue-telemetry-store.mjs.
 */

import { readTelemetryRows, updateTelemetry, telemetryPath } from "./queue-telemetry-store.mjs";
import { RECONCILABLE_FIELDS } from "./queue-telemetry-store.mjs";
import { defaultFetchPrDetails, resolveHumanTouchReason } from "./backfill-human-touch-reasons.mjs";
import { reconcileTelemetryRow } from "./reconcile-telemetry-row.mjs";
import { fetchPrFacts } from "./lib/queue-telemetry-github-source.mjs";
import { loadCostIndex, lookupCost } from "./lib/queue-telemetry-cost-source.mjs";

const DEFAULT_MAX_CALLS = 50;
const STALE_PRLESS_DAYS = 30;

/** REST-only PR reader (`gh pr view` is GraphQL-backed and 403s in CCR). */
export const defaultFetchPr = fetchPrFacts;

const isNull = (v) => v === null || v === undefined;
const PR_FIELDS = ["merged", "merged_at", "ci_first_pass", "reviewer_verdict"];

const missingFields = (row) =>
  RECONCILABLE_FIELDS.filter((f) => isNull(row[f]) && !row.unknown_reasons?.[f]);

/**
 * Reconcile outcome fields on telemetry rows. Pure — returns new row objects,
 * never mutates the input.
 *
 * @param {Array<object>} inputRows - Parsed queue-telemetry rows.
 * @param {object} opts
 * @param {(prNumber: number) => object} [opts.fetchPr] - REST PR facts reader
 * @param {(prNumber: number) => { pr: object, humanCommit: object|null }} [opts.fetchPrDetails] -
 *   Omit to skip human-touch classification entirely (outcome fields only).
 * @param {Map<number, object>} [opts.costIndex] - from loadCostIndex
 * @param {Date} [opts.now]
 * @param {number} [opts.maxCalls]
 * @returns {{ rows: Array<object>, reconciled: number, calls: number }}
 */
export function reconcileTelemetry(
  inputRows,
  {
    fetchPr = defaultFetchPr,
    fetchPrDetails,
    costIndex = new Map(),
    now = new Date(),
    maxCalls = DEFAULT_MAX_CALLS,
  }
) {
  let reconciled = 0;
  let calls = 0;
  const staleCutoffMs = now.getTime() - STALE_PRLESS_DAYS * 24 * 60 * 60 * 1000;

  const rows = inputRows.map((row) => {
    const missing = missingFields(row);
    if (missing.length === 0) return { ...row };
    const cost = lookupCost(costIndex, row.issue_number);

    if (row.pr_number == null) {
      const claimedMs = Date.parse(row.claimed_at ?? "");
      if (!Number.isFinite(claimedMs) || claimedMs >= staleCutoffMs) return { ...row };
      reconciled += 1;
      const base = isNull(row.merged) ? { ...row, merged: false } : row;
      return reconcileTelemetryRow(base, { pr: null, cost });
    }

    // Only the cost fields are missing: no GitHub lookup needed.
    if (!missing.some((f) => PR_FIELDS.includes(f))) {
      reconciled += 1;
      return reconcileTelemetryRow(row, { pr: null, cost });
    }

    if (calls >= maxCalls) return { ...row };
    calls += 1;

    let pr;
    try {
      pr = fetchPr(row.pr_number);
    } catch {
      // Transient failure — leave the row pending for the next run.
      return { ...row };
    }
    if (!pr || "error" in pr || (pr.state !== "MERGED" && pr.state !== "CLOSED")) {
      return { ...row };
    }

    const merged = pr.state === "MERGED";
    const reworkCycles = merged && pr.commitCount != null ? Math.max(0, pr.commitCount - 1) : null;
    const facts = {
      ...pr,
      ciGateFirstPass:
        pr.ciGateFirstPass ?? (merged && reworkCycles !== null ? reworkCycles === 0 : null),
    };
    const out = reconcileTelemetryRow(row, { pr: facts, cost });
    reconciled += 1;
    if (reworkCycles !== null && isNull(row.rework_cycles)) out.rework_cycles = reworkCycles;

    // Classify here rather than in a later pass: this is the one moment the
    // row's outcome is known and the PR's commit history is still worth a
    // lookup. reworkCycles === 0 means no non-first commit exists, so there
    // is nothing a human could have touched — skip the call entirely.
    // A null result (unmatchable, non-agent PR, or a failed fetch) writes no
    // field at all; the outcome fields are never forfeited to it.
    if (
      fetchPrDetails &&
      isNull(row.merged) &&
      reworkCycles > 0 &&
      row.human_touch_reason === undefined
    ) {
      calls += 1;
      const reason = resolveHumanTouchReason(row.pr_number, fetchPrDetails);
      if (reason !== null) out.human_touch_reason = reason;
    }
    return out;
  });

  return { rows, reconciled, calls };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (readTelemetryRows().length === 0) {
    process.stdout.write("[reconcile-queue-telemetry] no telemetry rows — nothing to do\n");
    process.exit(0);
  }

  // The store collapses the rewrite on the row key before writing, so this
  // rewrite cannot reintroduce the duplicates that #4223, #4572 and #4719
  // put in the file (32 rows).
  const maxCallsArg = process.argv.indexOf("--max-calls");
  const maxCalls = maxCallsArg > -1 ? Number(process.argv[maxCallsArg + 1]) : DEFAULT_MAX_CALLS;
  if (!Number.isInteger(maxCalls) || maxCalls < 0) {
    process.stderr.write("[reconcile-queue-telemetry] --max-calls needs a non-negative integer\n");
    process.exit(1);
  }
  const costIndex = loadCostIndex();

  const { rows, removed, result } = updateTelemetry((current) => {
    const {
      rows: next,
      reconciled,
      calls,
    } = reconcileTelemetry(current, {
      fetchPr: defaultFetchPr,
      fetchPrDetails: defaultFetchPrDetails,
      costIndex,
      maxCalls,
    });
    return { rows: next, reconciled, calls };
  });

  if (removed > 0) {
    process.stdout.write(
      `[reconcile-queue-telemetry] collapsed ${removed} duplicate row(s) on (issue, pr)\n`
    );
  }
  const counts = RECONCILABLE_FIELDS.map((f) => {
    const filled = rows.filter((r) => !isNull(r[f])).length;
    const unknown = rows.filter((r) => isNull(r[f]) && r.unknown_reasons?.[f]).length;
    return `${f} ${filled}/${unknown}/${rows.length - filled - unknown}`;
  });
  process.stdout.write(
    `[reconcile-queue-telemetry] ${result.reconciled} row(s) reconciled (${result.calls} GitHub lookups) → ${telemetryPath()}\n` +
      `[reconcile-queue-telemetry] filled/unknown/incomplete: ${counts.join(", ")}\n`
  );
}
