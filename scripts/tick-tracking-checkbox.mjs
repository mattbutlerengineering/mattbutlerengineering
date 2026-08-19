#!/usr/bin/env node
/**
 * tick-tracking-checkbox.mjs — keep a tracking issue's task list honest
 * (#4316).
 *
 * `.claude/skills/decompose/SKILL.md` creates a tracking issue with a static
 * `- [ ] #N — <title>` list and never revisits it. Nothing else wrote those
 * boxes either, so a tracking issue read 0% done for the entire life of the
 * feature: closing #4102 found 16/16 children `CLOSED/COMPLETED` and 0/16
 * boxes ticked. Harmless once the tracking issue is closed; actively
 * misleading while it is open, because the checklist is the only
 * at-a-glance progress signal a human triaging the backlog — or `/ideate`'s
 * completion sweep — has to go on.
 *
 * {@link tickTrackingCheckbox} is the whole decision and is pure; the CLI
 * below is a thin I/O shell, matching `merge-queue-eligibility.mjs` /
 * `ci-gate-status.mjs` / `stale-human-blocked.mjs`.
 */

import { execFileSync } from "node:child_process";

/**
 * A markdown task-list line whose first token after the checkbox is an issue
 * reference: `- [ ] #4185 — title`, `* [x] #418`, indented variants included.
 *
 * Anchoring `#N` to the *first* token is what makes matching exact. A looser
 * "line contains #N" test would tick `- [ ] #4185 — fixes the #418 collision`
 * when #418 closed, and the whole point of this module is that the checklist
 * stays trustworthy.
 */
const TASK_LINE = /^(\s*[-*]\s+\[)([ xX])\]\s+#(\d+)/;

/** The `tracking` label — only issues carrying it are considered. */
export const TRACKING_LABEL = "tracking";

/**
 * Flip the checkbox for `issueNumber` in a tracking issue body.
 *
 * Only the matching line changes; every other line — and the body's line
 * endings — is returned byte-identical. A body with no matching line is
 * returned unchanged (by identity), which is what lets the caller skip the
 * PATCH entirely.
 *
 * @param {string} body Tracking issue body.
 * @param {number|string} issueNumber Child issue number that just closed or reopened.
 * @param {boolean} closed `true` when the child closed, `false` on reopen.
 * @returns {string} The updated body, or `body` itself when nothing changed.
 */
export function tickTrackingCheckbox(body, issueNumber, closed) {
  if (typeof body !== "string" || body === "") return body;

  const target = String(issueNumber);
  const desired = closed ? "x" : " ";
  let changed = false;

  const updated = body.split("\n").map((line) => {
    const match = TASK_LINE.exec(line);
    if (!match) return line;

    const [, prefix, state, number] = match;
    if (number !== target) return line;
    if (state.toLowerCase() === desired.toLowerCase()) return line;

    changed = true;
    return prefix + desired + line.slice(prefix.length + 1);
  });

  return changed ? updated.join("\n") : body;
}

/**
 * Decide which tracking issues need a PATCH for this event.
 *
 * Pure, so the fan-out is testable without touching GitHub: an event on a
 * tracking issue itself is a no-op, and so is a tracking issue whose body
 * the transform left untouched.
 *
 * @param {{number: number, isTracking: boolean, closed: boolean}} event
 * @param {Array<{number: number, body: string}>} trackingIssues Open issues labeled `tracking`.
 * @returns {Array<{number: number, body: string}>} Issues to PATCH, with their new bodies.
 */
export function planTrackingUpdates(event, trackingIssues) {
  if (event.isTracking) return [];

  return trackingIssues
    .map((issue) => ({
      number: issue.number,
      body: tickTrackingCheckbox(issue.body, event.number, event.closed),
    }))
    .filter((issue, index) => issue.body !== trackingIssues[index].body);
}

/** Shell out to `gh`, returning stdout. */
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", timeout: 30_000 });
}

/**
 * Parse the CLI's arguments.
 *
 * Separated out and exported so the one piece of real logic in the I/O shell
 * — rejecting a missing or non-numeric `--issue` before any GitHub call — is
 * testable without a network.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {{number: number, closed: boolean, dryRun: boolean}}
 * @throws {Error} When `--issue` is absent or not a positive integer.
 */
export function parseCliArgs(argv) {
  const index = argv.indexOf("--issue");
  const number = index === -1 ? NaN : Number(argv[index + 1]);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("--issue <number> is required");
  }
  return { number, closed: argv.includes("--closed"), dryRun: argv.includes("--dry-run") };
}

/** CLI entry: wires the real `gh` client to {@link planTrackingUpdates}. */
function run() {
  const { number, closed, dryRun } = parseCliArgs(process.argv.slice(2));
  const log = (msg) => console.log(`[tick-tracking-checkbox] ${msg}`);

  const self = JSON.parse(gh(["issue", "view", String(number), "--json", "labels"]));
  const isTracking = (self.labels ?? []).some((label) => label.name === TRACKING_LABEL);

  const open = JSON.parse(
    gh([
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      TRACKING_LABEL,
      "--json",
      "number,body",
      "--limit",
      "100",
    ])
  );

  const updates = planTrackingUpdates({ number, isTracking, closed }, open);
  if (updates.length === 0) {
    log(
      `#${number}: nothing to update (${isTracking ? "is a tracking issue" : "no matching checklist line"})`
    );
    return;
  }

  for (const update of updates) {
    if (dryRun) {
      log(
        `[dry-run] would ${closed ? "tick" : "untick"} #${number} in tracking issue #${update.number}`
      );
      continue;
    }
    // `gh issue edit` is broken on this repo (dies on a Projects-classic
    // GraphQL field and silently does not apply the edit), so PATCH via REST.
    gh([
      "api",
      "-X",
      "PATCH",
      `repos/{owner}/{repo}/issues/${update.number}`,
      "-f",
      `body=${update.body}`,
    ]);
    log(`${closed ? "ticked" : "unticked"} #${number} in tracking issue #${update.number}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (err) {
    process.stderr.write(`[tick-tracking-checkbox] Error: ${err.message}\n`);
    process.exit(1);
  }
}
