#!/usr/bin/env node

/**
 * visual-diff-refs.mjs — the ref namespace that carries visual-regression
 * diff images, plus the retention rule that bounds it.
 *
 * Every run of the `visual` job in `.github/workflows/rialto-web-e2e.yml`
 * that has images to show publishes them as ONE orphan commit on a ref only
 * that run names: `visual-diffs/pr-<N>/run-<run_id>`. Nothing ever
 * overwrites a ref, so there is no read-modify-write cycle and therefore no
 * lost-update race — concurrency is handled by not sharing state. `--force`
 * is never used and must not be introduced.
 *
 * The published comment addresses its images by **commit SHA**, never by ref
 * name, so the ref exists only to keep the commit reachable. That is what
 * makes retention the whole storage design: see `selectRefsToDelete`.
 *
 * Shaped after `scripts/branch-cleanup.mjs` — pure exported predicates, one
 * impure `main()`, unit tests over the predicates only
 * (`scripts/__tests__/visual-diff-refs.test.mjs`).
 */

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

const REF_NAME_PATTERN = new RegExp(`^${REF_PREFIX}/pr-(\\d+)/run-([0-9A-Za-z._-]+)$`);

/**
 * Pure: the ref name for one run's images.
 *
 * @param {{prNumber: number|string, runId: number|string}} input
 * @returns {string} e.g. `visual-diffs/pr-4567/run-32873184619`
 */
export function buildRefName({ prNumber, runId }) {
  return `${REF_PREFIX}/pr-${prNumber}/run-${runId}`;
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
 * @param {unknown} refName
 * @returns {{prNumber: number, runId: string} | null}
 */
export function parseRefName(refName) {
  if (typeof refName !== "string") return null;
  const match = REF_NAME_PATTERN.exec(refName);
  if (!match) return null;
  return { prNumber: Number(match[1]), runId: match[2] };
}
