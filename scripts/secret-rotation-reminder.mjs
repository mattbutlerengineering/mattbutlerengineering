#!/usr/bin/env node
/**
 * secret-rotation-reminder.mjs — monthly nudge to rotate long-lived secrets.
 *
 * Historically this logic lived entirely as inline YAML bash in
 * `.github/workflows/secret-rotation-reminder.yml`. Two bugs shipped
 * unnoticed for the workflow's entire lifetime: a cron expression that
 * didn't mean what its comment said, and a nonexistent label that made
 * every run that reached issue-creation fail. Both were invisible because
 * inline bash has no unit tests. This module is the fix: the decision logic
 * (which secrets are due, dedup, label validation) is pure and unit-tested;
 * only the CLI entrypoint touches the network.
 *
 * "Age" here means the secret's required rotation cadence (in months), not
 * a tracked last-rotated timestamp — the repo has no such log. A secret is
 * "due" when the current calendar month lands on its cadence, anchored to
 * January (matches docs/SECRETS.md's Quarterly/Semi-Annual schedule).
 */

import { createGhClient } from "@mbe/gh-client";
import { fileIssueBySearch, ghIssueDeps } from "./lib/issue-filing.mjs";

/** Secrets tracked for rotation, with their cadence in months (anchored to January). */
export const ROTATION_SCHEDULE = [
  { name: "DIGITALOCEAN_TOKEN", description: "DigitalOcean API token", intervalMonths: 3 },
  { name: "MBE_CLOUDFLARE_API_TOKEN", description: "Cloudflare API token", intervalMonths: 3 },
  { name: "DATABASE_URL", description: "PostgreSQL connection string", intervalMonths: 3 },
  { name: "R2_ACCESS_KEY_ID", description: "Cloudflare R2 access key", intervalMonths: 3 },
  { name: "R2_SECRET_ACCESS_KEY", description: "Cloudflare R2 secret key", intervalMonths: 3 },
  {
    name: "PULUMI_CONFIG_PASSPHRASE",
    description: "Pulumi stack encryption passphrase",
    intervalMonths: 6,
  },
  { name: "AUTH0_CLIENT_SECRET", description: "Auth0 M2M client secret", intervalMonths: 6 },
  {
    name: "LANGFUSE_SECRET_KEY",
    description: "Langfuse observability API secret",
    intervalMonths: 6,
  },
  { name: "GITLEAKS_LICENSE", description: "Gitleaks license key", intervalMonths: 6 },
  { name: "TURBO_TOKEN", description: "Turborepo remote cache token", intervalMonths: 6 },
];

/** Labels every reminder issue must carry. `security` for triage, `ready` for agent pickup. */
export const REQUIRED_LABELS = ["security", "ready"];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Pure: secrets due for rotation in a given calendar month (1-12). */
export function getDueSecrets(month) {
  return ROTATION_SCHEDULE.filter((secret) => (month - 1) % secret.intervalMonths === 0);
}

/** Pure: the reminder title for a month/year — also the dedup key. */
export function issueTitleFor(month, year) {
  return `chore: rotate secrets due ${MONTH_NAMES[month - 1]} ${year}`;
}

/** Pure: markdown body naming each due secret and its rotation cadence. */
export function formatIssueBody(dueSecrets, month, year) {
  return [
    "## Secret Rotation Reminder",
    "",
    `The following secrets are due for rotation this month (${MONTH_NAMES[month - 1]} ${year}).`,
    "See [docs/SECRETS.md](../blob/main/docs/SECRETS.md) for rotation runbooks.",
    "",
    ...dueSecrets.map(
      (s) => `- [ ] \`${s.name}\` — ${s.description} (rotates every ${s.intervalMonths} months)`
    ),
  ].join("\n");
}

/** Pure: which of `requiredLabels` are absent from `existingLabelNames`. */
export function validateLabels(existingLabelNames, requiredLabels = REQUIRED_LABELS) {
  const existing = new Set(existingLabelNames ?? []);
  const missing = requiredLabels.filter((label) => !existing.has(label));
  return { valid: missing.length === 0, missing };
}

