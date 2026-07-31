/**
 * Pure report helpers for the daily synthetic venue-onboarding journey
 * (.github/workflows/venue-journey.yml).
 *
 * Everything here is a pure function of the journey report produced by
 * apps/hospitality/e2e/journeys/venue-journey.spec.ts, so the issue-filing
 * behaviour is unit-testable without touching the network or the live site.
 *
 * @typedef {object} JourneyStep
 * @property {string} name        Human-readable step name.
 * @property {"passed"|"failed"|"skipped"} status
 * @property {number} durationMs  Wall-clock duration of the step.
 * @property {string} [error]     Failure message (redacted before use).
 * @property {string} [pageError] Visible `[role="alert"]` text at the moment
 *                                the step failed (redacted before use). This is
 *                                the app's own error message — usually the real
 *                                cause behind a bare locator timeout.
 *
 * @typedef {object} JourneyReport
 * @property {string} runId       GitHub Actions run id (also the venue suffix).
 * @property {string} runUrl      Link to the workflow run (holds the artifacts).
 * @property {string} startedAt   ISO timestamp the journey began.
 * @property {string} venueName   Synthetic venue name used this run.
 * @property {JourneyStep[]} steps
 * @property {string[]} consoleErrors
 */

/** A step slower than this is friction, not failure. */
export const SLOW_STEP_MS = 10_000;

/** Title of the single rolling friction-log issue. */
export const FRICTION_ISSUE_TITLE = "[Journey] venue-journey friction log";

/** Artifact uploaded by the workflow that holds failure screenshots. */
export const SCREENSHOT_ARTIFACT_NAME = "venue-journey-artifacts";

