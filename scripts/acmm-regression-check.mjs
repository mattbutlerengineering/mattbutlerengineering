#!/usr/bin/env node

/**
 * Continuous ACMM regression detection.
 *
 * Reads the repo-level ACMM state (`.claude/acmm/state.json`, refreshed by
 * `generate-acmm-report.mjs` / the audit) and compares the current maturity
 * level against the last recorded level. If the level dropped, it emits an
 * issue payload (labels `acmm` + `ready`) naming the regressed criteria;
 * otherwise it bumps the state timestamp.
 *
 * The pure decision functions are exported and unit-tested. The CLI section at
 * the bottom wires them to the filesystem + GitHub. The workflow at
 * `.github/workflows/acmm-regression.yml` invokes the CLI.
 *
 * Usage: node scripts/acmm-regression-check.mjs
 *   Env: GH_TOKEN (for `gh`), GITHUB_REPOSITORY (owner/repo).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STATE_PATH = resolve(ROOT, ".claude", "acmm", "state.json");

/**
 * Marker embedded in regression issue bodies so we can deduplicate against
 * already-open regression issues without relying on title text.
 */
export const REGRESSION_MARKER = "<!-- acmm-regression -->";

/**
 * Decide whether the level regressed. A missing previous level (first run)
 * is never a regression.
 * @returns {{ regressed: boolean, previousLevel: number|null, currentLevel: number }}
 */
export function detectRegression(previousLevel, currentLevel) {
  const hasPrevious = typeof previousLevel === "number";
  return {
    regressed: hasPrevious && currentLevel < previousLevel,
    previousLevel: hasPrevious ? previousLevel : null,
    currentLevel,
  };
}

/** Ids of checks that are currently failing — the regressed criteria. */
export function regressedCriteria(checks) {
  if (!checks) return [];
  return Object.entries(checks)
    .filter(([, check]) => check?.passed === false)
    .map(([id]) => id);
}

/** Build the GitHub issue payload for a detected regression. Pure. */
export function buildIssuePayload({ previousLevel, currentLevel, levelName, failingIds }) {
  const title = `ACMM regression: maturity level dropped from ${previousLevel} to ${currentLevel}`;
  const criteriaList =
    failingIds.length > 0
      ? failingIds.map((id) => `- \`${id}\``).join("\n")
      : "_No specific failing criteria were recorded in state.json._";
  const body = `${REGRESSION_MARKER}
## ACMM maturity regression detected

The scheduled ACMM audit found that the repository's maturity level dropped.

| | Level |
| --- | --- |
| Previous | ${previousLevel} |
| Current | ${currentLevel}${levelName ? ` (${levelName})` : ""} |

### Criteria that regressed (currently failing)

${criteriaList}

### Next steps

Restore the failing criteria above to recover the previous maturity level, or
update \`.claude/acmm/state.json\` if the drop is intentional. This issue was
opened automatically by \`.github/workflows/acmm-regression.yml\`.`;

  return { title, body, labels: ["acmm", "ready"] };
}

/**
 * True when any OPEN issue body carries the regression marker — used to avoid
 * opening duplicate regression issues.
 */
export function hasOpenRegressionIssue(issues) {
  return issues.some(
    (issue) =>
      issue.state === "open" &&
      typeof issue.body === "string" &&
      issue.body.includes(REGRESSION_MARKER)
  );
}

/** Return a new state object with an updated lastRun timestamp. Immutable. */
export function withUpdatedTimestamp(state, timestamp) {
  return { ...state, lastRun: timestamp };
}

// ---------------------------------------------------------------------------
// CLI: filesystem + GitHub wiring (not unit-tested; the logic above is).
// ---------------------------------------------------------------------------

function readState() {
  if (!existsSync(STATE_PATH)) {
    throw new Error(`ACMM state not found at ${STATE_PATH}`);
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

/** Last recorded level from the history array (the level before this run). */
function previousLevelFromHistory(state) {
  const history = Array.isArray(state.history) ? state.history : [];
  const last = history[history.length - 1];
  return typeof last?.level === "number" ? last.level : null;
}

async function fetchOpenRegressionIssues() {
  const { execFileSync } = await import("node:child_process");
  const raw = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--label",
      "acmm",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,body,state",
    ],
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function createIssue(payload) {
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "gh",
    [
      "issue",
      "create",
      "--title",
      payload.title,
      "--body",
      payload.body,
      "--label",
      payload.labels.join(","),
    ],
    { stdio: "inherit" }
  );
}

async function main() {
  const state = readState();
  const currentLevel = typeof state.currentLevel === "number" ? state.currentLevel : 1;
  const previousLevel = previousLevelFromHistory(state);
  const { regressed } = detectRegression(previousLevel, currentLevel);

  if (!regressed) {
    const next = withUpdatedTimestamp(state, new Date().toISOString());
    writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
    console.log(`No ACMM regression (level ${currentLevel}). Updated lastRun timestamp.`);
    return;
  }

  const failingIds = regressedCriteria(state.checks);
  const payload = buildIssuePayload({
    previousLevel,
    currentLevel,
    levelName: state.levelName,
    failingIds,
  });

  const openIssues = await fetchOpenRegressionIssues();
  if (hasOpenRegressionIssue(openIssues)) {
    console.log("ACMM regression detected, but an open regression issue already exists. Skipping.");
    return;
  }

  await createIssue(payload);
  console.log(`Opened ACMM regression issue (level ${previousLevel} -> ${currentLevel}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
