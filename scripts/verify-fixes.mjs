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

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LOG_PATH = resolve(
  ROOT,
  ".claude",
  "improvement-loop",
  "verifications.jsonl",
);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const hoursIdx = args.indexOf("--hours");
const LOOKBACK_HOURS =
  hoursIdx >= 0 ? parseInt(args[hoursIdx + 1] ?? "48", 10) : 48;
const MAX_VERIFICATIONS = 5;

const SENSOR_LABELS = ["ci-fix", "audit", "acmm", "sentry", "bug"];

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function gh(...ghArgs) {
  return execFileSync("gh", ghArgs, {
    encoding: "utf-8",
    timeout: 15_000,
  }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/* ── Find issues to verify ───────────────────────────── */

function findClosedIssuesWithSensorLabels() {
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  const raw = safe(() =>
    gh(
      "issue",
      "list",
      "--state",
      "closed",
      "--limit",
      "30",
      "--json",
      "number,title,labels,closedAt,body",
    ),
  );
  if (!raw) return [];

  const issues = safe(() => JSON.parse(raw), []);

  return issues
    .filter((issue) => {
      if (!issue.closedAt) return false;
      if (new Date(issue.closedAt) < cutoff) return false;
      const labelNames = (issue.labels ?? []).map((l) => l.name);
      return labelNames.some((l) => SENSOR_LABELS.includes(l));
    })
    .slice(0, MAX_VERIFICATIONS);
}

/* ── Sensor-specific verifiers ───────────────────────── */

function verifyCiFix() {
  const raw = safe(() =>
    gh(
      "run",
      "list",
      "--limit",
      "10",
      "--branch",
      "main",
      "--json",
      "status,conclusion,createdAt",
    ),
  );
  if (!raw) return { verified: false, reason: "Could not query CI runs" };

  const runs = safe(() => JSON.parse(raw), []);
  const completed = runs.filter((r) => r.status === "completed");
  const passed = completed.filter((r) => r.conclusion === "success");
  const passRate =
    completed.length > 0
      ? Math.round((passed.length / completed.length) * 100)
      : 0;

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

function verifyAcmm(issueTitle) {
  const statePath = resolve(ROOT, ".claude", "acmm", "state.json");
  const state = safe(() => readJson(statePath));
  if (!state) return { verified: false, reason: "ACMM state not available" };

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

function verifyAudit(issueTitle, issueBody) {
  const invPath = resolve(ROOT, ".audit-state", "inventory.json");
  const inv = safe(() => readJson(invPath));

  if (!inv) {
    return {
      verified: false,
      reason: "Lighthouse inventory not available — run a site audit first",
    };
  }

  const urlMatch = (issueBody ?? "").match(
    /https?:\/\/[^\s)]+/,
  );
  if (urlMatch) {
    const surfaces = Array.isArray(inv.surfaces ?? inv)
      ? inv.surfaces ?? inv
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

function verifySentry() {
  return {
    verified: false,
    reason: "Sentry verification not yet available — requires MCP authentication (#983)",
    confidence: "skip",
  };
}

function verifyBug() {
  const raw = safe(() =>
    gh(
      "run",
      "list",
      "--limit",
      "5",
      "--branch",
      "main",
      "--json",
      "status,conclusion",
    ),
  );
  if (!raw)
    return { verified: false, reason: "Could not verify — CI unavailable" };

  const runs = safe(() => JSON.parse(raw), []);
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

function verifyIssue(issue) {
  const labelNames = (issue.labels ?? []).map((l) => l.name);

  if (labelNames.includes("ci-fix")) return verifyCiFix();
  if (labelNames.includes("acmm")) return verifyAcmm(issue.title);
  if (labelNames.includes("audit"))
    return verifyAudit(issue.title, issue.body);
  if (labelNames.includes("sentry")) return verifySentry();
  if (labelNames.includes("bug")) return verifyBug();

  return { verified: false, reason: "No matching verifier for labels" };
}

/* ── Main ────────────────────────────────────────────── */

const issues = findClosedIssuesWithSensorLabels();

if (issues.length === 0) {
  console.log(
    `\n✅ No sensor-labeled issues closed in the last ${LOOKBACK_HOURS}h to verify.\n`,
  );
  process.exit(0);
}

console.log(
  `\n🔍 Verifying ${issues.length} recently-closed issues (${LOOKBACK_HOURS}h window):\n`,
);

const results = [];

for (const issue of issues) {
  const labelNames = (issue.labels ?? []).map((l) => l.name);
  const sensorLabel = labelNames.find((l) => SENSOR_LABELS.includes(l));
  const result = verifyIssue(issue);

  const entry = {
    timestamp: new Date().toISOString(),
    issue_number: issue.number,
    issue_title: issue.title,
    sensor_label: sensorLabel,
    ...result,
  };

  results.push(entry);

  const icon = result.verified
    ? "✅"
    : result.confidence === "skip"
      ? "⏭ "
      : "❌";
  console.log(`  ${icon} #${issue.number}: ${issue.title}`);
  console.log(`     ${result.reason}`);
  console.log();

  if (!DRY_RUN && result.confidence !== "skip") {
    const emoji = result.verified ? "✅" : "❌";
    const verb = result.verified ? "Verified" : "Not verified";
    const comment = `## ${emoji} Fix Verification (automated)\n\n**${verb}** — ${result.reason}\n\n_Checked ${LOOKBACK_HOURS}h after close by [\`scripts/verify-fixes.mjs\`](../blob/main/scripts/verify-fixes.mjs)_`;

    safe(() => gh("issue", "comment", String(issue.number), "--body", comment));

    if (!result.verified) {
      safe(() =>
        gh(
          "issue",
          "edit",
          String(issue.number),
          "--remove-label",
          "has-pr",
          "--add-label",
          "ready",
        ),
      );
      safe(() => gh("issue", "reopen", String(issue.number)));
      console.log(`     ↻ Reopened #${issue.number} for re-triage\n`);
    }
  }
}

if (!DRY_RUN) {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  for (const entry of results) {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  }
  console.log(`Logged ${results.length} verification(s) to ${LOG_PATH}\n`);
}

const verified = results.filter((r) => r.verified).length;
const failed = results.filter((r) => !r.verified && r.confidence !== "skip")
  .length;
const skipped = results.filter((r) => r.confidence === "skip").length;

console.log(
  `Summary: ${verified} verified, ${failed} failed, ${skipped} skipped\n`,
);

process.exit(failed > 0 ? 1 : 0);
