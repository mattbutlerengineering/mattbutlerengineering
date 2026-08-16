#!/usr/bin/env node

/**
 * Post-fix improvement verification for the learning loop.
 *
 * Finds recently-closed issues that had sensor-detected labels,
 * queries the originating sensor to verify the fix actually improved
 * the metric, and comments on the issue with evidence.
 *
 * Usage:
 *   node scripts/verify-fixes.mjs              # verify recent fixes
 *   node scripts/verify-fixes.mjs --dry-run    # show what would be verified
 *   node scripts/verify-fixes.mjs --hours 72   # custom lookback window
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient, markReady, describeGhError } from "@mbe/gh-client";
import { run as runThresholdTuner } from "./threshold-tuner.mjs";
import { getAllLabels } from "./sensors-registry.mjs";
import { append, resolvePath } from "./metrics-store.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LOG_PATH = resolvePath("verifications", { root: ROOT });

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const hoursIdx = args.indexOf("--hours");
const LOOKBACK_HOURS = hoursIdx >= 0 ? parseInt(args[hoursIdx + 1] ?? "48", 10) : 48;
const MAX_VERIFICATIONS = 5;

const SENSOR_LABELS = getAllLabels();

// Name of the workflow (`.github/workflows/ci.yml`'s `name:`) whose `CI
// Gate` job is the thing a `ci-fix` fix actually targets. Same constant
// value already used by `revert-watchdog.mjs`'s `getMainConclusion`.
const CI_WORKFLOW_NAME = "CI";

const ghClient = createGhClient();

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * Injected I/O for the verifiers below, so each one is a pure function of
 * its inputs plus this interface — testable with fakes, zero real `gh`
 * calls or filesystem reads in the test suite (#3674).
 *
 * @typedef {Object} VerifyDeps
 * @property {(args: string[]) => unknown[]} listWorkflowRuns  `gh run list` (ghClient.workflow.runs)
 * @property {(path: string) => unknown} readJson               parse a JSON file at `path`
 */

/* ── Find issues to verify ───────────────────────────── */

/**
 * Queries closed issues carrying a sensor label, closed within the lookback
 * window — returning a result that distinguishes "the query ran and
 * legitimately found nothing" from "the query itself failed" (e.g. an auth
 * failure in Claude Code Remote sessions — #3937). Callers must not collapse
 * both into the same "nothing to verify" shape.
 *
 * @param {(args: string[]) => unknown[]} listIssues  `gh issue list` (ghClient.issue.list)
 * @param {{ lookbackHours?: number, sensorLabels?: string[], now?: Date }} [opts]
 * @returns {{ ok: true, issues: object[] } | { ok: false, error: string }}
 */
export function queryClosedIssuesWithSensorLabels(listIssues, opts = {}) {
  const lookbackHours = opts.lookbackHours ?? LOOKBACK_HOURS;
  const sensorLabels = opts.sensorLabels ?? SENSOR_LABELS;
  const cutoff = new Date((opts.now ?? new Date()) - lookbackHours * 60 * 60 * 1000);

  let issues;
  try {
    issues = listIssues([
      "--state",
      "closed",
      "--limit",
      "30",
      "--json",
      "number,title,labels,closedAt,body",
    ]);
  } catch (err) {
    return { ok: false, error: describeGhError(err) };
  }

  const filtered = issues
    .filter((issue) => {
      if (!issue.closedAt) return false;
      if (new Date(issue.closedAt) < cutoff) return false;
      const labelNames = (issue.labels ?? []).map((l) => l.name);
      return labelNames.some((l) => sensorLabels.includes(l));
    })
    .slice(0, MAX_VERIFICATIONS);

  return { ok: true, issues: filtered };
}

/* ── Sensor-specific verifiers ───────────────────────── */

/**
 * Verifies a `ci-fix` issue against the `CI` workflow specifically — not an
 * unscoped "last N runs on main" aggregate. #4211/#4208: an unscoped query
 * counts unrelated automation workflows (`claude`, `Revert RCA Detection`,
 * `Auto-Merge Policy`, `Synthetic Monitoring`, …) toward "CI pass rate",
 * so a dip in one of THOSE reopened already-fixed, already-verified issues
 * with zero connection to what the fix actually touched.
 *
 * @param {VerifyDeps} deps
 */
export function verifyCiFix(deps) {
  const runs = safe(
    () =>
      deps.listWorkflowRuns([
        "--limit",
        "10",
        "--branch",
        "main",
        "--workflow",
        CI_WORKFLOW_NAME,
        "--json",
        "status,conclusion,createdAt",
      ]),
    null
  );
  if (!runs) {
    // A query failure is data being unavailable, not evidence the fix
    // regressed — must abstain, not read as a definite "not verified".
    return { verified: false, reason: "Could not query CI runs", confidence: "skip" };
  }
  const completed = runs.filter((r) => r.status === "completed");
  const passed = completed.filter((r) => r.conclusion === "success");
  const passRate = completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;

  if (passRate >= 90) {
    return {
      verified: true,
      reason: `CI pass rate on main: ${passRate}% (${passed.length}/${completed.length} recent runs passing)`,
    };
  }
  return {
    verified: false,
    reason: `CI pass rate still low: ${passRate}% (${passed.length}/${completed.length})`,
  };
}

