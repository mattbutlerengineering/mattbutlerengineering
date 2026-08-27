#!/usr/bin/env node

/**
 * visual-diff-refs.mjs — the ref namespace that carries visual-regression
 * diff images, plus the retention rule that bounds it.
 *
 * Every run of the `visual` job in `.github/workflows/rialto-web-e2e.yml`
 * that has images to show publishes them as ONE orphan commit on a ref only
 * that run names: `visual-diffs/pr-<N>/run-<run_id>-attempt-<run_attempt>`.
 * The attempt is part of the name because GitHub keeps `GITHUB_RUN_ID` stable
 * across "Re-run failed jobs" and increments `GITHUB_RUN_ATTEMPT` — and two
 * attempts build two different orphan commits even from a byte-identical tree
 * (`commit-tree` stamps the committer time), so a name carrying only the run
 * id makes the re-run's push a non-fast-forward. Nothing ever overwrites a
 * ref, so there is no read-modify-write cycle and therefore no lost-update
 * race — concurrency is handled by not sharing state. `--force` is never used
 * and must not be introduced.
 *
 * The published comment addresses its images by **commit SHA**, never by ref
 * name, so the ref exists only to keep the commit reachable. That is what
 * makes retention the whole storage design: see `selectRefsToDelete`.
 *
 * Shaped after `scripts/branch-cleanup.mjs` — pure exported predicates, one
 * impure `main()`, unit tests over the predicates only
 * (`scripts/__tests__/visual-diff-refs.test.mjs`).
 */

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Ref root. Milestone 5 of the run's breakdown probes whether a custom
 * namespace (`refs/visual-diffs/…`) is pushable under `GITHUB_TOKEN`; if it
 * is, flipping this one constant to `"refs"` is the whole change. Deliberately
 * separate from {@link REF_PREFIX} so that flip cannot disturb the prefix the
 * trigger-hygiene guard test and the sweep both key on.
 */
export const REF_ROOT = "refs/heads";

/**
 * Branch-name prefix. The trigger-hygiene guard
 * (`scripts/__tests__/visual-diff-ref-trigger-safety.test.mjs`) asserts no
 * `push:` filter in `.github/workflows/` can match it — a ref under this
 * prefix must never start a CI run.
 */
export const REF_PREFIX = "visual-diffs";

const REF_NAME_PATTERN = new RegExp(`^${REF_PREFIX}/pr-(\\d+)/run-(\\d+)-attempt-(\\d+)$`);

/**
 * Pure: the ref name for one run ATTEMPT's images.
 *
 * The attempt is not decoration. `GITHUB_RUN_ID` is stable across a re-run and
 * `GITHUB_RUN_ATTEMPT` is what increments, so omitting it points attempt 2 at
 * the ref attempt 1 already created — a non-fast-forward push that `--force`
 * is forbidden to resolve, which fails the publisher and strands SC-4.
 *
 * @param {{prNumber: number|string, runId: number|string,
 *          runAttempt: number|string}} input
 * @returns {string} e.g. `visual-diffs/pr-4567/run-32873184619-attempt-1`
 */
export function buildRefName({ prNumber, runId, runAttempt }) {
  return `${REF_PREFIX}/pr-${prNumber}/run-${runId}-attempt-${runAttempt}`;
}

/**
 * Pure: the fully-qualified ref a push targets, i.e. the right-hand side of
 * `git push origin <sha>:<fullRef>`.
 *
 * @param {string} refName A name produced by {@link buildRefName}.
 * @returns {string}
 */
export function fullRef(refName) {
  return `${REF_ROOT}/${refName}`;
}

