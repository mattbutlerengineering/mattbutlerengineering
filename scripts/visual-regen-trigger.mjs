#!/usr/bin/env node

/**
 * visual-regen-trigger.mjs — the pure decision behind the
 * `visual-regen-trigger.yml` `workflow_run` job (#8462).
 *
 * Before this, a UI PR merging main-red on `apps-visual.yml` or
 * `rialto-web-e2e.yml`'s visual job stayed red until a human noticed and
 * hand-dispatched `visual-baseline-regen.yml` — three times in two days
 * (#8423, #8401/#8434, #8440). The first manual dispatch at #8440 also
 * failed outright: `grep=home` matched no test name, because the real
 * Playwright title is the full `<route> @ <w>x<h>` string
 * (`${route} @ ${width}x${height}`, see apps/marketing/e2e/visual.spec.ts and
 * apps/hospitality/e2e/visual.spec.ts), not a route fragment. This module
 * reads the EXACT failing spec title out of the run's own Playwright JSON
 * report (never a sanitized attachment filename — see
 * `scripts/visual-diff-report.mjs`'s `buildRecord`, which derives a different,
 * non-reusable name from the `-actual` attachment) so the derived `--grep`
 * cannot repeat that mistake.
 *
 * No `gh`/`git`/network calls happen here — every input (the run's jobs, its
 * Playwright JSON reports, the open PRs' head branches) is injected by the
 * thin workflow steps that call this module's CLI. Dedupe reuses
 * `visual-baseline-regen.mjs`'s OWN branch-naming convention
 * (`planBaselineRegen`) rather than restating it, so the two modules cannot
 * drift apart on what "already has a regen PR open" means.
 *
 * Usage:
 *   node scripts/visual-regen-trigger.mjs failing-apps --jobs <jobs.json>
 *     prints `apps=<json array>` for `$GITHUB_OUTPUT` — lets the workflow
 *     conditionally download only the report artifacts for apps that failed
 *   node scripts/visual-regen-trigger.mjs plan --jobs <jobs.json> \
 *     --reports-dir <dir> --open-branches <branches.json>
 *     reads `<dir>/<app>/report.json` per failing app (when present) and
 *     prints `dispatch=<json>` / `skipped=<json>` for `$GITHUB_OUTPUT`
 *   node scripts/visual-regen-trigger.mjs comment --app <app> --grep <grep> \
 *     --run-url <url> --repo <owner>/<name>
 *     prints the drift-notice comment body (links the failing run AND a
 *     deterministic search for the app's regen PR)
 *   node scripts/visual-regen-trigger.mjs comment-duplicate --app <app> \
 *     --run-url <url> --repo <owner>/<name>
 *     prints the comment body for an app skipped as duplicate-pending
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APPS } from "./visual-noise-floor.mjs";
import { planBaselineRegen } from "./visual-baseline-regen.mjs";

/** Both visual workflows name their job this way — see apps-visual.yml's
 * `marketing-visual`/`hospitality-visual` and rialto-web-e2e.yml's `visual`. */
const JOB_NAME_PATTERN = /^Visual Regression \(([a-z-]+)\)$/;

/**
 * Pure: the set of apps whose visual job FAILED in this workflow_run, from
 * the run's own job list (`gh api .../actions/runs/<id>/jobs`).
 *
 * Only an exact `"failure"` conclusion counts — `cancelled`/`skipped`/`null`
 * are not a regression (same reasoning as the cancelled-vs-failure gotcha for
 * main-health watching) and must never trigger a baseline regen.
 *
 * @param {{ name: string, conclusion: string }[] | undefined} jobs
 * @returns {string[]} sorted, deduplicated app names
 */
export function deriveFailingApps(jobs) {
  const apps = new Set();
  for (const job of jobs ?? []) {
    const match = JOB_NAME_PATTERN.exec(job?.name ?? "");
    if (!match) continue;
    const app = match[1];
    if (!APPS.includes(app)) continue;
    if (job?.conclusion === "failure") apps.add(app);
  }
  return [...apps].sort();
}

/** Pure: every failing spec's title, walking nested suites (Playwright JSON report shape). */
function collectFailingTitles(node, acc) {
  for (const spec of node?.specs ?? []) {
    if (spec?.ok === false && typeof spec.title === "string") acc.push(spec.title);
  }
  for (const suite of node?.suites ?? []) collectFailingTitles(suite, acc);
  return acc;
}

/**
 * Pure: the EXACT titles of every failing spec in one Playwright JSON report.
 *
 * `spec.title` IS the `${route} @ ${width}x${height}` (or app-specific
 * equivalent) string Playwright's `--grep` matches against — never a
 * filename-safe stand-in. Sorted for a stable, reproducible `--grep`.
 *
 * @param {object | undefined} report
 * @returns {string[]}
 */
export function extractFailingTestTitles(report) {
  return collectFailingTitles(report, []).sort();
}

/** Escapes one title for use inside a regex alternation. */
function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pure: an exact-match Playwright `--grep` value for a set of failing titles.
 *
 * An empty array returns `""` — the caller omits `--grep` entirely and the
 * regen recaptures the whole suite, which is correct when the run's report
 * named no specific failing spec (e.g. no report artifact at all).
 *
 * @param {string[] | undefined} titles
 * @returns {string}
 */
export function buildGrepPattern(titles) {
  if (!titles || titles.length === 0) return "";
  return titles.map(escapeForRegExp).join("|");
}

/** Pure: the regen branch for an app, read from `visual-baseline-regen.mjs`'s own convention. */
export function regenBranchFor(app) {
  return planBaselineRegen({ app }).branch;
}