/**
 * @param {string} issueTitle
 * @param {VerifyDeps} deps
 */
export function verifyAcmm(issueTitle, deps) {
  const statePath = resolve(ROOT, ".claude", "acmm", "state.json");
  const state = safe(() => deps.readJson(statePath));
  // A read failure is data being unavailable, not evidence the fix
  // regressed — must abstain, not read as a definite "not verified".
  if (!state) return { verified: false, reason: "ACMM state not available", confidence: "skip" };

  const checks = state.checks ?? {};
  const criterionMatch = issueTitle.match(/acmm:([a-z0-9-]+)/i);

  if (criterionMatch) {
    const criterionId = `acmm:${criterionMatch[1]}`;
    const check = checks[criterionId];
    if (check?.passed) {
      return {
        verified: true,
        reason: `ACMM criterion \`${criterionId}\` now passes: ${check.evidence}`,
      };
    }
    return {
      verified: false,
      reason: `ACMM criterion \`${criterionId}\` still failing`,
    };
  }

  const total = Object.keys(checks).length;
  const passed = Object.values(checks).filter((c) => c.passed).length;
  return {
    verified: true,
    reason: `ACMM at L${state.currentLevel}: ${passed}/${total} criteria passing`,
    confidence: "low",
  };
}

/**
 * @param {string} issueTitle
 * @param {string} issueBody
 * @param {VerifyDeps} deps
 */
export function verifyAudit(issueTitle, issueBody, deps) {
  const invPath = resolve(ROOT, ".audit-state", "inventory.json");
  const inv = safe(() => deps.readJson(invPath));

  if (!inv) {
    // #4207: a read failure is data being unavailable, not evidence the fix
    // regressed — must abstain, not read as a definite "not verified" that
    // reopens an already-fixed, already-verified issue.
    return {
      verified: false,
      reason: "Lighthouse inventory not available — run a site audit first",
      confidence: "skip",
    };
  }

  const urlMatch = (issueBody ?? "").match(/https?:\/\/[^\s)]+/);
  if (urlMatch) {
    const surfaces = Array.isArray(inv.surfaces ?? inv)
      ? (inv.surfaces ?? inv)
      : Object.values(inv.surfaces ?? inv);
    const surface = surfaces.find((s) => s.url === urlMatch[0]);
    if (surface?.scores) {
      const scores = surface.scores;
      const allAbove90 = Object.values(scores).every((s) => s >= 0.9);
      return {
        verified: allAbove90,
        reason: allAbove90
          ? `All Lighthouse scores ≥ 0.9 for ${urlMatch[0]}: ${JSON.stringify(scores)}`
          : `Some Lighthouse scores below 0.9: ${JSON.stringify(scores)}`,
      };
    }
  }

  return {
    verified: false,
    reason: "Could not match issue to a specific Lighthouse surface",
    confidence: "low",
  };
}

export function verifySentry() {
  return {
    verified: false,
    reason: "Sentry verification not yet available — requires MCP authentication (#983)",
    confidence: "skip",
  };
}

/**
 * Same unscoped-query class #4211/#4208 demonstrated for verifyCiFix: a dip
 * in an unrelated workflow (Synthetic Monitoring, Revert RCA Detection, …)
 * on `main` must not reopen a `bug`-labeled issue whose actual fix is fine.
 * Scoped to the `CI` workflow for the same reason verifyCiFix is.
 *
 * @param {VerifyDeps} deps
 */
export function verifyBug(deps) {
  const runs = safe(
    () =>
      deps.listWorkflowRuns([
        "--limit",
        "5",
        "--branch",
        "main",
        "--workflow",
        CI_WORKFLOW_NAME,
        "--json",
        "status,conclusion",
      ]),
    null
  );
  // A query failure is data being unavailable, not evidence the fix
  // regressed — must abstain, not read as a definite "not verified".
  if (!runs) {
    return { verified: false, reason: "Could not verify — CI unavailable", confidence: "skip" };
  }

  const latestCompleted = runs.find((r) => r.status === "completed");

  if (latestCompleted?.conclusion === "success") {
    return {
      verified: true,
      reason: "Latest CI run on main passed after fix merged",
      confidence: "medium",
    };
  }
  return {
    verified: false,
    reason: `Latest CI run: ${latestCompleted?.conclusion ?? "unknown"}`,
    confidence: "medium",
  };
}

/* ── Route to correct verifier ───────────────────────── */

export function verifySecurity() {
  return {
    verified: false,
    reason: "CORS/security verification: re-run cors-audit.mjs to confirm no new findings",
    confidence: "low",
  };
}