// Order matters: strip whole JWTs before the generic key/value rules, so a
// token embedded in a header line is never partially left behind.
const REDACTIONS = [
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[redacted-jwt]"],
  [/"(access_token|id_token|refresh_token|password)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"'],
  // Header values run to end of line, so consume the whole value — a partial
  // match would leave the token itself behind after the "Bearer" prefix.
  [/\b(authorization|x-audit-token)\b\s*[:=]\s*[^\n\r]*/gi, "$1: [redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]"],
];

/**
 * Strips secret-shaped material from text destined for a public issue body,
 * job summary, or log line. Network-error messages can carry the Authorization
 * header or a raw token, so every externally-visible string goes through this.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function redactSecrets(text) {
  if (typeof text !== "string") return "";
  return REDACTIONS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  );
}

/**
 * Stable dedupe signature for a step. Used both as the issue-title suffix and
 * as the `gh issue list --search` phrase, so a recurring failure at the same
 * step comment-bumps the existing issue instead of filing a new one.
 *
 * @param {string} stepName
 * @returns {string}
 */
export function buildStepSignature(stepName) {
  const slug = String(stepName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `venue-journey/${slug}`;
}

/** @param {JourneyReport} report */
function stepsOf(report) {
  return Array.isArray(report?.steps) ? report.steps : [];
}

/** @param {JourneyReport} report @returns {string} `YYYY-MM-DD` of the run. */
function runDate(report) {
  return String(report?.startedAt ?? "").slice(0, 10);
}

/** Markdown table of every step and its wall-clock duration. */
function stepTable(report) {
  const rows = stepsOf(report).map(
    (step) => `| ${step.name} | ${step.status} | ${step.durationMs} ms |`
  );
  return ["| Step | Status | Duration |", "| --- | --- | --- |", ...rows].join("\n");
}

/**
 * Builds the hard-failure issue for a run, or null when nothing failed.
 * Only the FIRST failing step is reported: the journey is sequential, so later
 * failures are almost always fallout from the first one.
 *
 * @param {JourneyReport} report
 * @returns {{title: string, searchPhrase: string, body: string, commentBody: string, labels: string[]} | null}
 */
export function buildFailureIssue(report) {
  const failed = stepsOf(report).find((step) => step.status === "failed");
  if (!failed) return null;

  const signature = buildStepSignature(failed.name);
  const error = redactSecrets(failed.error) || "(no error message captured)";
  // The app's own banner text, when the page still had one. Redacted again
  // here (the recorder already redacts at capture) so a report produced by any
  // other path still cannot leak a token into a public issue body.
  const pageError = redactSecrets(failed.pageError).trim();

  const body = [
    `The daily synthetic venue-onboarding journey failed at **${failed.name}**.`,
    "",
    `- Signature: \`${signature}\``,
    `- Run: ${report.runUrl}`,
    `- Started: ${report.startedAt}`,
    `- Synthetic venue: \`${report.venueName}\``,
    `- Screenshots: \`${SCREENSHOT_ARTIFACT_NAME}\` artifact on the run above`,
    "",
    ...(pageError ? ["### Page error", "", "```", pageError, "```", ""] : []),
    "### Error",
    "",
    "```",
    error,
    "```",
    "",
    "### Step timings",
    "",
    stepTable(report),
    "",
    "_Filed by the daily venue journey (.github/workflows/venue-journey.yml)._",
  ].join("\n");

  const commentBody = [
    `Recurred on ${runDate(report)} — run ${report.runUrl}`,
    "",
    "```",
    error,
    "```",
  ].join("\n");

  return {
    title: `[Journey] Venue onboarding failed at ${failed.name}`,
    searchPhrase: signature,
    body,
    commentBody,
    labels: ["audit", "ready"],
  };
}

/**
 * Finds an already-open issue for the same failure so a recurrence
 * comment-bumps instead of filing a duplicate.
 *
 * Matching is done client-side over the open `audit` issues rather than via
 * `gh issue list --search`, because the GitHub search index lags by minutes to
 * hours and would let a duplicate slip through on a same-day recurrence.
 *
 * @param {{number: number, title?: string, body?: string}[]} openIssues
 * @param {{title: string, searchPhrase: string}} target
 * @returns {number | null} Lowest matching issue number, or null.
 */
export function findDuplicateIssue(openIssues, { title, searchPhrase }) {
  const matches = (openIssues ?? [])
    .filter((issue) => issue?.title === title || String(issue?.body ?? "").includes(searchPhrase))
    .map((issue) => issue.number);

  return matches.length > 0 ? Math.min(...matches) : null;
}

/**
 * Soft friction: steps that passed but were slow, plus console errors. Failed
 * steps are excluded — those are already reported as hard failures.
 *
 * @param {JourneyReport} report
 * @returns {{slowSteps: {name: string, durationMs: number}[], consoleErrors: string[]}}
 */
export function collectFriction(report) {
  const slowSteps = stepsOf(report)
    .filter((step) => step.status === "passed" && step.durationMs > SLOW_STEP_MS)
    .map((step) => ({ name: step.name, durationMs: step.durationMs }));

  const consoleErrors = [
    ...new Set((report?.consoleErrors ?? []).map(redactSecrets).filter(Boolean)),
  ];

  return { slowSteps, consoleErrors };
}

/**
 * A dated entry for the single rolling friction-log issue, or null when the
 * run had no friction worth recording.
 *
 * @param {JourneyReport} report
 * @returns {string | null}
 */
export function buildFrictionEntry(report) {
  const { slowSteps, consoleErrors } = collectFriction(report);
  if (slowSteps.length === 0 && consoleErrors.length === 0) return null;

  const lines = [`### ${runDate(report)} — [run](${report.runUrl})`, ""];

  if (slowSteps.length > 0) {
    lines.push(`**Slow steps** (budget ${SLOW_STEP_MS} ms):`);
    lines.push(...slowSteps.map((step) => `- ${step.name} — ${step.durationMs} ms`));
    lines.push("");
  }

  if (consoleErrors.length > 0) {
    lines.push("**Console errors:**");
    lines.push(...consoleErrors.map((message) => `- \`${message}\``));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * The workflow job summary — always written, green or not, so per-step timings
 * are visible without opening an issue.
 *
 * @param {JourneyReport} report
 * @returns {string}
 */
export function buildJobSummary(report) {
  const failed = stepsOf(report).find((step) => step.status === "failed");
  const friction = buildFrictionEntry(report);

  const heading = failed
    ? `Journey failed at ${failed.name}`
    : friction
      ? "Journey green with friction"
      : "Journey green";

  const lines = [
    `## Venue journey — ${heading}`,
    "",
    `- Synthetic venue: \`${report.venueName}\``,
    `- Started: ${report.startedAt}`,
    "",
    stepTable(report),
  ];

  if (failed) {
    lines.push("", "### Error", "", "```", redactSecrets(failed.error), "```");
  }
  if (friction) {
    lines.push("", "### Friction", "", friction);
  }

  return lines.join("\n");
}