/**
 * Pure: true when an open PR already carries this app's regen branch —
 * don't dispatch again while that PR is still open.
 *
 * @param {string[] | undefined} openPrHeadRefs
 * @param {string} app
 */
export function isDuplicatePending(openPrHeadRefs, app) {
  return (openPrHeadRefs ?? []).includes(regenBranchFor(app));
}

/**
 * Pure: the full dispatch decision for one workflow_run event.
 *
 * @param {{ jobs: object[], reportsByApp?: Record<string, object>, openPrHeadRefs?: string[] }} input
 * @returns {{ dispatch: { app: string, grep: string, branch: string, titleCount: number }[],
 *             skipped: { app: string, reason: string, branch: string }[] }}
 */
export function planRegenDispatches({ jobs, reportsByApp = {}, openPrHeadRefs = [] }) {
  const dispatch = [];
  const skipped = [];
  for (const app of deriveFailingApps(jobs)) {
    if (isDuplicatePending(openPrHeadRefs, app)) {
      skipped.push({ app, reason: "duplicate-pending", branch: regenBranchFor(app) });
      continue;
    }
    const titles = extractFailingTestTitles(reportsByApp[app]);
    dispatch.push({
      app,
      grep: buildGrepPattern(titles),
      branch: regenBranchFor(app),
      titleCount: titles.length,
    });
  }
  return { dispatch, skipped };
}

/**
 * Pure: a link that resolves to the app's regen PR once it exists — fully
 * derivable from `app` alone (no run/PR id to look up or poll for), because
 * `regenBranchFor` is a deterministic, one-PR-per-app branch name.
 *
 * @param {{ repo: string, app: string }} input `repo` is `owner/name`.
 */
export function regenPrSearchUrl({ repo, app }) {
  const query = `is:pr head:${regenBranchFor(app)}`;
  return `https://github.com/${repo}/pulls?q=${encodeURIComponent(query)}`;
}

/**
 * Pure: the comment posted on the merged PR whose change turned the visual
 * job red. Never claims auto-merge — the regen PR always stays `needs-review`
 * (see visual-baseline-regen.mjs's `renderPrBody`); this is the matching
 * notice for the PR that caused the drift, not the regen PR itself. Links
 * BOTH the failing run (what broke) and the regen PR search (what to review)
 * — AC2 requires a human be able to find and compare the regenerated images.
 *
 * @param {{ app: string, grep: string, runUrl: string, repo: string }} input
 */
export function renderDriftComment({ app, grep, runUrl, repo }) {
  const scope = grep
    ? "with `--grep` scoped to the failing snapshot(s)"
    : "against the whole suite (no single failing snapshot was identified)";
  return [
    `This merge turned the \`${app}\` visual job red on \`main\` (${runUrl}).`,
    "",
    `Dispatched \`visual-baseline-regen.yml\` for \`${app}\` ${scope}. ` +
      `It opens a \`needs-review\` PR with the regenerated baseline PNGs — track it at ` +
      `${regenPrSearchUrl({ repo, app })} and compare the images there before merging; ` +
      "this never merges on its own.",
  ].join("\n");
}

/**
 * Pure: the comment posted on the culprit PR when an app is skipped as
 * duplicate-pending (an app can go red again while its regen PR is still
 * open) — so that case gets a notice too, instead of silence (AC2 nit).
 *
 * @param {{ app: string, runUrl: string, repo: string }} input
 */
export function renderDuplicateNotice({ app, runUrl, repo }) {
  return [
    `This merge turned the \`${app}\` visual job red on \`main\` again (${runUrl}).`,
    "",
    `A \`visual-baseline-regen.yml\` PR for \`${app}\` is already open — see ` +
      `${regenPrSearchUrl({ repo, app })}. Not dispatching another regen while it's pending.`,
  ].join("\n");
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Reads `<reportsDir>/<app>/report.json` for every app named in `jobs`, when
 * present. A missing file (the job failed before the "Upload the JSON
 * report" step ran, e.g. a webServer startup failure) is omitted rather than
 * defaulted — `planRegenDispatches` already treats a missing report as "no
 * known failing titles" and falls back to a whole-suite regen (empty `--grep`).
 */
export function readReportsByApp(jobs, reportsDir) {
  const reportsByApp = {};
  for (const app of deriveFailingApps(jobs)) {
    const path = `${reportsDir}/${app}/report.json`;
    if (existsSync(path)) reportsByApp[app] = readJson(path);
  }
  return reportsByApp;
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "failing-apps") {
    const jobs = readJson(flag(args, "jobs"));
    process.stdout.write(`apps=${JSON.stringify(deriveFailingApps(jobs))}\n`);
  } else if (cmd === "plan") {
    const jobs = readJson(flag(args, "jobs"));
    const { dispatch, skipped } = planRegenDispatches({
      jobs,
      reportsByApp: readReportsByApp(jobs, flag(args, "reports-dir")),
      openPrHeadRefs: readJson(flag(args, "open-branches")),
    });
    process.stdout.write(
      `dispatch=${JSON.stringify(dispatch)}\nskipped=${JSON.stringify(skipped)}\n`
    );
  } else if (cmd === "comment") {
    process.stdout.write(
      renderDriftComment({
        app: flag(args, "app"),
        grep: flag(args, "grep") ?? "",
        runUrl: flag(args, "run-url") ?? "",
        repo: flag(args, "repo"),
      })
    );
  } else if (cmd === "comment-duplicate") {
    process.stdout.write(
      renderDuplicateNotice({
        app: flag(args, "app"),
        runUrl: flag(args, "run-url") ?? "",
        repo: flag(args, "repo"),
      })
    );
  } else {
    throw new Error(
      "usage: visual-regen-trigger.mjs <failing-apps|plan|comment|comment-duplicate> …"
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
