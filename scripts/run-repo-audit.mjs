#!/usr/bin/env node
/**
 * `pnpm repo-audit` — runs every repository fitness check, always all of them.
 *
 * Before #5465 this was a 24-deep `&&` chain in package.json. `&&`
 * short-circuits, so the first failing check ended the run and the other 23
 * never executed: N independent findings cost N ~5-minute CI cycles, and a
 * skipped check reads exactly like a passing one in the log (the same hazard
 * `check-rialto-changeset.mjs` fails closed on, and that
 * `.claude/rules/gotchas.md` records for `infrastructure/worker`'s tests and
 * `rialto-web`'s Playwright specs). The checks are independent — none consumes
 * another's output — so there was never an ordering reason for the chain.
 *
 * `REPO_AUDIT_CHECKS` below is the source of truth for "is this check wired
 * into the audit?", the role package.json's script string used to play;
 * `scripts/__tests__/check-fitness-check-wiring.test.mjs` and the per-check
 * wiring tests read it.
 *
 * `pnpm audit --audit-level=high` deliberately stays OUT of this runner: it
 * lives in the standalone `audit:security` script so ci.yml's retry loop wraps
 * only the network-dependent registry call (#4993).
 *
 * Exit code is 0 iff every check passed, non-zero otherwise.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every check `pnpm repo-audit` runs, in order.
 *
 * @type {ReadonlyArray<{ name: string, command: string, args: string[] }>}
 */
export const REPO_AUDIT_CHECKS = [
  { name: "prettier", command: "pnpm", args: ["check:prettier"] },
  { name: "check-circular-deps", command: "node", args: ["scripts/check-circular-deps.js"] },
  { name: "check-dep-versions", command: "node", args: ["scripts/check-dep-versions.js"] },
  { name: "check-env-sync", command: "node", args: ["scripts/check-env-sync.js"] },
  { name: "check-service-bindings", command: "node", args: ["scripts/check-service-bindings.js"] },
  {
    name: "check-analytics-bindings",
    command: "node",
    args: ["scripts/check-analytics-bindings.mjs"],
  },
  {
    name: "check-destructive-migrations",
    command: "node",
    args: ["scripts/check-destructive-migrations.js"],
  },
  { name: "check-dockerfile-deps", command: "node", args: ["scripts/check-dockerfile-deps.js"] },
  { name: "check-schema-compat", command: "node", args: ["scripts/check-schema-compat.js"] },
  { name: "check-ci-dispatch", command: "node", args: ["scripts/check-ci-dispatch.mjs"] },
  {
    name: "check-issue-filing-seam",
    command: "node",
    args: ["scripts/check-issue-filing-seam.mjs"],
  },
  { name: "check-workflow-deps", command: "node", args: ["scripts/check-workflow-deps.mjs"] },
  {
    name: "check-workflow-paths-coverage",
    command: "node",
    args: ["scripts/check-workflow-paths-coverage.mjs"],
  },
  { name: "check-hook-wiring", command: "node", args: ["scripts/check-hook-wiring.mjs"] },
  {
    name: "check-deploy-secret-provisioning",
    command: "node",
    args: ["scripts/check-deploy-secret-provisioning.mjs"],
  },
  { name: "check-orphaned-tests", command: "node", args: ["scripts/check-orphaned-tests.mjs"] },
  {
    name: "check-orphaned-collectors",
    command: "node",
    args: ["scripts/check-orphaned-collectors.mjs"],
  },
  {
    name: "check-audit-persistence-caller",
    command: "node",
    args: ["scripts/check-audit-persistence-caller.mjs"],
  },
  { name: "check-story-coverage", command: "node", args: ["scripts/check-story-coverage.mjs"] },
  { name: "check-rialto-changeset", command: "node", args: ["scripts/check-rialto-changeset.mjs"] },
  {
    name: "check-claude-md-table-drift",
    command: "node",
    args: ["scripts/check-claude-md-table-drift.mjs"],
  },
  { name: "check-ci-gate-coverage", command: "node", args: ["scripts/check-ci-gate-coverage.mjs"] },
  { name: "check-memory-refs", command: "node", args: ["scripts/check-memory-refs.mjs"] },
  {
    name: "check-skill-references",
    command: "node",
    args: ["scripts/check-skill-references.mjs"],
  },
  { name: "boundaries", command: "pnpm", args: ["check:boundaries"] },
];

/**
 * Run every check, never short-circuiting. A check that throws is recorded as
 * a failure and the remaining checks still run.
 *
 * @param {ReadonlyArray<{ name: string, command: string, args: string[] }>} checks
 * @param {(check: { name: string, command: string, args: string[] }) => { ok: boolean, detail?: string }} runCheck
 * @returns {{ name: string, ok: boolean, detail: string }[]}
 */
export function runAllChecks(checks, runCheck) {
  return checks.map((check) => {
    try {
      const { ok, detail = "" } = runCheck(check);
      return { name: check.name, ok, detail };
    } catch (error) {
      return { name: check.name, ok: false, detail: error instanceof Error ? error.message : "" };
    }
  });
}

/**
 * @param {ReadonlyArray<{ ok: boolean }>} results
 * @returns {0 | 1}
 */
export function exitCodeFor(results) {
  return results.every((result) => result.ok) ? 0 : 1;
}

/**
 * PASS/FAIL line per check, then a count naming every failure.
 *
 * @param {ReadonlyArray<{ name: string, ok: boolean, detail: string }>} results
 * @returns {string}
 */
export function formatSummary(results) {
  const failed = results.filter((result) => !result.ok);
  const lines = results.map(
    (result) =>
      `  ${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? ` (${result.detail})` : ""}`
  );
  const tally =
    failed.length === 0
      ? `${results.length} of ${results.length} checks passed`
      : `${failed.length} of ${results.length} checks failed: ${failed.map((r) => r.name).join(", ")}`;

  return ["repo-audit summary:", ...lines, tally].join("\n");
}

/* c8 ignore start -- CLI entrypoint, exercised by running repo-audit itself */
/**
 * @param {{ name: string, command: string, args: string[] }} check
 * @returns {{ ok: boolean, detail?: string }}
 */
function spawnCheck(check) {
  process.stdout.write(`\n── repo-audit: ${check.name} ──\n`);
  const result = spawnSync(check.command, check.args, { cwd: root, stdio: "inherit" });

  if (result.error) return { ok: false, detail: result.error.message };
  if (result.signal) return { ok: false, detail: `killed by ${result.signal}` };
  return result.status === 0 ? { ok: true } : { ok: false, detail: `exit ${result.status}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = runAllChecks(REPO_AUDIT_CHECKS, spawnCheck);
  process.stdout.write(`\n${formatSummary(results)}\n`);
  process.exit(exitCodeFor(results));
}
/* c8 ignore stop */
