#!/usr/bin/env node

/**
 * sentry-heartbeat-issues.mjs — turn the heartbeat's per-project verdicts into
 * GitHub issue actions: open one alert per failing project, comment on an
 * alert that is already open, close it on the next green run.
 *
 * Alerts are found by a hidden body marker through the REST issues LIST, not
 * Search — Search lags by hours, and a lagging search would file a duplicate
 * on the next day's run. Bodies never contain a Sentry issue link, because
 * sentry-triage's `decideSentryDedup` scans `sentry`-labelled bodies for
 * Sentry issue ids and a heartbeat alert must never suppress a real filing.
 *
 * Usage (from .github/workflows/sentry-heartbeat.yml):
 *   GH_TOKEN=... node scripts/sentry-heartbeat-issues.mjs heartbeat-verdicts.json
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { aggregateExitCode, describeTargetOutcome } from "./sentry-heartbeat.mjs";

/** Existing label. Never `ready`: an alert is for the operator, not implement-queue. */
export const ALERT_LABEL = "sentry";

const MARKER_PATTERN = /<!-- sentry-heartbeat project=([a-z0-9-]+) -->/;

/** @param {string} project */
export function alertMarker(project) {
  return `<!-- sentry-heartbeat project=${project} -->`;
}

/** @param {unknown} body @returns {string | undefined} */
export function projectFromIssueBody(body) {
  return typeof body === "string" ? MARKER_PATTERN.exec(body)?.[1] : undefined;
}

/** @param {{ targets: Array<{ outcome: string }> }} verdict */
function failingTargetLines(verdict) {
  return verdict.targets
    .filter((target) => target.outcome !== "confirmed")
    .map((target) => `- \`${describeTargetOutcome(target)}\``);
}

/** @param {{ project: string, targets: Array<object> }} verdict @param {string} runUrl */
function openBody(verdict, runUrl) {
  return [
    `The daily Sentry heartbeat could not confirm that Sentry project **${verdict.project}** is ingesting events raised inside its deployed artifacts.`,
    "",
    "Failing targets:",
    ...failingTargetLines(verdict),
    "",
    `Run: ${runUrl}`,
    "",
    "`misrouted → <project>` means the event arrived, but in a different Sentry project than expected. `not-found` means nothing arrived within the poll window. `provoke-failed` means the trigger never fired. `error` means the check itself could not complete.",
    "",
    "This issue is updated by each failing run and closed automatically by the next green run for this project.",
    "",
    alertMarker(verdict.project),
  ].join("\n");
}

/** @param {{ targets: Array<object> }} verdict @param {string} runUrl */
function stillFailingBody(verdict, runUrl) {
  return [`Still failing in ${runUrl}:`, ...failingTargetLines(verdict)].join("\n");
}

/**
 * The pure decision: one action per project.
 *
 * | verdict | open alert? | action  |
 * | fail    | no          | open    |
 * | fail    | yes         | comment |
 * | pass    | yes         | close   |
 * | pass    | no          | none    |
 *
 * @param {Array<{ project: string, pass: boolean, targets: Array<object> }>} verdicts
 * @param {Array<{ number: number, body?: string }>} openAlertIssues
 * @param {string} runUrl
 */
export function decideIssueActions(verdicts, openAlertIssues, runUrl) {
  const openByProject = new Map();
  for (const issue of openAlertIssues) {
    const project = projectFromIssueBody(issue.body);
    if (project && !openByProject.has(project)) openByProject.set(project, issue.number);
  }
  return verdicts.map((verdict) => {
    const issueNumber = openByProject.get(verdict.project);
    if (!verdict.pass && issueNumber === undefined) {
      return {
        project: verdict.project,
        action: "open",
        title: `Sentry heartbeat failing: ${verdict.project}`,
        body: openBody(verdict, runUrl),
        labels: [ALERT_LABEL],
      };
    }
    if (!verdict.pass) {
      return {
        project: verdict.project,
        action: "comment",
        issueNumber,
        body: stillFailingBody(verdict, runUrl),
      };
    }
    if (issueNumber !== undefined) {
      return {
        project: verdict.project,
        action: "close",
        issueNumber,
        body: `The Sentry heartbeat is green again for **${verdict.project}** in ${runUrl}. Closing.`,
      };
    }
    return { project: verdict.project, action: "none" };
  });
}

