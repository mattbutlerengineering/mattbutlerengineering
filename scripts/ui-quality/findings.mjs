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
 *         --labelled-issues <json> [--calibration-status pass|failed|stale]
 *         → .ui-quality/findings.plan.json; exit 2 (no plan written) on an
 *         unknown tell, while an open key predates the rubric's version, or
 *         when --labelled-issues (every `ui-quality`-labelled issue as
 *         `{ number, title, state }`, a JSON array) is absent or unreadable,
 *         or names an issue the findings ledger does not reference whose
 *         title is no current finding title — the fire read incomplete
 *         state. An unknown issue whose title IS a current finding title is
 *         adopted under its key (an `adopt` action `record` writes). A
 *         blocked plan writes .ui-quality/findings.escalation.json — one
 *         `needs-review` issue to open — unless an open escalation issue is
 *         already among the labelled issues.
 *         No --calibration-status is `stale`: agent-built findings drop.
 *   record  --executed <json> [--now <iso>] — the executed plan (every create
 *           given its issue number, optional `fix_pr: { key, pr }`, optional
 *           `escalated: [issue]` from p1-age.mjs --escalate) written
 *           back to metrics/ui-quality-findings.json
 *   migrate --from <v> --to <v> — re-key open findings whose tell survives to
 *           the rubric's current version; print { rekeyed, retired }
 *   seeds   --plan <json> [--now <iso>] — append the plan's seeds to
 *           docs/backlog.md as `- <title> (from: session:<date>)`; existing
 *           lines are never rewritten
 *
 * Usage: node scripts/ui-quality/findings.mjs <plan|record|migrate|seeds> [flags] [--root <dir>]
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { read as readMetric, write as writeMetric } from "../metrics-store.mjs";
import { applyExecuted, migrateLedger, renderSeeds } from "./findings-ledger.mjs";
import {
  CALIBRATION_STATUSES,
  planFindings,
  reconcileLabelled,
  unmigratedKeys,
} from "./findings-plan.mjs";
import { WORK_DIR } from "./ledger.mjs";
import { loadRubric } from "./rubric.mjs";

export { findingKey, parseKey } from "./findings-plan.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FINDINGS_METRIC = "ui-quality-findings";
export const PLAN_FILE = "findings.plan.json";
/** Written (under WORK_DIR) only by a blocked `plan` that needs an escalation issue opened. */
export const ESCALATION_FILE = "findings.escalation.json";

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

/**
 * `--labelled-issues`: a JSON array of `{ number, title, state }` (routine
 * step 6b's `search_issues` result, reduced); anything else throws (exit 2).
 */
function readLabelledIssues(file) {
  if (!file) {
    throw new Error(
      "needs --labelled-issues <json> (every ui-quality-labelled issue number) — without it the fire cannot prove its state is complete"
    );
  }
  let value;
  try {
    value = readJson(file);
  } catch (err) {
    throw new Error(`--labelled-issues ${file} is unreadable: ${err.message}`, { cause: err });
  }
  const isIssue = (i) =>
    Number.isInteger(i?.number) &&
    i.number > 0 &&
    typeof i.title === "string" &&
    typeof i.state === "string";
  if (!Array.isArray(value) || !value.every(isIssue)) {
    throw new Error(
      `--labelled-issues ${file} is not a JSON array of { number, title, state } issues`
    );
  }
  return value;
}

function plan(ctx, argv) {
  // A refused plan must never leave an earlier run's plan or escalation behind.
  for (const file of [PLAN_FILE, ESCALATION_FILE]) {
    rmSync(join(ctx.root, WORK_DIR, file), { force: true });
  }
  const files = flagValues(argv, "--findings");
  const statesFile = flagValue(argv, "--issue-states");
  if (files.length === 0 || !statesFile) {
    throw new Error("needs --findings <json> (repeatable) and --issue-states <json>");
  }
  const labelled = readLabelledIssues(flagValue(argv, "--labelled-issues"));
  const rubric = loadRubric(ctx.root);
  const ledger = readLedger(ctx.root);
  const reconciled = reconcileLabelled(ledger, labelled, rubric);
  if (reconciled.blocked.length > 0) {
    ctx.stderr(
      `findings.mjs plan: ${reconciled.blocked.length} ui-quality-labelled issue(s) the findings ledger does not reference and whose title is no current finding title — this fire read incomplete state, so it plans nothing: ${reconciled.blocked.map((n) => `#${n}`).join(", ")}\n`
    );
    if (reconciled.escalation) {
      writeWork(ctx.root, ESCALATION_FILE, reconciled.escalation);
      ctx.stderr(`findings.mjs plan: escalation → ${WORK_DIR}/${ESCALATION_FILE}\n`);
    } else {
      ctx.stderr(
        `findings.mjs plan: open escalation ${reconciled.escalationOpen.map((n) => `#${n}`).join(", ")} already tracks it — none written\n`
      );
    }
    return 2;
  }
  for (const a of reconciled.adopted) {
    ctx.stderr(`findings.mjs plan: adopted #${a.issue} under ${a.key}\n`);
  }
  const adoptedLedger = Object.fromEntries(
    reconciled.adopted.map((a) => [
      a.key,
      { issue: a.issue, carrier: "issue", state: "open", severity: a.severity },
    ])
  );
  const adoptedStates = Object.fromEntries(reconciled.adopted.map((a) => [a.issue, a.state]));
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
    ledger: { ...ledger, ...adoptedLedger },
    states: { ...readJson(statesFile), ...adoptedStates },
    rubric,
    calibrationStatus,
    backlogLines: readBacklogLines(ctx.root),
    adopted: reconciled.adopted,
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

const today = (argv) => (flagValue(argv, "--now") ?? new Date().toISOString()).slice(0, 10);

function record(ctx, argv) {
  const file = flagValue(argv, "--executed");
  if (!file) throw new Error("needs --executed <json>");
  const now = flagValue(argv, "--now") ?? new Date().toISOString();
  const next = applyExecuted(readLedger(ctx.root), readJson(file), now);
  writeMetric(FINDINGS_METRIC, next, { root: ctx.root });
  ctx.stderr(`findings.mjs record: ${Object.keys(next).length} key(s) in the findings ledger\n`);
  return 0;
}

function migrate(ctx, argv) {
  const from = Number(flagValue(argv, "--from"));
  const to = Number(flagValue(argv, "--to"));
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    throw new Error("needs --from <version> and --to <version>");
  }
  const result = migrateLedger(readLedger(ctx.root), from, to, loadRubric(ctx.root));
  writeMetric(FINDINGS_METRIC, result.ledger, { root: ctx.root });
  ctx.stdout(`${JSON.stringify({ rekeyed: result.rekeyed, retired: result.retired }, null, 2)}\n`);
  return 0;
}

function seeds(ctx, argv) {
  const file = flagValue(argv, "--plan");
  if (!file) throw new Error("needs --plan <json>");
  const path = join(ctx.root, BACKLOG_FILE);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = renderSeeds(readJson(file).seeds ?? [], current.split("\n"), today(argv));
  if (lines.length > 0) {
    const sep = current === "" || current.endsWith("\n") ? "" : "\n";
    writeFileSync(path, `${current}${sep}${lines.join("\n")}\n`);
  }
  ctx.stdout(lines.length > 0 ? `${lines.join("\n")}\n` : "");
  return 0;
}

const COMMANDS = { plan, record, migrate, seeds };

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
