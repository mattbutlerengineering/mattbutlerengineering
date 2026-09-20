#!/usr/bin/env node

/**
 * summarize-task-failure.mjs — extract the *diagnostic* lines from a failed
 * `turbo run <task>` transcript (#5517).
 *
 * `nightly-compliance.yml` reports a failed `pnpm lint|typecheck|test` by
 * quoting `tail -10` of the captured output. For turbo that is structurally
 * incapable of naming what broke: turbo prints each package's own failure
 * detail as it streams, then its own run summary last, so the final ten
 * lines are always `Tasks: N successful, M total` / `Failed: <pkg>#task` and
 * never the failing test.
 *
 * The cost was measured, not theorised. Every nightly issue from #5203
 * (2026-09-10) through #5517 (2026-09-20) reported `pnpm test` FAILED, and
 * not one of them named a test — so each was triaged from the package name
 * alone. The resulting fixes were all timeout guesses (#4956 testTimeout,
 * the later hookTimeout bump, #5510's rialto-web 15s), and the failure
 * simply moved: `packages/rialto` on 09-10/09-11, `apps/rialto-web` for the
 * eight nights after, back to `packages/rialto` on 09-20. Ten consecutive
 * red nights, ten issues, zero evidence.
 *
 * A report that renders as informative while carrying nothing actionable is
 * the same defect class this workflow has already been bitten by twice —
 * see its own inline comments on the `bash -e` abort that deleted the FAILED
 * branch for months, and the `.js`-only glob that skipped 14 gating scripts
 * for the workflow's whole life. This is the third instance.
 *
 * The fallback is deliberate: when no failure marker is found, this returns
 * exactly the tail it replaced, so the report can never come out *worse*
 * than it is today for an output shape not anticipated here.
 *
 * Usage:
 *   node scripts/summarize-task-failure.mjs /tmp/test.out
 *   printf '%s' "$OUTPUT" | node scripts/summarize-task-failure.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Default number of trailing lines to fall back to — matches the `tail -10` this replaces. */
export const DEFAULT_TAIL_LINES = 10;

/** Default cap on summary length, so a suite with 200 failures can't flood a GitHub issue body. */
export const DEFAULT_MAX_LINES = 40;

/**
 * Turbo's per-line prefix, stripped before matching so the markers below work
 * on raw vitest output and on turbo's equally.
 *
 * Turbo writes it two different ways in one transcript and both have to be
 * handled: streamed task output is prefixed `<pkg>:<task>: ` (colon), while
 * the run summary names the failure `Failed:    <pkg>#<task>` (hash). Matching
 * only the hash form — as the first cut of this module did — silently misses
 * every streamed line, which is where the failing test name actually is.
 */
