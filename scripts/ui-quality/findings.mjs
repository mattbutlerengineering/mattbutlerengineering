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
 *         → .ui-quality/findings.plan.json; exit 2 (nothing written) on an
 *         unknown tell or while an open key predates the rubric's version
 *
 * Usage: node scripts/ui-quality/findings.mjs <plan> [flags] [--root <dir>]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileIssue } from "../lib/issue-filing.mjs";
import { read as readMetric } from "../metrics-store.mjs";
import { RUBRIC_URL } from "./config.mjs";
import { LABEL } from "./labels.mjs";
import { loadRubric, tellsById } from "./rubric.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORK_DIR = ".ui-quality";
export const FINDINGS_METRIC = "ui-quality-findings";
export const PLAN_FILE = "findings.plan.json";

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/** @returns {string} `<app>|<route>|r<version>|<tell-id>` */
export function findingKey(finding, version) {
  return `${finding.app}|${finding.route}|r${version}|${finding.tell}`;
}

/** @returns {{ app: string, route: string, version: number, tell: string } | null} */
export function parseKey(key) {
  const parts = key.split("|");
  const version = /^r(\d+)$/.exec(parts[2] ?? "");
  if (parts.length !== 4 || !version) return null;
  return { app: parts[0], route: parts[1], version: Number(version[1]), tell: parts[3] };
}

/** Open ledgered keys below the rubric's version whose tell the rubric still has. */
export function unmigratedKeys(ledger, rubric) {
  const tells = tellsById(rubric);
  return Object.keys(ledger)
    .filter((key) => {
      const k = parseKey(key);
      return (
        k !== null &&
        ledger[key].state === "open" &&
        k.version < rubric.rubric_version &&
        tells.has(k.tell)
      );
    })
    .sort();
}

export function titleFor(finding, version) {
  return `ui-quality: ${finding.app} ${finding.route} — ${finding.tell} (rubric v${version})`;
}

/** GitHub's heading anchor for `### <tell-id>` in rubric.md. */
const anchorOf = (tell) => tell.toLowerCase().replace(/[^a-z0-9 -]/g, "");

export function bodyFor(finding, severity, key) {
  const ev = finding.evidence ?? {};
  const lines = [
    `**${finding.tell}** (${severity}) on \`${finding.app}\` route \`${finding.route}\`.`,
    "",
    "Evidence:",
    ...[
      ["message", ev.message],
      ["selector", ev.selector],
      ["href", ev.href],
      ["screenshot sha256", ev.screenshot_sha256],
    ]
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `- ${k}: ${v}`),
    "",
    `Rubric: ${RUBRIC_URL}#${anchorOf(finding.tell)}`,
    `Finding key: \`${key}\``,
  ];
  return lines.join("\n");
}

const labelsFor = (severity) => [LABEL.base, severity === "P1" ? LABEL.p1 : LABEL.p2, "ready"];

/** Concatenate every source, refuse unknown tells, one finding per key, sorted by key. */
export function normaliseFindings(sources, rubric) {
  const tells = tellsById(rubric);
  const all = sources.flat();
  const unknown = [...new Set(all.map((f) => f?.tell).filter((t) => !tells.has(t)))];
  if (unknown.length > 0) {
    throw new Error(
      `unknown tell id(s) ${unknown.map((t) => JSON.stringify(t)).join(", ")} — plan only reads detect.mjs output validated against the rubric; this is a pipeline bug`
    );
  }
  const byKey = new Map();
  for (const f of all) {
    const key = findingKey(f, rubric.rubric_version);
    if (!byKey.has(key)) byKey.set(key, { ...f, severity: tells.get(f.tell).default_severity });
  }
  return [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Run each finding through fileIssue(); side effects become pending actions.
 * @returns {{ actions: object[], reports: string[] }}
 */
export function planFindings({ sources, ledger, states, rubric }) {
  const version = rubric.rubric_version;
  const issueLedger = Object.fromEntries(
    Object.entries(ledger)
      .filter(([, rec]) => Number.isInteger(rec.issue))
      .map(([key, rec]) => [key, rec.issue])
  );
  const actions = [];
  const reports = [];
  for (const [key, finding] of normaliseFindings(sources, rubric)) {
    const base = {
      key,
      title: titleFor(finding, version),
      body: bodyFor(finding, finding.severity, key),
      labels: labelsFor(finding.severity),
      severity: finding.severity,
    };
    const prior = issueLedger[key];
    if (prior !== undefined && states[prior] === undefined) {
      reports.push(`${key}: issue #${prior} has no state — skipped`);
      actions.push({ ...base, action: "skip", issue: prior });
      continue;
    }
    const result = fileIssue({ ...base, dedupeKey: key }, issueLedger, {
      getIssueState: (n) => states[n],
      createIssue: () => null,
      reopenIssue: () => {},
    });
    actions.push({ ...base, action: result.action, issue: result.issueNumber });
  }
  return { actions, reports };
}

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
  const result = planFindings({ sources, ledger, states: readJson(statesFile), rubric });
  for (const line of result.reports) ctx.stderr(`findings.mjs plan: ${line}\n`);
  writeWork(ctx.root, PLAN_FILE, result);
  const counts = Object.entries(
    result.actions.reduce((acc, a) => ({ ...acc, [a.action]: (acc[a.action] ?? 0) + 1 }), {})
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  ctx.stderr(`findings.mjs plan: ${counts || "no actions"} → ${WORK_DIR}/${PLAN_FILE}\n`);
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