/**
 * Pure: the inverse of {@link buildRefName}.
 *
 * Returns `null` — never throws — for anything that is not exactly one of our
 * ref names, including `main`, the bare prefix, a trailing-slash variant, and
 * a fully-qualified `refs/heads/…` form (callers strip the root first). The
 * sweep treats an unparsable name as never-deletable, so `null` is the
 * fail-safe answer and must stay cheap to reach.
 *
 * Both ordinals are matched as digits only, and that strictness is the whole
 * point. The earlier `run-([0-9A-Za-z._-]+)` admitted `run-abc`, whose
 * `Number()` is `NaN`; the retention keep-clause then compared `NaN === NaN`,
 * decided the ref was not the newest, and DELETED the only ref of an open pull
 * request. An ordinal that cannot be ordered must not be parsed at all.
 *
 * @param {unknown} refName
 * @returns {{prNumber: number, runId: number, runAttempt: number} | null}
 */
export function parseRefName(refName) {
  if (typeof refName !== "string") return null;
  const match = REF_NAME_PATTERN.exec(refName);
  if (!match) return null;
  return {
    prNumber: Number(match[1]),
    runId: Number(match[2]),
    runAttempt: Number(match[3]),
  };
}

// ---------------------------------------------------------------------------
// Retention. The rule IS the storage design: reachability is what keeps a
// standing comment's images alive, so nothing else may decide what is deleted.
// ---------------------------------------------------------------------------

/**
 * A ref younger than this may still belong to a run in flight, whose comment
 * has not been written yet.
 */
export const MIN_AGE_HOURS = 24;

/**
 * Hours since `committedAt`, or `null` when it cannot be dated.
 *
 * The type guard is load-bearing, not defensive noise: `new Date(null)` and
 * `new Date(0)` are the UNIX epoch — finite, ~57 years old — so without it a
 * ref whose commit lookup failed reads as ancient and gets DELETED, the exact
 * opposite of the fail-safe direction this rule promises. Only a non-empty
 * string is ever a date here; everything else is "unknown", which retains.
 */
function ageHours(committedAt, now) {
  if (typeof committedAt !== "string" || committedAt.trim() === "") return null;
  const then = new Date(committedAt).getTime();
  if (!Number.isFinite(then)) return null;
  return (now.getTime() - then) / 3_600_000;
}

/** Pure: is ordinal `a` strictly newer than ordinal `b`? Tuple-lexicographic
 * on `[run_id, run_attempt]`, the same ordering `decideCommentAction` uses. */
function isNewerOrdinal(a, b) {
  if (a.runId !== b.runId) return a.runId > b.runId;
  return a.runAttempt > b.runAttempt;
}

/**
 * Pure: newest `[run_id, run_attempt]` ordinal seen per PR number.
 *
 * The tuple, not the run id alone: a re-run keeps the run id and increments the
 * attempt, so two refs of one re-run PR share a run id and a run-id-only
 * comparison cannot tell the live one from the superseded one.
 */
function newestOrdinalByPr(parsedRefs) {
  const newest = new Map();
  for (const { parsed } of parsedRefs) {
    const current = newest.get(parsed.prNumber);
    if (current === undefined || isNewerOrdinal(parsed, current)) {
      newest.set(parsed.prNumber, { runId: parsed.runId, runAttempt: parsed.runAttempt });
    }
  }
  return newest;
}

/**
 * Pure: the full keep/delete plan, one verdict per ref.
 *
 * Three clauses, each with the thing it protects:
 *   1. KEEP the newest ref of each *open* PR — it is what that PR's standing
 *      comment points at. (A flat age floor was the alternative and loses on
 *      correctness: a PR open longer than the floor would have its own images
 *      deleted out from under a live comment, breaking SC-3.)
 *   2. KEEP any ref younger than `minAgeHours` — its run may still be in flight.
 *   3. DELETE everything else — superseded runs on open PRs, and every ref of
 *      every closed or merged PR.
 *
 * A ref name `parseRefName` cannot read is never selected: an unrecognized ref
 * is somebody else's, and the fail-safe direction is to leave it alone.
 *
 * Growth is therefore bounded by *(open PRs + one day of churn)*.
 *
 * @param {{refs?: Array<{name:string, committedAt:string}>,
 *          openPrNumbers?: Array<number|string>, now?: Date, minAgeHours?: number}} input
 * @returns {{toDelete: Array<object>, retained: Array<object>}}
 */
