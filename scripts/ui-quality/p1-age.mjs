#!/usr/bin/env node
/**
 * p1-age.mjs — the P1 SLA check (docs/features/ui-quality-loop/architecture.md
 * § Components "P1 SLA", § Interfaces `coverage.mjs`, `p1-age.mjs`).
 *
 * Lists open `ui-quality:p1` issues older than P1_SLA_DAYS and exits 1 when
 * any exist. An issue without a creation time counts as breached (fail
 * closed). Issues come from `--issues <json>` (the routine's MCP result — an
 * array, or `{ items: [...] }`; `createdAt` or `created_at`) or, where `gh`
 * exists, `gh issue list --label ui-quality:p1 --state open`.
 *
 * `--escalate` writes .ui-quality/p1-escalations.json: a `needs-review` label
 * and one comment per breach, skipping any issue the findings ledger already
 * records an `escalated_at` for. The routine executes them, then stamps
 * `escalated_at` through `findings.mjs record` (`{ actions: [], escalated: [n] }`).
 *
 * Usage: node scripts/ui-quality/p1-age.mjs [--issues <json>] [--now <iso>]
 *          [--escalate] [--root <dir>]
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { read as readMetric } from "../metrics-store.mjs";
import { P1_SLA_DAYS } from "./config.mjs";
import { FINDINGS_METRIC } from "./findings.mjs";
import { LABEL } from "./labels.mjs";
import { WORK_DIR } from "./ledger.mjs";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DAY_MS = 24 * 60 * 60 * 1000;
export const ESCALATIONS_FILE = "p1-escalations.json";
const ESCALATION_LABEL = "needs-review";

/**
 * @returns {{ number: number, title: string, ageDays: number|null }[]} the
 *   breaches, oldest first; `ageDays` null when the creation time is unknown
 */
export function breachedIssues(issues, nowMs) {
  return issues
    .map((i) => {
      const created = Date.parse(i.createdAt ?? i.created_at ?? "");
      const ageDays = Number.isNaN(created) ? null : Math.floor((nowMs - created) / DAY_MS);
      return { number: i.number, title: i.title ?? "", ageDays };
    })
    .filter((b) => b.ageDays === null || b.ageDays > P1_SLA_DAYS)
    .sort((a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity) || a.number - b.number);
}

const ageText = (b) => (b.ageDays === null ? "an unknown age" : `${b.ageDays} days`);

/** Label + comment per breach whose issue has no `escalated_at` in the findings ledger. */
export function escalationActions(breaches, ledger) {
  const escalated = new Set(
    Object.values(ledger)
      .filter((r) => r.escalated_at)
      .map((r) => r.issue)
  );
  return breaches
    .filter((b) => !escalated.has(b.number))
    .flatMap((b) => [
      { issue: b.number, action: "label", labels: [ESCALATION_LABEL] },
      {
        issue: b.number,
        action: "comment",
        body: `This ui-quality P1 has been open ${ageText(b)} — past the ${P1_SLA_DAYS}-day SLA. Adding \`${ESCALATION_LABEL}\` so a human looks at it.`,
      },
    ]);
}

function ghIssues() {
  const out = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--label",
      LABEL.p1,
      "--state",
      "open",
      "--limit",
      "500",
      "--json",
      "number,title,createdAt",
    ],
    { encoding: "utf8" }
  );
  return JSON.parse(out);
}

function readIssues(file) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(value) ? value : value?.items;
  if (!Array.isArray(list)) throw new Error(`${file} is neither an array nor { items: [...] }`);
  return list;
}

const flagValue = (argv, flag) => {
  const i = argv.indexOf(flag);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

/**
 * @param {string[]} argv
 * @param {object} [deps] root, stdout, stderr, listIssues
 * @returns {number} exit code — 1 = SLA breached, 2 = unusable input
 */
export function main(argv, deps = {}) {
  const ctx = {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    listIssues: ghIssues,
    ...deps,
    root: resolve(flagValue(argv, "--root") ?? deps.root ?? DEFAULT_ROOT),
  };
  try {
    const file = flagValue(argv, "--issues");
    const issues = file ? readIssues(file) : ctx.listIssues();
    const nowMs = Date.parse(flagValue(argv, "--now") ?? new Date().toISOString());
    const breaches = breachedIssues(issues, nowMs);
    for (const b of breaches) ctx.stdout(`BREACH #${b.number} open ${ageText(b)}: ${b.title}\n`);
    ctx.stdout(
      `${breaches.length} of ${issues.length} open P1 issue(s) older than ${P1_SLA_DAYS} days\n`
    );
    if (argv.includes("--escalate")) {
      const ledger = readMetric(FINDINGS_METRIC, { root: ctx.root }) ?? {};
      const actions = escalationActions(breaches, ledger);
      const path = join(ctx.root, WORK_DIR, ESCALATIONS_FILE);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ actions }, null, 2) + "\n");
      ctx.stderr(
        `p1-age.mjs: ${actions.length} escalation action(s) → ${WORK_DIR}/${ESCALATIONS_FILE}\n`
      );
    }
    return breaches.length > 0 ? 1 : 0;
  } catch (err) {
    ctx.stderr(`p1-age.mjs: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
