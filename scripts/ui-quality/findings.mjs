#!/usr/bin/env node
/**
 * findings.mjs — identity, dedupe and carrier for ui-quality findings
 * (docs/features/ui-quality-loop/architecture.md § Components "Findings",
 * § Interfaces `findings.mjs plan | record | migrate | seeds`).
 *
 * Key = `<app>|<route>|r<rubric_version>|<tell-id>`. The findings ledger
 * (`metrics/ui-quality-findings.json`) maps each key to the issue that
 * carries it. Every finding goes through the shared `fileIssue()` — this
 * module never restates the skip/create/reopen rule; it backs
 * `getIssueState` with the state map the routine fetched over MCP and
 * records `createIssue`/`reopenIssue` as pending actions. Nothing here calls
 * GitHub.
 *
 * Subcommands:
 *   plan  --findings <json> [--findings <json>…] --issue-states <json>
 *         [--calibration-status pass|failed|stale]
 *         → .ui-quality/findings.plan.json; exit 2 (nothing written) on an
 *         unknown tell or while an open key predates the rubric's version.
 *         No --calibration-status is `stale`: agent-built findings drop.
 *
 * Usage: node scripts/ui-quality/findings.mjs <plan> [flags] [--root <dir>]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { read as readMetric } from "../metrics-store.mjs";
import { CALIBRATION_STATUSES, planFindings, unmigratedKeys } from "./findings-plan.mjs";
import { WORK_DIR } from "./ledger.mjs";
import { loadRubric } from "./rubric.mjs";

export { findingKey, parseKey } from "./findings-plan.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FINDINGS_METRIC = "ui-quality-findings";
export const PLAN_FILE = "findings.plan.json";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Every value of a repeatable flag. */
function flagValues(argv, flag) {
  return argv.flatMap((a, i) => (a === flag && i + 1 < argv.length ? [argv[i + 1]] : []));
}

function flagValue(argv, flag) {
  return flagValues(argv, flag)[0];
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function readLedger(root) {
  return readMetric(FINDINGS_METRIC, { root }) ?? {};
}

const BACKLOG_FILE = "docs/backlog.md";

function readBacklogLines(root) {
  const path = join(root, BACKLOG_FILE);
  return existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
}

function writeWork(root, file, value) {
  const path = join(root, WORK_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function plan(ctx, argv) {
  const files = flagValues(argv, "--findings");
  const statesFile = flagValue(argv, "--issue-states");
  if (files.length === 0 || !statesFile) {
    throw new Error("needs --findings <json> (repeatable) and --issue-states <json>");
  }
  const rubric = loadRubric(ctx.root);
  const ledger = readLedger(ctx.root);
  const blocked = unmigratedKeys(ledger, rubric);
  if (blocked.length > 0) {
    ctx.stderr(
      `findings.mjs plan: ${blocked.length} open key(s) predate rubric v${rubric.rubric_version} — run \`findings.mjs migrate --from <old> --to ${rubric.rubric_version}\` first:\n  ${blocked.join("\n  ")}\n`
    );
    return 2;
  }
  const sources = files.map((f) => {
    const value = readJson(f);
    if (!Array.isArray(value)) throw new Error(`${f} is not a Finding[] array`);
    return value;
  });
  const calibrationStatus = flagValue(argv, "--calibration-status") ?? "stale";
  if (!CALIBRATION_STATUSES.includes(calibrationStatus)) {
    throw new Error(`--calibration-status must be one of ${CALIBRATION_STATUSES.join("|")}`);
  }
  if (flagValue(argv, "--calibration-status") === undefined) {
    ctx.stderr("findings.mjs plan: no --calibration-status — treated as stale\n");
  }
  const result = planFindings({
    sources,
    ledger,
    states: readJson(statesFile),
    rubric,
    calibrationStatus,
    backlogLines: readBacklogLines(ctx.root),
  });
  if (result.dropped.length > 0) {
    ctx.stderr(
      `findings.mjs plan: calibration ${calibrationStatus} — ${result.dropped.length} agent-built finding(s) dropped\n`
    );
  }
  for (const line of result.reports) ctx.stderr(`findings.mjs plan: ${line}\n`);
  writeWork(ctx.root, PLAN_FILE, result);
  const counts = Object.entries(
    result.actions.reduce((acc, a) => ({ ...acc, [a.action]: (acc[a.action] ?? 0) + 1 }), {})
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  ctx.stderr(
    `findings.mjs plan: ${counts || "no actions"}, ${result.seeds.length} seed(s) → ${WORK_DIR}/${PLAN_FILE}\n`
  );
  return 0;
}

const COMMANDS = { plan };

/**
 * @param {string[]} argv
 * @param {object} [deps] root, stdout, stderr
 * @returns {number} exit code
 */
export function main(argv, deps = {}) {
  const rootFlag = argv.indexOf("--root");
  const ctx = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    ...deps,
    root: rootFlag !== -1 ? resolve(argv[rootFlag + 1]) : (deps.root ?? DEFAULT_ROOT),
  };
  const command = COMMANDS[argv[0]];
  if (!command) {
    ctx.stderr(`Usage: findings.mjs <${Object.keys(COMMANDS).join("|")}> [flags] [--root <dir>]\n`);
    return 2;
  }
  try {
    return command(ctx, argv.slice(1));
  } catch (err) {
    ctx.stderr(`findings.mjs ${argv[0]}: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
