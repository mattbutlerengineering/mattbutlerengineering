/**
 * Audit-freshness criterion: checks that the ACMM state file is no older than 7 days.
 *
 * Uses an injectable `now` clock seam for deterministic testing.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STATE_PATH } from "./state.js";

const FRESHNESS_WINDOW_DAYS = 7;
const FRESHNESS_WINDOW_MS = FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Check whether the ACMM state file was last updated within the freshness window.
 *
 * @param {string} cwd - repo root
 * @param {{ now?: Date }} [opts] - injectable clock seam for testing
 * @returns {{ passed: boolean, evidence: string }}
 */
export function checkAuditFreshness(cwd, opts = {}) {
  const now = opts.now ?? new Date();
  const statePath = join(cwd, STATE_PATH);

  if (!existsSync(statePath)) {
    return { passed: false, evidence: "state file not found — run `acmm-audit` to create it" };
  }

  let lastRun;
  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf-8"));
    lastRun = parsed.lastRun;
  } catch {
    return { passed: false, evidence: "state file is unreadable or invalid JSON" };
  }

  if (!lastRun) {
    return { passed: false, evidence: "state.lastRun is empty — audit has never completed" };
  }

  const lastRunDate = new Date(lastRun);
  if (isNaN(lastRunDate.getTime())) {
    return { passed: false, evidence: `state.lastRun is not a valid date: ${lastRun}` };
  }

  const ageMs = now.getTime() - lastRunDate.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageMs > FRESHNESS_WINDOW_MS) {
    return {
      passed: false,
      evidence: `last audit was ${ageDays} day(s) ago (limit: ${FRESHNESS_WINDOW_DAYS} days) — re-run \`acmm-audit\``,
    };
  }

  return {
    passed: true,
    evidence: `last audit was ${ageDays} day(s) ago (within ${FRESHNESS_WINDOW_DAYS}-day window)`,
  };
}

/** @type {import('./sources/types.js').Criterion} */
export const AUDIT_FRESHNESS_CRITERION = {
  id: "meta:audit-freshness",
  source: "meta",
  level: 6,
  category: "self-improvement",
  name: "Audit freshness",
  description: `ACMM state file is no older than ${FRESHNESS_WINDOW_DAYS} days`,
  rationale:
    "A stale audit gives a false sense of maturity. Freshness gates ensure the score reflects the current state of the repo.",
  scannable: false,
  detection: { type: "active", pattern: STATE_PATH },
  check: checkAuditFreshness,
};
