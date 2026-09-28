#!/usr/bin/env node

/**
 * ACMM regression detection.
 *
 * Compares the ACMM level committed at `HEAD` **before** the audit ran
 * (read by the caller — `.github/workflows/acmm-regression.yml` — via
 * `git show HEAD:.claude/acmm/state.json` and passed in as `--previous-level`)
 * against the freshly computed level in `.claude/acmm/state.json` after
 * `plugins/acmm/scripts/audit.js` has just overwritten it. A drop opens one
 * deduped regression issue (reuse `buildIssuePayload`).
 *
 * Before #5854 this compared `state.currentLevel` against
 * `state.history[history.length - 1].level` — both produced by the *same*
 * computation, since history is appended in the same run that sets
 * `currentLevel`. That comparison could never observe a real regression; it
 * only ever measured `currentLevel === currentLevel`. This script also used
 * to rewrite `state.json`'s `lastRun` on every non-regression run — a
 * regression *check* should not itself be a write path, so it no longer
 * touches the file at all.
 *
 * `isUnmeasurable()` reports the run as unmeasurable — never a regression —
 * when the fresh audit's own checks/gates could not be verified (gh
 * unavailable, a read-only environment, or an unverifiable behavioral gate).
 * This keeps "the audit could not tell" distinct from "the level actually
 * dropped" (upstream kubestellar/console #23233's "unreachable != regression"
 * fix, applied here to our own regression check).
 *
 * The pure decision functions below are exported and unit-tested. The CLI
 * section at the bottom wires them to the filesystem + GitHub. The workflow
 * at `.github/workflows/acmm-regression.yml` invokes the CLI.
 *
 * Usage: node scripts/acmm-regression-check.mjs --previous-level <n>
 *   Env: GH_TOKEN (for `gh`), GITHUB_REPOSITORY (owner/repo).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fileRegressionIssueIfNew } from "./lib/ratchet.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STATE_PATH = resolve(ROOT, ".claude", "acmm", "state.json");

/**
 * Marker embedded in regression issue bodies so we can deduplicate against
 * already-open regression issues without relying on title text.
 */
export const REGRESSION_MARKER = "<!-- acmm-regression -->";

/**
 * Whether the freshly computed audit state should be trusted enough to
 * compare against a previous level at all.
 *
 * Two independent signals, either of which means "the audit could not
 * measure this run" rather than "the level changed":
 *   - any criterion's verdict is `"unverifiable"` (evaluate.js's verdict seam
 *     returns this when, e.g., `gh` is unavailable — see detection.js/
 *     evaluate.js's "gh CLI unavailable or error").
 *   - any behavioral gate carries `unverifiable: true` (computeLevel.js
 *     marks a gate this way when it has no data to evaluate the threshold).
 *
 * A read-only run (no `gh`) always produces at least one unverifiable
 * `active`-type criterion today, so it is covered without needing a separate
 * explicit "read-only" flag on state — if the audit ever grows one, add it
 * here too.
 *
 * @param {{ checks?: Record<string, { verdict?: string }>, computation?: { behavioralGates?: Array<{ unverifiable?: boolean }> } }} state
 * @returns {boolean}
 */
export function isUnmeasurable(state) {
  const checks = state?.checks ?? {};
  const anyUnverifiableCheck = Object.values(checks).some((c) => c?.verdict === "unverifiable");
  const gates = state?.computation?.behavioralGates ?? [];
  const anyUnverifiableGate = gates.some((g) => g?.unverifiable === true);
  return anyUnverifiableCheck || anyUnverifiableGate;
}

/**
 * Classify how the level changed between two independently-sourced readings.
 * Pure — no history, no file I/O.
 *
 * `unmeasurable` always wins: an audit that could not measure this run
 * never reports a regression, no matter what the raw numbers say. A missing
 * previous or current level (no baseline yet, or the audit failed to
 * compute one) is also `unmeasurable` — there is nothing to compare.
 *
 * @param {{ previousLevel: number|null, currentLevel: number|null, unmeasurable: boolean }} input
 * @returns {{ status: "dropped"|"same"|"improved"|"unmeasurable", previousLevel: number|null, currentLevel: number|null }}
 */
export function classifyLevelChange({ previousLevel, currentLevel, unmeasurable }) {
  if (unmeasurable || typeof previousLevel !== "number" || typeof currentLevel !== "number") {
    return {
      status: "unmeasurable",
      previousLevel: previousLevel ?? null,
      currentLevel: currentLevel ?? null,
    };
  }
  if (currentLevel < previousLevel) return { status: "dropped", previousLevel, currentLevel };
  if (currentLevel > previousLevel) return { status: "improved", previousLevel, currentLevel };
  return { status: "same", previousLevel, currentLevel };
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

// ---------------------------------------------------------------------------
// CLI: filesystem + GitHub wiring (not unit-tested; the logic above is).
// ---------------------------------------------------------------------------

function readState() {
  if (!existsSync(STATE_PATH)) {
    throw new Error(`ACMM state not found at ${STATE_PATH}`);
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function readFlag(args, name, fallback) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : fallback;
}

/** Parses `--previous-level`, tolerating absent/blank/non-numeric input as "no baseline". */
function parsePreviousLevel(args) {
  const raw = readFlag(args, "--previous-level");
  if (raw === undefined || raw === "" || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

async function main() {
  const previousLevel = parsePreviousLevel(process.argv.slice(2));
  const state = readState();
  const currentLevel = typeof state.currentLevel === "number" ? state.currentLevel : null;
  const unmeasurable = isUnmeasurable(state);
  const { status } = classifyLevelChange({ previousLevel, currentLevel, unmeasurable });

  if (status !== "dropped") {
    const detail =
      status === "unmeasurable"
        ? "gh unavailable, an unverifiable gate, or no previous level to compare"
        : `level ${previousLevel} -> ${currentLevel}`;
    console.log(`ACMM regression check: ${status} (${detail}). Skipping.`);
    return;
  }

  const failingIds = regressedCriteria(state.checks);
  const payload = buildIssuePayload({
    previousLevel,
    currentLevel,
    levelName: state.levelName,
    failingIds,
  });

  const { filed } = await fileRegressionIssueIfNew({
    label: "acmm",
    marker: REGRESSION_MARKER,
    payload,
  });
  if (!filed) {
    console.log("ACMM regression detected, but an open regression issue already exists. Skipping.");
    return;
  }

  console.log(`Opened ACMM regression issue (level ${previousLevel} -> ${currentLevel}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