export function planRefSweep({
  refs,
  openPrNumbers,
  now = new Date(),
  minAgeHours = MIN_AGE_HOURS,
}) {
  const open = new Set((openPrNumbers ?? []).map(Number));

  const parsedRefs = [];
  const retained = [];

  for (const ref of refs ?? []) {
    const parsed = parseRefName(ref.name);
    if (parsed === null) {
      retained.push({ ...ref, reason: "unparsable" });
      continue;
    }
    parsedRefs.push({ ref, parsed });
  }

  const newest = newestOrdinalByPr(parsedRefs);
  const toDelete = [];

  for (const { ref, parsed } of parsedRefs) {
    const age = ageHours(ref.committedAt, now);
    const newestForPr = newest.get(parsed.prNumber);
    const isNewestOnOpenPr =
      open.has(parsed.prNumber) &&
      newestForPr !== undefined &&
      newestForPr.runId === parsed.runId &&
      newestForPr.runAttempt === parsed.runAttempt;

    if (isNewestOnOpenPr) {
      retained.push({ ...ref, ...parsed, reason: "newest-on-open-pr" });
    } else if (age === null || age < minAgeHours) {
      retained.push({ ...ref, ...parsed, reason: age === null ? "undated" : "too-recent" });
    } else {
      toDelete.push({
        ...ref,
        ...parsed,
        reason: open.has(parsed.prNumber) ? "superseded-on-open-pr" : "closed-pr",
      });
    }
  }

  return { toDelete, retained };
}

/**
 * Pure: the refs the sweep may delete. See {@link planRefSweep} for the rule.
 *
 * @param {{refs?: Array<{name:string, committedAt:string}>,
 *          openPrNumbers?: Array<number|string>, now?: Date, minAgeHours?: number}} input
 * @returns {Array<object>}
 */
export function selectRefsToDelete(input) {
  return planRefSweep(input).toDelete;
}

// ---------------------------------------------------------------------------
// CLI orchestration — side effects live below; everything above is pure.
// ---------------------------------------------------------------------------

/**
 * Pure: is this a dry run?
 *
 * Dry unless `DRY_RUN` is exactly `"false"`. Deliberately not
 * `=== "true"` (`branch-cleanup.mjs`'s spelling): a typo, an empty string, or
 * `FALSE` must land on the harmless side, and the only way to delete is to say
 * so exactly.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function resolveDryRun(env = process.env) {
  return (env.DRY_RUN ?? "true") !== "false";
}

/** Every ref under our prefix, as `{ name, sha }`. */
function listRemoteRefs() {
  const raw = execFileSync(
    "git",
    ["ls-remote", "--heads", "origin", `${REF_ROOT}/${REF_PREFIX}/*`],
    { encoding: "utf8" }
  );
  const prefix = `${REF_ROOT}/`;
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.split(/\s+/);
      return { sha, name: ref.startsWith(prefix) ? ref.slice(prefix.length) : ref };
    });
}

/**
 * The commit's own timestamp, read from the git database endpoint rather than
 * fetched — the sweep has no use for the images, and a shallow checkout has no
 * objects to read `git log` from.
 *
 * An unreadable date returns `null`, which `planRefSweep` retains as
 * `undated`. Failing to date a ref must never be a reason to delete it.
 */
function commitDate(repo, sha) {
  try {
    return execFileSync(
      "gh",
      ["api", `repos/${repo}/git/commits/${sha}`, "--jq", ".committer.date"],
      {
        encoding: "utf8",
      }
    ).trim();
  } catch {
    return null;
  }
}

/** Numbers of every currently-open pull request. */
function listOpenPrNumbers() {
  const raw = execFileSync(
    "gh",
    ["pr", "list", "--state", "open", "--json", "number", "--limit", "500", "--jq", ".[].number"],
    { encoding: "utf8" }
  );
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(Number);
}

/**
 * Idempotent by construction: a ref that is already gone is the state the
 * sweep wanted, so `git push --delete` failing on an absent ref is success.
 */