/**
 * Apply the decision through a GitHub adapter. A failed list means NO action
 * (never "saw none, so open a duplicate"); each action is attempted
 * independently and any failure makes the step red.
 *
 * @param {{
 *   verdicts: unknown,
 *   runUrl: string,
 *   github: {
 *     listOpenAlertIssues: () => Promise<Array<{ number: number, body?: string }>>,
 *     createIssue: (issue: { title: string, body: string, labels: string[] }) => Promise<void>,
 *     comment: (issueNumber: number, body: string) => Promise<void>,
 *     close: (issueNumber: number) => Promise<void>,
 *   },
 *   log?: (line: string) => void,
 * }} args
 * @returns {Promise<{ exitCode: 0 | 1 | 2 }>}
 */
export async function reconcileIssues({ verdicts, runUrl, github, log = console.log }) {
  if (aggregateExitCode(verdicts) === 2) {
    log("::error::Heartbeat verdicts are missing or unreadable; no issue actions taken.");
    return { exitCode: 2 };
  }
  let openIssues;
  try {
    openIssues = await github.listOpenAlertIssues();
  } catch (error) {
    log(`::error::Could not list open alert issues; no issue actions taken: ${error.message}`);
    return { exitCode: 1 };
  }

  let failures = 0;
  for (const action of decideIssueActions(verdicts, openIssues, runUrl)) {
    try {
      if (action.action === "open") await github.createIssue(action);
      if (action.action === "comment") await github.comment(action.issueNumber, action.body);
      if (action.action === "close") {
        await github.comment(action.issueNumber, action.body);
        await github.close(action.issueNumber);
      }
      log(
        `${action.project}: ${action.action}${action.issueNumber ? ` #${action.issueNumber}` : ""}`
      );
    } catch (error) {
      failures += 1;
      log(`::error::${action.project}: ${action.action} failed: ${error.message}`);
    }
  }
  return { exitCode: failures === 0 ? 0 : 1 };
}

/* c8 ignore start -- thin `gh api` adapter and CLI entrypoint; they talk to the real GitHub API from the workflow. Every decision is in decideIssueActions/reconcileIssues, unit-tested with a fake adapter. */
const PAGE_SIZE = 100;

/** @param {string} repo */
function ghAdapter(repo) {
  const gh = (args) =>
    execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return {
    async listOpenAlertIssues() {
      const issues = JSON.parse(
        gh([
          "-X",
          "GET",
          `repos/${repo}/issues`,
          "-f",
          `labels=${ALERT_LABEL}`,
          "-f",
          "state=open",
          "-f",
          `per_page=${PAGE_SIZE}`,
        ])
      );
      if (!Array.isArray(issues)) throw new Error("issues list was not an array");
      // A full page may be truncated; an unseen alert would be re-filed. Fail closed.
      if (issues.length >= PAGE_SIZE)
        throw new Error(`${PAGE_SIZE}+ open sentry issues; refusing to guess`);
      return issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({ number: issue.number, body: issue.body ?? "" }));
    },
    async createIssue({ title, body, labels }) {
      gh([
        `repos/${repo}/issues`,
        "-f",
        `title=${title}`,
        "-f",
        `body=${body}`,
        ...labels.flatMap((label) => ["-f", `labels[]=${label}`]),
      ]);
    },
    async comment(issueNumber, body) {
      gh([`repos/${repo}/issues/${issueNumber}/comments`, "-f", `body=${body}`]);
    },
    async close(issueNumber) {
      gh([
        "-X",
        "PATCH",
        `repos/${repo}/issues/${issueNumber}`,
        "-f",
        "state=closed",
        "-f",
        "state_reason=completed",
      ]);
    },
  };
}

async function main(argv) {
  const verdictPath = argv[0];
  const repo = process.env.GITHUB_REPOSITORY;
  if (!verdictPath || !repo) {
    console.error("Usage: GITHUB_REPOSITORY=o/r sentry-heartbeat-issues.mjs <verdicts.json>");
    process.exit(2);
  }
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID ?? "local"}`;
  let verdicts;
  try {
    verdicts = JSON.parse(readFileSync(verdictPath, "utf8"));
  } catch {
    verdicts = undefined;
  }
  const { exitCode } = await reconcileIssues({ verdicts, runUrl, github: ghAdapter(repo) });
  process.exit(exitCode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
/* c8 ignore stop */