/**
 * @param {{ labels?: Array<{ name: string }>, title: string, body?: string }} issue
 * @param {VerifyDeps} [deps]
 */
export function verifyIssue(issue, deps) {
  const labelNames = (issue.labels ?? []).map((l) => l.name);

  if (labelNames.includes("ci-fix")) return verifyCiFix(deps);
  if (labelNames.includes("acmm")) return verifyAcmm(issue.title, deps);
  if (labelNames.includes("audit")) return verifyAudit(issue.title, issue.body, deps);
  if (labelNames.includes("sentry")) return verifySentry();
  if (labelNames.includes("security")) return verifySecurity();
  if (labelNames.includes("bug")) return verifyBug(deps);

  // Abstain, don't act. `confidence: "skip"` is load-bearing: without it the
  // caller below read `undefined !== "skip"` as "act", so an issue carrying a
  // label no verifier handles (today: `meta-improvement`) was commented on and
  // reopened purely because nothing could check it (#3645).
  return { verified: false, reason: "No matching verifier for labels", confidence: "skip" };
}

/**
 * Pure: whether a verification result warrants issue side effects (comment,
 * re-label, reopen). An abstention must never move the issue.
 *
 * @param {{ confidence?: string }} result
 * @returns {boolean}
 */
export function shouldActOnResult(result) {
  return result.confidence !== "skip";
}

/* ── Main ────────────────────────────────────────────── */

async function main() {
  const result = queryClosedIssuesWithSensorLabels((args) => ghClient.issue.list(args), {
    lookbackHours: LOOKBACK_HOURS,
  });

  if (!result.ok) {
    // Must never look like "nothing to verify" (#3937) — an empty result and
    // a failed query are different facts and need different operator action.
    console.log(`\n❌ Could not verify fixes — query failed: ${result.error}\n`);
    process.exit(1);
  }

  const issues = result.issues;

  if (issues.length === 0) {
    console.log(`\n✅ No sensor-labeled issues closed in the last ${LOOKBACK_HOURS}h to verify.\n`);
    process.exit(0);
  }

  console.log(
    `\n🔍 Verifying ${issues.length} recently-closed issues (${LOOKBACK_HOURS}h window):\n`
  );

  /** @type {VerifyDeps} */
  const deps = {
    listWorkflowRuns: (args) => ghClient.workflow.runs(args),
    readJson,
  };

  const results = [];

  for (const issue of issues) {
    const labelNames = (issue.labels ?? []).map((l) => l.name);
    const sensorLabel = labelNames.find((l) => SENSOR_LABELS.includes(l));
    const result = verifyIssue(issue, deps);

    const entry = {
      timestamp: new Date().toISOString(),
      issue_number: issue.number,
      issue_title: issue.title,
      sensor_label: sensorLabel,
      ...result,
    };

    results.push(entry);

    const icon = result.verified ? "✅" : result.confidence === "skip" ? "⏭ " : "❌";
    console.log(`  ${icon} #${issue.number}: ${issue.title}`);
    console.log(`     ${result.reason}`);
    console.log();

    if (!DRY_RUN && shouldActOnResult(result)) {
      const emoji = result.verified ? "✅" : "❌";
      const verb = result.verified ? "Verified" : "Not verified";
      const comment = `## ${emoji} Fix Verification (automated)\n\n**${verb}** — ${result.reason}\n\n_Checked ${LOOKBACK_HOURS}h after close by [\`scripts/verify-fixes.mjs\`](../blob/main/scripts/verify-fixes.mjs)_`;

      safe(() => ghClient.issue.comment(issue.number, comment));

      if (!result.verified) {
        // Single source of truth for the re-queue edge (#2933): @mbe/gh-client's
        // markReady owns which labels come off, not this call site.
        safe(() => ghClient.label.apply(markReady(issue.number)));
        safe(() => ghClient.issue.reopen(issue.number));
        console.log(`     ↻ Reopened #${issue.number} for re-triage\n`);
      }
    }
  }

  if (!DRY_RUN) {
    for (const entry of results) {
      append("verifications", entry, { root: ROOT });
    }
    console.log(`Logged ${results.length} verification(s) to ${LOG_PATH}\n`);
  }

  const verified = results.filter((r) => r.verified).length;
  const failed = results.filter((r) => !r.verified && shouldActOnResult(r)).length;
  const skipped = results.filter((r) => !shouldActOnResult(r)).length;

  console.log(`Summary: ${verified} verified, ${failed} failed, ${skipped} skipped\n`);

  /* ── Threshold auto-tuning (feedback loop) ───────────── */

  console.log("🔧 Running threshold auto-tuner…\n");
  await runThresholdTuner({ dryRun: DRY_RUN }).catch((err) => {
    // Non-fatal — tuning failure never blocks the verification report
    console.error(`[threshold-tuner] Warning: ${err.message}`);
  });

  process.exit(failed > 0 ? 1 : 0);
}

// Run when invoked directly (not imported by tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