function deleteRef(name) {
  try {
    execFileSync("git", ["push", "origin", "--delete", `${REF_ROOT}/${name}`], {
      encoding: "utf8",
    });
    return { name, outcome: "deleted" };
  } catch (err) {
    const message = String(err.stderr ?? err.message ?? "");
    if (/remote ref does not exist|unable to delete/i.test(message)) {
      return { name, outcome: "already-absent" };
    }
    return { name, outcome: "failed", error: message.trim() };
  }
}

/**
 * Pure: the human-readable verdict for one sweep.
 *
 * A LIVE run is rendered from `outcomes` — what actually happened — and never
 * from the plan. Rendering the plan is what let this job report a clean sweep
 * it had not performed: `deleteRef`'s `{outcome:"failed"}` went to stdout only,
 * so the step summary claimed success while the refs were still on the remote.
 * A planned deletion with no matching outcome is reported as not attempted
 * rather than silently omitted.
 *
 * @param {{toDelete: Array<object>, retained: Array<object>}} plan
 * @param {boolean} dryRun
 * @param {Array<{name:string, outcome:string, error?:string}>} [outcomes]
 * @returns {string}
 */
export function formatSweepSummary(plan, dryRun, outcomes = []) {
  const byName = new Map(outcomes.map((result) => [result.name, result]));
  const failures = outcomes.filter((result) => result.outcome === "failed");

  const lines = [
    "=== Visual diff ref sweep ===",
    `Mode: ${dryRun ? "DRY RUN" : "LIVE"}`,
    `Refs seen: ${plan.toDelete.length + plan.retained.length}`,
    `Eligible for deletion: ${plan.toDelete.length}`,
  ];
  if (!dryRun) lines.push(`Failed deletions: ${failures.length}`);
  lines.push("");

  for (const ref of plan.toDelete) {
    if (dryRun) {
      lines.push(`[DRY RUN] Would delete: ${ref.name} (${ref.reason})`);
      continue;
    }
    const result = byName.get(ref.name);
    if (result === undefined) {
      lines.push(`NOT ATTEMPTED: ${ref.name} (${ref.reason})`);
    } else if (result.outcome === "failed") {
      lines.push(`FAILED to delete: ${ref.name} (${ref.reason}) — ${result.error ?? "no detail"}`);
    } else if (result.outcome === "already-absent") {
      lines.push(`Already absent: ${ref.name} (${ref.reason})`);
    } else {
      lines.push(`Deleted: ${ref.name} (${ref.reason})`);
    }
  }

  for (const ref of plan.retained) {
    lines.push(`Keeping: ${ref.name} (${ref.reason})`);
  }
  return lines.join("\n");
}

/**
 * Pure: the process exit code for one sweep's outcomes.
 *
 * Non-zero on any failed deletion. A sweep that cannot delete is the unbounded
 * growth this whole module exists to prevent, and a job that reports success
 * for it is worse than one that never ran: nothing would ever look again.
 *
 * @param {Array<{outcome:string}>} outcomes
 * @returns {number}
 */
export function sweepExitCode(outcomes) {
  return outcomes.some((result) => result.outcome === "failed") ? 1 : 0;
}

/** @returns {number} the process exit code. */
function main() {
  const dryRun = resolveDryRun();
  const repo = process.env.GITHUB_REPOSITORY;

  const refs = listRemoteRefs().map((ref) => ({ ...ref, committedAt: commitDate(repo, ref.sha) }));
  const plan = planRefSweep({ refs, openPrNumbers: listOpenPrNumbers(), now: new Date() });

  // Delete FIRST, then report — the summary is a record of what happened, and
  // the two must not be able to disagree.
  const outcomes = dryRun ? [] : plan.toDelete.map((ref) => deleteRef(ref.name));

  const verdict = formatSweepSummary(plan, dryRun, outcomes);
  console.log(verdict);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, `\n\`\`\`\n${verdict}\n\`\`\`\n`);
  }

  return sweepExitCode(outcomes);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`[visual-diff-refs] Error: ${err.message}`);
    process.exitCode = 1;
  }
}