/**
 * Pure: true when `issue` carries the exact same title as `title`
 * (trimmed, case-insensitive). The dedupe match handed to `fileIssueBySearch`
 * (#3775): a match lets a rerun this month skip (still open) or reopen
 * (previously closed) instead of the old open-only check, which would file a
 * fresh duplicate once the prior reminder for this month was closed.
 *
 * @param {{title?: string}} issue
 * @param {string} title
 * @returns {boolean}
 */
export function isSameReminderTitle(issue, title) {
  return issue?.title?.trim().toLowerCase() === title.trim().toLowerCase();
}

/**
 * Orchestrates the monthly check: no due secrets → no-op; due secrets but a
 * required label is missing → throw (no silent/opaque `gh` failure); due
 * secrets and a reminder for this month already exists → skip (still open)
 * or reopen (previously closed) instead of filing a duplicate; otherwise
 * create the reminder issue. The skip/create/reopen decision routes through
 * the shared `fileIssue()` seam (#3775).
 *
 * @param {{
 *   now?: number,
 *   listLabels: () => Promise<string[]>,
 *   listIssuesByLabel: () => Promise<Array<{number:number, title:string}>>,
 *   getIssueState: (issueNumber: number) => "open"|"closed"|"missing",
 *   createIssue: (title: string, body: string, labels: string[]) => number,
 *   reopenIssue: (issueNumber: number) => void,
 *   log?: (msg:string) => void,
 * }} deps
 */
export async function runSecretRotationReminder({
  now = Date.now(),
  listLabels,
  listIssuesByLabel,
  getIssueState,
  createIssue,
  reopenIssue,
  log = () => {},
}) {
  const date = new Date(now);
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();

  const dueSecrets = getDueSecrets(month);
  if (dueSecrets.length === 0) {
    log(`no secrets due for rotation in month ${month}`);
    return { created: false, skipped: false, dueSecrets: [] };
  }

  const { valid, missing } = validateLabels(await listLabels());
  if (!valid) {
    throw new Error(
      `secret-rotation-reminder: missing required label(s) in this repo: ${missing.join(", ")}. ` +
        "Create them (e.g. `gh label create <name>`) before this workflow can file a reminder."
    );
  }

  const title = issueTitleFor(month, year);
  const body = formatIssueBody(dueSecrets, month, year);

  // The injected search is async; settle it first so fileIssueBySearch's
  // single fail-open path handles a rejection. A failed search must not
  // swallow a genuine due reminder.
  const [searched] = await Promise.allSettled([listIssuesByLabel()]);
  const result = fileIssueBySearch(
    { title, body, labels: REQUIRED_LABELS, dedupeKey: title },
    {
      search: () => {
        if (searched.status === "rejected") throw searched.reason;
        return searched.value;
      },
      match: (issue) => isSameReminderTitle(issue, title),
      onSearchError: (err) =>
        log(`search for a prior reminder failed, proceeding as no-match: ${err.message}`),
    },
    { getIssueState, createIssue, reopenIssue }
  );

  if (result.action === "skip") {
    log(`reminder "${title}" already open — skipping duplicate`);
    return { created: false, skipped: true, dueSecrets };
  }

  if (result.action === "skipped-error") {
    log(`could not read state of reminder #${result.issueNumber} — not filing "${title}" this run`);
    return { created: false, skipped: true, dueSecrets };
  }

  log(
    result.action === "reopen"
      ? `reopened reminder "${title}" for ${dueSecrets.length} secret(s)`
      : `created reminder "${title}" for ${dueSecrets.length} secret(s)`
  );
  return { created: true, skipped: false, dueSecrets, title };
}

/** CLI entry: wires the real gh client to {@link runSecretRotationReminder}. */
async function run() {
  const gh = createGhClient({ timeoutMs: 30_000 });

  const result = await runSecretRotationReminder({
    listLabels: async () => gh.label.list(["--json", "name", "--limit", "200"]).map((l) => l.name),
    listIssuesByLabel: async () =>
      gh.issue.list(["--state", "all", "--label", "security", "--json", "number,title"]),
    ...ghIssueDeps(gh),
    log: (msg) => console.log(`[secret-rotation-reminder] ${msg}`),
  });

  console.log(
    `[secret-rotation-reminder] ${
      result.created ? "created" : result.skipped ? "skipped (duplicate)" : "no action"
    }`
  );
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    process.stderr.write(`[secret-rotation-reminder] Error: ${err.message}\n`);
    process.exit(1);
  });
}
