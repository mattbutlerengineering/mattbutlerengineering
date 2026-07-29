#!/usr/bin/env node
/**
 * reconcile-queue-telemetry.mjs — fill the outcome fields queue-telemetry rows
 * are written without.
 *
 * collect-queue-telemetry.mjs appends rows at worker-completion time, when
 * merged/merged_at/ci_first_pass/rework_cycles are unknowable. This script is
 * the reconciliation pass those fields have always promised: for each pending
 * row with a PR, it asks GitHub what became of that PR and rewrites the sink.
 *
 * Field semantics after reconciliation:
 *   merged          MERGED → true; CLOSED → false; OPEN → stays null (pending)
 *   merged_at       PR mergedAt (merged rows only)
 *   rework_cycles   max(0, commitCount − 1) — extra commits after the first
 *   ci_first_pass   merged && rework_cycles === 0. Heuristic: a squash-merged
 *                   single-commit PR never needed a fix-up push. Undercounts
 *                   CI reruns that passed without a new commit; good enough
 *                   for the queueEfficiency trend the sensor consumes.
 *
 * Rows with no PR (worker failed before opening one) older than 30 days are
 * marked merged=false so they stop counting as pending forever.
 *
 * Idempotent: already-reconciled rows are never re-fetched. GitHub lookups are
 * capped per run (default 50); remaining rows reconcile on the next run.
 *
 * Pure core with dependency injection, matching collect-queue-telemetry.mjs.
 */

import { createGhClient } from "@mbe/gh-client";
import { read, write, resolvePath } from "./metrics-store.mjs";

const DEFAULT_MAX_CALLS = 50;
const STALE_PRLESS_DAYS = 30;

/**
 * Default PR reader — one `gh pr view` per PR, normalised to the shape the
 * pure core consumes.
 *
 * @param {number} prNumber
 * @param {import("@mbe/gh-client").GhClient} [ghClient]
 * @returns {{ state: string, mergedAt: string|null, commitCount: number }}
 */
export function defaultFetchPr(prNumber, ghClient = createGhClient()) {
  const pr = ghClient.pr.view(prNumber, ["--json", "state,mergedAt,commits"]);
  return {
    state: pr.state,
    mergedAt: pr.mergedAt ?? null,
    commitCount: Array.isArray(pr.commits) ? pr.commits.length : 1,
  };
}

/**
 * Reconcile outcome fields on telemetry rows. Pure — returns new row objects,
 * never mutates the input.
 *
 * @param {Array<object>} inputRows - Parsed queue-telemetry rows.
 * @param {object} opts
 * @param {(prNumber: number) => { state: string, mergedAt: string|null, commitCount: number }} opts.fetchPr
 * @param {Date} [opts.now]
 * @param {number} [opts.maxCalls]
 * @returns {{ rows: Array<object>, reconciled: number, calls: number }}
 */
export function reconcileTelemetry(
  inputRows,
  { fetchPr, now = new Date(), maxCalls = DEFAULT_MAX_CALLS }
) {
  let reconciled = 0;
  let calls = 0;
  const staleCutoffMs = now.getTime() - STALE_PRLESS_DAYS * 24 * 60 * 60 * 1000;

  const rows = inputRows.map((row) => {
    if (row.merged != null) return { ...row };

    if (row.pr_number == null) {
      const claimedMs = Date.parse(row.claimed_at ?? "");
      if (Number.isFinite(claimedMs) && claimedMs < staleCutoffMs) {
        reconciled += 1;
        return { ...row, merged: false };
      }
      return { ...row };
    }

    if (calls >= maxCalls) return { ...row };
    calls += 1;

    let pr;
    try {
      pr = fetchPr(row.pr_number);
    } catch {
      // Transient gh failure — leave the row pending for the next run.
      return { ...row };
    }

    if (pr.state === "MERGED") {
      const reworkCycles = Math.max(0, (pr.commitCount ?? 1) - 1);
      reconciled += 1;
      return {
        ...row,
        merged: true,
        merged_at: pr.mergedAt,
        rework_cycles: reworkCycles,
        ci_first_pass: reworkCycles === 0,
      };
    }
    if (pr.state === "CLOSED") {
      reconciled += 1;
      return { ...row, merged: false };
    }
    // OPEN (or unknown state) — still pending.
    return { ...row };
  });

  return { rows, reconciled, calls };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = read("queue-telemetry");
  if (!rows || rows.length === 0) {
    process.stdout.write("[reconcile-queue-telemetry] no telemetry rows — nothing to do\n");
    process.exit(0);
  }

  const { rows: reconciledRows, reconciled, calls } = reconcileTelemetry(rows, {
    fetchPr: defaultFetchPr,
  });

  if (reconciled > 0) {
    write("queue-telemetry", reconciledRows);
  }
  const pending = reconciledRows.filter((r) => r.merged == null).length;
  process.stdout.write(
    `[reconcile-queue-telemetry] ${reconciled} row(s) reconciled (${calls} GitHub lookups, ` +
      `${pending} still pending) → ${resolvePath("queue-telemetry")}\n`
  );
}
