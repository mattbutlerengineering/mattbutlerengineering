#!/usr/bin/env node

/**
 * Closes regression issues the learning loop filed once the metric they name
 * has recovered (#9429).
 *
 * Regressions from rolling-window sensors outlive their cause, so a human had
 * to notice and close them by hand. This pass re-reads the sensors live (never
 * a cached number) and closes an issue only when ALL hold:
 *   - it carries the learning-loop provenance footer (never close a human's or
 *     another routine's issue),
 *   - the live metric is back at or past its recorded `Previous` value
 *     (direction comes from the `Delta` sign: negative = higher is better).
 * Anything else stays open. Network access sits behind injected callbacks.
 *
 * Usage: node scripts/close-recovered-regressions.mjs [--dry-run]
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { AUTOMATION_MARKER } from "./lib/automation-marker.mjs";

const REPO = "mattbutlerengineering/mattbutlerengineering";
const PROVENANCE = /_Detected by \[learning-loop\]/;

function field(body, name) {
  const m = body.match(new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+?)\\s*$`, "m"));
  return m ? m[1] : null;
}

/**
 * @param {{ body?: string|null, pull_request?: unknown }} issue
 * @returns {{ sensor: string, metric: string, previous: number, delta: number } | null}
 */
export function parseRegressionIssue(issue) {
  const body = issue?.body;
  if (issue?.pull_request || typeof body !== "string" || !PROVENANCE.test(body)) return null;
  const sensor = field(body, "Sensor");
  const metric = field(body, "Metric");
  const previous = Number(field(body, "Previous"));
  const delta = Number(field(body, "Delta"));
  if (!sensor || !metric || !Number.isFinite(previous) || !Number.isFinite(delta) || delta === 0) {
    return null;
  }
  return { sensor, metric, previous, delta };
}

/**
 * @param {object} issue
 * @param {Record<string, Record<string, unknown>>} sensors live sensor readings
 */
export function decideRegressionClose(issue, sensors) {
  const parsed = parseRegressionIssue(issue);
  if (!parsed) return { action: "skip", reason: "not a learning-loop regression issue" };
  const { sensor, metric, previous, delta } = parsed;
  const reading = sensors?.[sensor];
  const current = Number(reading?.[metric]);
  if (!reading?.available || reading[metric] == null || !Number.isFinite(current)) {
    return { action: "keep", sensor, metric, previous, reason: "no live reading" };
  }
  const recovered = delta < 0 ? current >= previous : current <= previous;
  return {
    action: recovered ? "close" : "keep",
    sensor,
    metric,
    previous,
    current,
    reason: recovered ? "recovered" : "not recovered",
  };
}

/**
 * @param {{
 *   listIssues: () => Promise<object[]>,
 *   collectSensors: () => Promise<Record<string, Record<string, unknown>>>,
 *   closeIssue: (n: number, comment: string, reason: "completed") => Promise<void>,
 *   log?: (line: string) => void,
 *   dryRun?: boolean,
 * }} deps
 */
export async function closeRecoveredRegressions({
  listIssues,
  collectSensors,
  closeIssue,
  log = console.log,
  dryRun = false,
}) {
  const issues = await listIssues();
  const candidates = issues.filter((i) => parseRegressionIssue(i));
  if (candidates.length === 0) {
    log("[close-recovered-regressions] no learning-loop regression issues open");
    return [];
  }
  const sensors = await collectSensors();
  const results = [];
  for (const issue of candidates) {
    const d = decideRegressionClose(issue, sensors);
    results.push({ number: issue.number, ...d });
    const line = `#${issue.number} ${d.sensor}.${d.metric}: current=${d.current ?? "n/a"} previous=${d.previous} -> ${d.action} (${d.reason})`;
    if (d.action !== "close") {
      log(`[close-recovered-regressions] ${line}`);
      continue;
    }
    if (dryRun) {
      log(`[dry-run] would close ${line}`);
      continue;
    }
    const comment =
      `Closing: the metric recovered. Fresh read of sensor \`${d.sensor}\`, ` +
      `\`${d.metric}\` = ${d.current} (previous = ${d.previous}).\n\n` +
      "_Closed by close-recovered-regressions (#9429)._";
    await closeIssue(issue.number, comment, "completed");
    log(`[close-recovered-regressions] closed ${line}`);
  }
  return results;
}

function gh(args, input) {
  return execFileSync("gh", ["api", ...args], { encoding: "utf8", input, maxBuffer: 64 << 20 });
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { createGhClient } = await import("@mbe/gh-client");
  const { getReportSensors, collectReportSensors } = await import("./sensors-registry.mjs");
  await closeRecoveredRegressions({
    dryRun,
    listIssues: async () =>
      JSON.parse(
        gh([
          "-X",
          "GET",
          `repos/${REPO}/issues`,
          "-f",
          "state=open",
          "-f",
          "per_page=100",
          "--paginate",
          "--slurp",
        ])
      ).flat(),
    collectSensors: async () =>
      collectReportSensors(getReportSensors(), {
        root,
        now: new Date(),
        ghClient: createGhClient(),
      }),
    closeIssue: async (n, comment, reason) => {
      gh([
        "-X",
        "POST",
        `repos/${REPO}/issues/${n}/comments`,
        "-f",
        `body=${AUTOMATION_MARKER}\n${comment}`,
      ]);
      gh([
        "-X",
        "PATCH",
        `repos/${REPO}/issues/${n}`,
        "-f",
        "state=closed",
        "-f",
        `state_reason=${reason}`,
      ]);
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
