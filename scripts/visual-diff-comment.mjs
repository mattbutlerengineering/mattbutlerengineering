#!/usr/bin/env node

/**
 * visual-diff-comment.mjs — everything about the sticky pull-request comment
 * as an artifact: ordering, the display cap, the markdown body, the machine
 * marker, and the decision of what this run may do to a standing comment.
 *
 * Split from `visual-diff-report.mjs` because the two change for different
 * reasons: that module tracks Playwright's output format, this one tracks a
 * comment shape. Pure — no filesystem, no child processes, no GitHub client.
 */

/**
 * Image rows the comment shows. Six rows at width 250 is roughly two screens,
 * and six of a 49-snapshot suite is a large enough sample to separate
 * "everything shifted a pixel" from "one component broke". A named constant
 * rather than an env var: the legibility question is settled by editing this
 * line, not by configuring a workflow.
 */
export const MAX_IMAGE_ROWS = 6;

/**
 * Pure: the snapshots that get image rows, ordered.
 *
 * Descending pixel count, `pixels: null` first, ties broken by snapshot name
 * so the output is deterministic. Nulls lead because a size mismatch or a
 * missing baseline is both the most alarming outcome and the least
 * self-explanatory. Spec order was the alternative and loses: with a cap in
 * play, dropping the largest mover to keep an alphabetically earlier
 * three-pixel drift inverts the comment's whole purpose.
 *
 * Never mutates its input.
 *
 * @param {Array<object>} changed Records from `parseVisualReport`.
 * @param {number} cap
 * @returns {Array<object>}
 */
export function selectDisplayed(changed, cap) {
  return [...(changed ?? [])]
    .sort((a, b) => {
      const aNull = a.pixels === null || a.pixels === undefined;
      const bNull = b.pixels === null || b.pixels === undefined;
      if (aNull !== bNull) return aNull ? -1 : 1;
      if (!aNull && a.pixels !== b.pixels) return b.pixels - a.pixels;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    })
    .slice(0, cap);
}

/**
 * The artifact the `visual` job already uploads. Named in the comment as the
 * full record — this feature is additive to it, never a replacement.
 */
export const DIFF_ARTIFACT_NAME = "rialto-web-visual-diffs";

/**
 * Machine marker prefix. The caller finds the standing comment by substring
 * over `GET /repos/{repo}/issues/{n}/comments` — the idiom
 * `preview-deploy.yml` already uses — and `decideCommentAction` reads the
 * ordinal back out of it. It is the ONLY record of which run owns the comment.
 */
export const COMMENT_MARKER_PREFIX = "<!-- visual-diffs-in-pr run=";

/** Width, in CSS pixels, of each embedded image. */
const IMAGE_WIDTH = 250;

/**
 * Pure: the file name a snapshot image gets in the published flat tree.
 *
 * Derived from the report's own path so the comment's URL and the blob the
 * publisher writes can never disagree.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function blobName(filePath) {
  return filePath.split("/").pop();
}

/** Pure: the marker line for one run. */
function markerLine(runId, runAttempt) {
  return `${COMMENT_MARKER_PREFIX}${runId} attempt=${runAttempt} -->`;
}

/**
 * Pure: how one record's difference is described in prose.
 *
 * `pixels: null` renders the reason instead of the string `null px`; a
 * `budget` of `null` drops the "over N budget" clause rather than inventing a
 * number. Same rule for both: say less, never guess.
 */
function describeDifference(rec, budget) {
  if (rec.pixels === null || rec.pixels === undefined) return rec.reason;
  return budget === null || budget === undefined
    ? `${rec.pixels} px changed`
    : `${rec.pixels} px over ${budget} budget`;
}

function imageCell(filePath, sha, repoSlug) {
  if (!filePath) return "—";
  const url = `https://raw.githubusercontent.com/${repoSlug}/${sha}/${blobName(filePath)}`;
  return `<img src="${url}" width="${IMAGE_WIDTH}">`;
}

function imageSection(rec, { budget, sha, repoSlug }) {
  return [
    `### ${rec.name} (${describeDifference(rec, budget)})`,
    "",
    "| baseline | actual | diff |",
    "| --- | --- | --- |",
    `| ${imageCell(rec.expectedPath, sha, repoSlug)} ` +
      `| ${imageCell(rec.actualPath, sha, repoSlug)} ` +
      `| ${imageCell(rec.diffPath, sha, repoSlug)} |`,
    "",
  ];
}

/**
 * Pure: the full comment body.
 *
 * The cap bounds **image rows**; the text is **exhaustive** — every changed
 * snapshot appears by name and difference somewhere in the body, which is what
 * makes SC-2 and SC-6 satisfiable together. Capping the text too would make
 * SC-2 unsatisfiable exactly when it matters most.
 *
 * `budget` is an input and never a literal in this module. A comment that
 * confidently asserts a budget it did not read would reproduce #4496 — the
 * tolerance change nobody noticed — inside the fix for it.
 *
 * Images are addressed by **commit SHA**, never by ref name: a SHA is
 * immutable, and a ref name containing `/` cannot be told apart from the path
 * in a `raw.githubusercontent.com` URL.
 *
 * @param {object} input
 * @param {number} input.total Suite snapshot count, from `parseVisualReport`.
 * @param {Array<object>} input.changed Records from `parseVisualReport`.
 * @param {number|null} input.budget From `parseMaxDiffPixels`, via the caller.
 * @param {string} input.sha The published orphan commit.
 * @param {string} input.repoSlug `owner/repo`.
 * @param {string|number} input.runId
 * @param {string|number} input.runAttempt
 * @param {number} [input.cap]
 * @returns {string}
 */