const TURBO_PREFIX = /^\s*[^\s:#]+[#:][^\s:#]+:\s?/;

/**
 * SGR colour escapes. Vitest writes them even when stdout is redirected to a
 * file, so every marker below has to match *through* them — the first cut of
 * this module did not, and silently matched only the one failure line that
 * happened to be uncoloured. Stripping is applied to the emitted lines too:
 * the report is read as GitHub-flavoured markdown, where raw escapes are
 * noise.
 */
// eslint-disable-next-line no-control-regex
const ANSI_SGR = /\u001b\[[0-9;]*m/g;

/**
 * Remove colour escapes and turbo's per-line package prefix.
 *
 * @param {string} line
 * @returns {string}
 */
export function normalizeLine(line) {
  return line.replace(ANSI_SGR, "").replace(TURBO_PREFIX, "");
}

/**
 * Lines worth quoting, in the order a reader wants them. Each entry is a
 * marker for one kind of evidence; `label` exists only to make the unit
 * tests read clearly.
 */
const FAILURE_MARKERS = [
  { label: "vitest-failed-file", pattern: /^\s*(FAIL|❯)\s+\S+/ },
  { label: "vitest-failed-test", pattern: /^\s*×\s+\S/ },
  {
    label: "vitest-failure-detail",
    pattern: /^\s*(→|AssertionError|TypeError|ReferenceError|SyntaxError)\b/,
  },
  { label: "vitest-timeout", pattern: /\b(Test|Hook) timed out in \d+\s*ms\b/ },
  { label: "vitest-counts", pattern: /^\s*(Test Files|Tests)\s+\d+\s+failed/ },
  { label: "turbo-failed-task", pattern: /^\s*Failed:\s+\S+/ },
];

/**
 * Does this line carry failure evidence?
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isFailureLine(line) {
  const normalized = normalizeLine(line);
  return FAILURE_MARKERS.some(({ pattern }) => pattern.test(normalized));
}

/** The turbo package a streamed line belongs to, or `null` if it carries no prefix. */
function packageOf(line) {
  const match = line.replace(ANSI_SGR, "").match(/^\s*([^\s:#]+)[#:][^\s:#]+:\s/);
  return match ? match[1] : null;
}

/**
 * The packages turbo itself reports as failed.
 *
 * Needed because a marker alone is not proof of a failure: a *passing* test
 * that asserts on bad input legitimately prints `SyntaxError: …` to stderr,
 * and quoting that under "what failed" names an innocent package — the same
 * misleading-report defect this module exists to remove. Turbo's own verdict
 * is the authority on which packages failed; markers only locate the detail
 * inside them.
 *
 * @param {string[]|string} input the transcript, or its lines
 * @returns {Set<string>}
 */
export function failingPackages(input) {
  const lines = (Array.isArray(input) ? input : input.split("\n")).map((line) =>
    line.replace(ANSI_SGR, "")
  );
  const failed = new Set();
  for (const line of lines) {
    const summary = line.match(/^\s*Failed:\s+(\S+?)#\S+/);
    if (summary) failed.add(summary[1]);
    const streamed = line.match(/^\s*([^\s:#]+)#[^\s:#]+:\s+ERROR\s+command\b/);
    if (streamed) failed.add(streamed[1]);
  }
  return failed;
}

/**
 * Pull the diagnostic lines out of a captured `turbo run <task>` transcript.
 *
 * Returns the matched lines in source order, capped at `maxLines`. When
 * nothing matches — an output shape this module does not anticipate — it
 * returns the last `tailLines` lines instead, which is exactly the
 * behaviour it replaces.
 *
 * @param {string} output raw captured stdout+stderr
 * @param {{ tailLines?: number, maxLines?: number }} [options]
 * @returns {string[]}
 */
export function summarizeFailure(output, options = {}) {
  const { tailLines = DEFAULT_TAIL_LINES, maxLines = DEFAULT_MAX_LINES } = options;
  // Colour escapes are stripped for output, but turbo's `<pkg>#<task>: `
  // prefix is deliberately kept: with ~50 packages in one transcript it is
  // the only thing saying *which* package the failing test belongs to.
  const lines = output.split("\n").map((line) => line.replace(ANSI_SGR, ""));
  const failed = failingPackages(lines);

  // A prefixed line is kept only when turbo blamed its package. Unprefixed
  // lines (raw vitest output, turbo's own summary) are always eligible, so
  // this narrowing is inert on a single-package transcript.
  const blamed = (line) => {
    if (failed.size === 0) return true;
    const pkg = packageOf(line);
    return pkg === null || failed.has(pkg);
  };

  const matched = lines.filter((line) => line.trim() !== "" && blamed(line) && isFailureLine(line));

  if (matched.length === 0) {
    return lines.filter((line) => line.trim() !== "").slice(-tailLines);
  }
  if (matched.length <= maxLines) return matched;

  // Keep the head (the individual failures) and the tail (the counts and
  // turbo's own verdict) — dropping the tail would lose the totals, which
  // are the one part the old `tail -10` did reliably capture.
  const head = matched.slice(0, maxLines - tailLines);
  const tail = matched.slice(-tailLines);
  return [...head, `  … ${matched.length - maxLines} more failure lines omitted …`, ...tail];
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const path = process.argv[2];
  let raw = "";
  try {
    raw = path ? readFileSync(path, "utf8") : readFileSync(0, "utf8");
  } catch (error) {
    // Never fail the reporting step over a missing capture file — the step
    // it runs in exists to describe a failure, not to create a second one.
    // `process.stdout.write`, not `console.log`: this is a CLI emitting a
    // payload its caller pipes onward, not diagnostic logging.
    process.stdout.write(`(no output captured: ${error.message})\n`);
    process.exit(0);
  }
  process.stdout.write(`${summarizeFailure(raw).join("\n")}\n`);
}