export function renderComment({
  total,
  changed,
  budget,
  sha,
  repoSlug,
  runId,
  runAttempt,
  cap = MAX_IMAGE_ROWS,
}) {
  const all = selectDisplayed(changed, Number.POSITIVE_INFINITY);
  const displayed = all.slice(0, cap);
  const overflow = all.slice(cap);
  const unchanged = total - all.length;

  const lines = [
    markerLine(runId, runAttempt),
    `## 🖼 Visual regression — ${all.length} of ${total} changed`,
    "",
  ];

  for (const rec of displayed) lines.push(...imageSection(rec, { budget, sha, repoSlug }));

  if (overflow.length > 0) {
    lines.push(
      `**${overflow.length} more changed snapshot${overflow.length === 1 ? "" : "s"}** — ` +
        `images omitted; the full set is in the \`${DIFF_ARTIFACT_NAME}\` artifact on this run.`,
      ""
    );
    for (const rec of overflow) {
      lines.push(`- \`${rec.name}\` — ${describeDifference(rec, budget)}`);
    }
    lines.push("");
  }

  const budgetNote =
    budget === null || budget === undefined
      ? " The pixel budget could not be read from this run's Playwright config, so " +
        "differences are reported without one."
      : "";

  lines.push(
    `<sub>${unchanged} of ${total} snapshots unchanged. Full baseline/actual/diff set: ` +
      `the <code>${DIFF_ARTIFACT_NAME}</code> artifact on this run.${budgetNote}</sub>`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// decideCommentAction — the single staleness guard over every write to the one
// shared cell, deletion included.
// ---------------------------------------------------------------------------

const MARKER_ORDINAL_PATTERN = /<!-- visual-diffs-in-pr run=(\S+) attempt=(\S+) -->/;

/**
 * Pure: `[runId, runAttempt]` as numbers, or `null` when either is unreadable.
 */
function toOrdinal(value) {
  const runId = Number(value?.runId);
  const runAttempt = Number(value?.runAttempt);
  if (!Number.isFinite(runId) || !Number.isFinite(runAttempt)) return null;
  return [runId, runAttempt];
}

/** Pure: the ordinal recorded in a standing comment's marker, or `null`. */
function parseStandingOrdinal(existingBody) {
  if (typeof existingBody !== "string") return null;
  const match = MARKER_ORDINAL_PATTERN.exec(existingBody);
  if (!match) return null;
  return toOrdinal({ runId: match[1], runAttempt: match[2] });
}

/**
 * Pure: is `ours` at least as new as `standing`?
 *
 * Tuple-lexicographic on `[run_id, run_attempt]`, compared **numerically** —
 * run ids are numbers of differing lengths, so a raw string compare orders
 * them wrongly. `>=` rather than `>` so a re-executed publisher step within one
 * attempt can still correct its own comment.
 */
function atLeastAsNew(ours, standingOrdinal) {
  if (ours[0] !== standingOrdinal[0]) return ours[0] > standingOrdinal[0];
  return ours[1] >= standingOrdinal[1];
}

/**
 * Pure: what this run may do to the standing comment.
 *
 * Returns a **verb** — `"post" | "patch" | "delete" | "skip"` — which the thin
 * caller executes without deciding anything. A boolean cannot carry this: the
 * caller would have to distinguish "no comment to clear" from "a newer run owns
 * the comment", and that is policy landing in the one module that holds none.
 *
 * Why the guard exists at all: `rialto-web-e2e.yml` declares no `concurrency:`
 * group, so two runs for one pull request can overlap and the older can finish
 * last. Refs are immune by construction (each run writes its own); the comment
 * is the one shared cell, so the guard lives exactly there — and it covers
 * EVERY write to that cell. An unguarded delete lets an older *passing* run
 * remove a newer *failing* run's comment, leaving a live visual failure with no
 * comment at all: the same interleaving, the same feature broken, in the
 * opposite direction and with no symptom.
 *
 * | standing comment                   | `visual` failed | `visual` passed           |
 * | ---------------------------------- | --------------- | ------------------------- |
 * | absent                             | `post`          | `skip` — nothing to clear |
 * | ordinal ≤ ours                     | `patch`         | `delete`                  |
 * | ordinal strictly newer             | `skip`          | `skip`                    |
 * | marker present, ordinal unparsable | `patch`         | `skip`                    |
 *
 * The last row is the one deliberate asymmetry, and it is not a symmetry
 * failure: an unreadable marker means the standing comment's age is unknowable,
 * and the two branches' wrong answers are not equally bad. A wrong `patch`
 * leaves stale failure content that is visible and that the next run of either
 * outcome repairs; a wrong `delete` leaves a live failure with no comment, the
 * exact state this feature exists to eliminate, and nothing announces it.
 *
 * Assumes GitHub allocates run ids in increasing order. If that ever fails, the
 * effect is a stale comment standing until the next run replaces it — strictly
 * no worse than today's behaviour, so the guard fails safe.
 *
 * @param {{existingBody: string|null, runOrdinal: {runId: string|number,
 *          runAttempt: string|number}, visualFailed: boolean}} input
 * @returns {"post"|"patch"|"delete"|"skip"}
 */
export function decideCommentAction({ existingBody, runOrdinal, visualFailed }) {
  if (existingBody === null || existingBody === undefined) {
    return visualFailed ? "post" : "skip";
  }

  const standingOrdinal = parseStandingOrdinal(existingBody);
  const ours = toOrdinal(runOrdinal);

  // Unparsable on either side: the comparison cannot be made, so resolve
  // toward the recoverable wrong answer.
  if (standingOrdinal === null || ours === null) {
    return visualFailed ? "patch" : "skip";
  }

  if (!atLeastAsNew(ours, standingOrdinal)) return "skip";

  return visualFailed ? "patch" : "delete";
}
