#!/usr/bin/env node

/**
 * Paired-growth check for the agent spend sink (#4618).
 *
 * `.claude/agent-spend/sessions.jsonl` and `metrics/queue-telemetry.jsonl`
 * describe the same agent work from opposite ends — what it cost and what it
 * produced — so the sibling gaining rows while the spend sink gains none is
 * the signal that spend recording went silent. That is the invariant #4618
 * asked for, and it is asserted here.
 *
 * ## Why the `uninstrumented` state exists, and why it is the load-bearing part
 *
 * #4618 is the FOURTH report of "sessions.jsonl is empty" (#1830 → #2974 →
 * #3695 → #4618). Measured at `origin/main` on 2026-09-20:
 *
 *   - `.claude/agent-spend/sessions.jsonl`: 0 bytes / 0 rows, last touched by
 *     `1f98ee8c5` on 2026-05-08 — four and a half months, not the four days
 *     the issue estimated.
 *   - `metrics/queue-telemetry.jsonl`: 476 rows, newest `claimed_at`
 *     2026-09-20T05:16:12Z.
 *
 * The write path is NOT broken. `recordSpend` (packages/agent-core/src/
 * spend-recorder.ts) is a plain `appendFileSync` after an `mkdirSync`, with no
 * swallowed error of its own, and it has exactly two call sites — both inside
 * `@mbe/agent-core` (`session-runner.ts:166`, `adapters/
 * run-cli-adapter-session.ts:223`). It is simply never reached: every
 * automated entry point that could start an agent-core session gates on
 * `ANTHROPIC_API_KEY`, which is not a configured repo secret, and the work
 * that actually produces the PRs is done by Claude Code subagents that never
 * enter agent-core at all. The third writer, `scripts/log-agent-cost.js`, is
 * reachable only through the manual `pnpm log:cost` script.
 *
 * So the naive form of the check — "sibling grew, spend did not, therefore
 * regression" — would file that same wrong report every single day. Splitting
 * `stalled` (a writer could have run and produced nothing) from
 * `uninstrumented` (no writer could run at all) is what makes the detector
 * report the real condition instead of a fifth near-duplicate of a bug that
 * was never there.
 *
 * ## Why `uninstrumented` passes (#5627)
 *
 * #3585 was decided as Option A, local-only: `ClaudeCliAdapter` (#5670) lets
 * a local `mbe agent run --adapter claude-cli` reach `recordSpend` on the Max
 * subscription with no key (verified live 2026-09-22 — a real row landed),
 * while CI deliberately gets no writer. So `uninstrumented` in CI is the
 * chosen design, not a defect or a pending decision, and failing on it only
 * refiled #5627 with nothing to fix. It passes; `stalled` still fails the
 * moment a key makes a CI writer reachable and it records nothing.
 *
 * ## Why this is not a `scripts/check-*.mjs` fitness check
 *
 * The `check-` prefix in this repo means "wired into `pnpm repo-audit`, reds
 * the build" (scripts/__tests__/check-fitness-check-wiring.test.mjs). This
 * must not gate `main`: today's state is `uninstrumented`, unfixable by any PR
 * author, and resolvable only by a human setting a secret — exactly the shape
 * `scripts/metrics-freshness.mjs` documents for `DOMAIN_METRICS_VENUE_ID`. It
 * reports through `.github/workflows/metrics-collectors.yml`, which turns a
 * non-zero verdict into a deduped issue rather than a red workflow.
 *
 * ## Fail-closed
 *
 * `healthy`, `idle` and `uninstrumented` are the only passing states. A missing or unreadable
 * file, a non-array payload, rows nothing can date, and a reader that throws
 * all land on `undeterminable`, which fails — an absence that cannot be
 * explained is never reported as health.
 *
 * Usage:
 *   node scripts/agent-spend-telemetry.mjs           # human-readable line
 *   node scripts/agent-spend-telemetry.mjs --json    # machine-readable verdict
 * Exit code: 0 when the invariant holds (or is vacuous), 1 otherwise — in both
 * modes.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { read } from "./metrics-store.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MS_PER_HOUR = 60 * 60 * 1000;

/** The spend sink, which lives outside `metrics/` and so has no store entry. */
export const SPEND_SINK_PATH = join(ROOT, ".claude", "agent-spend", "sessions.jsonl");

/** Logical name of the sibling metric, resolved through the metrics store. */
export const SIBLING_METRIC = "queue-telemetry";

/**
 * Timestamp fields tried in order on a spend row, per `SpendEntry` in
 * packages/agent-core/src/spend-recorder.ts. `timestamp` is the full ISO
 * stamp; `date` is the YYYY-MM-DD fallback older rows may carry alone.
 */
export const SPEND_TIMESTAMP_FIELDS = ["timestamp", "date"];

/**
 * Timestamp fields tried in order on a queue-telemetry row. `claimed_at` is
 * stamped when the row is appended; `merged_at` is backfilled later by
 * scripts/reconcile-queue-telemetry.mjs and covers rows written before the
 * `claimed_at` field existed.
 */
export const SIBLING_TIMESTAMP_FIELDS = ["claimed_at", "merged_at"];

/**
 * The env var every automated agent-core entry point gates on, and the one
 * `ClaudeAdapter.isAvailable()` checks (packages/agent-core/src/adapters/
 * claude-adapter.ts:41). Its absence means no automated run can reach
 * `recordSpend`, so an empty sink is expected rather than broken.
 *
 * Known limitation: the gemini/opencode CLI-subprocess adapters have their own
 * credentials, so in principle a run could record spend without this key. No
 * automated entry point reaches them without passing this gate first, so
 * treating it as the reachability signal is accurate for the scheduled paths
 * this check watches — and it errs toward `stalled` (the louder state), never
 * toward a false pass.
 */
export const PROVIDER_KEY_ENV = "ANTHROPIC_API_KEY";

/** Default window: the 24h the issue's recommendation 2 names. */
export const DEFAULT_WINDOW_HOURS = 24;

/** The states that count as the invariant holding. */
export const PASSING_STATES = new Set(["healthy", "idle", "uninstrumented"]);

// ---------------------------------------------------------------------------
// Pure logic — no side effects below this section boundary comment.
// ---------------------------------------------------------------------------

/**
 * Pure: how many rows fall inside the window.
 *
 * Returns `null` — undeterminable, not zero — whenever the answer cannot be
 * established: a non-array payload (missing file, corrupt read), or rows that
 * exist but carry no parseable timestamp in any of `timestampFields`. An empty
 * array IS determinable: a file with no rows demonstrably gained none.
 *
 * Only a lower bound is applied. These are append-only logs of past events; a
 * future-dated row would be a different defect, and excluding it would make a
 * fresh file read as idle.
 *
 * @param {unknown} rows
 * @param {{ timestampFields: readonly string[], windowStartMs: number }} opts
 * @returns {number|null}
 */
export function countRowsInWindow(rows, { timestampFields, windowStartMs }) {
  if (!Array.isArray(rows)) return null;
  if (rows.length === 0) return 0;

  let dated = 0;
  let inWindow = 0;
  for (const row of rows) {
    const ms = rowTimestampMs(row, timestampFields);
    if (ms === null) continue;
    dated += 1;
    if (ms >= windowStartMs) inWindow += 1;
  }

  // Rows we cannot date are rows we cannot judge — never report 0 growth on
  // a file whose contents are opaque.
  return dated === 0 ? null : inWindow;
}

/**
 * Pure: epoch ms of the first parseable timestamp field on a row, or null.
 * Internal to `countRowsInWindow`, which its tests cover it through.
 *
 * @param {unknown} row
 * @param {readonly string[]} timestampFields
 * @returns {number|null}
 */
function rowTimestampMs(row, timestampFields) {
  if (!row || typeof row !== "object") return null;
  for (const field of timestampFields) {
    const raw = /** @type {Record<string, unknown>} */ (row)[field];
    if (typeof raw !== "string") continue;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Pure: the decision. Given how many rows each file gained in the window and
 * whether a spend writer could have run at all, classify the invariant.
 *
 * Evaluation order is deliberate:
 *   1. any unknown input           → `undeterminable` (fails closed)
 *   2. spend rows recorded         → `healthy` (rows on disk outrank any
 *                                    inference about reachability)
 *   3. no writer could have run    → `uninstrumented` (dead, not regressed)
 *   4. the sibling did not grow    → `idle` (the conditional is vacuous)
 *   5. otherwise                   → `stalled` (the real regression)
 *
 * @param {{ spendRowsInWindow: unknown, siblingRowsInWindow: unknown, writerReachable: unknown }} input
 * @returns {{ state: "healthy"|"idle"|"stalled"|"uninstrumented"|"undeterminable", ok: boolean, reason: string }}
 */
export function classifySpendTelemetry({
  spendRowsInWindow,
  siblingRowsInWindow,
  writerReachable,
}) {
  const unknown = [];
  if (!Number.isFinite(spendRowsInWindow)) unknown.push("spend row count");
  if (!Number.isFinite(siblingRowsInWindow)) unknown.push(`${SIBLING_METRIC} row count`);
  if (typeof writerReachable !== "boolean") unknown.push("writer reachability");
  if (unknown.length > 0) {
    return verdict(
      "undeterminable",
      `cannot determine ${unknown.join(" or ")} — failing closed rather than reporting health`
    );
  }

  if (spendRowsInWindow > 0) {
    return verdict(
      "healthy",
      `${spendRowsInWindow} spend row(s) recorded alongside ${siblingRowsInWindow} ${SIBLING_METRIC} row(s)`
    );
  }

  if (!writerReachable) {
    return verdict(
      "uninstrumented",
      `no spend writer runs here by design: ${PROVIDER_KEY_ENV} is unset, and #3585 chose ` +
        `local-only spend recording via \`mbe agent run --adapter claude-cli\`. ` +
        `0 rows is the expected output of this architecture, not a regression — see #5627`
    );
  }

  if (siblingRowsInWindow === 0) {
    return verdict("idle", `no ${SIBLING_METRIC} rows in the window either — nothing to attribute`);
  }

  return verdict(
    "stalled",
    `${siblingRowsInWindow} ${SIBLING_METRIC} row(s) in the window but 0 spend rows, ` +
      `while ${PROVIDER_KEY_ENV} is set — a writer could have run and recorded nothing`
  );
}

/**
 * @param {"healthy"|"idle"|"stalled"|"uninstrumented"|"undeterminable"} state
 * @param {string} reason
 */
function verdict(state, reason) {
  return { state, ok: PASSING_STATES.has(state), reason };
}

// ---------------------------------------------------------------------------
// Side-effecting readers and the thin wrapper.
// ---------------------------------------------------------------------------

/**
 * Side effect: parse the spend sink's JSONL rows, skipping malformed lines
 * (matching scripts/collect-agent-cost.mjs). A missing file returns `null` —
 * undeterminable — because an absent sink and an empty one are different
 * facts and only the second one proves nothing was written.
 *
 * @param {{ path?: string }} [opts]
 * @returns {unknown[]|null}
 */
export function readSpendSinkRows({ path = SPEND_SINK_PATH } = {}) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((row) => row !== null);
}

/**
 * Side effect: assess the real (or injected) files. Never throws — a reader
 * that fails yields `null` rows, which the classifier fails closed on.
 *
 * @param {{
 *   readSpendRows?: () => unknown,
 *   readSiblingRows?: () => unknown,
 *   windowHours?: number,
 *   now?: Date,
 *   env?: Record<string, string|undefined>,
 * }} [opts]
 * @returns {{ state: string, ok: boolean, reason: string, spendRowsInWindow: number|null, siblingRowsInWindow: number|null, windowHours: number, windowStart: string, writerReachable: boolean }}
 */
export function assessAgentSpendTelemetry({
  readSpendRows = () => readSpendSinkRows(),
  readSiblingRows = () => read(SIBLING_METRIC),
  windowHours = DEFAULT_WINDOW_HOURS,
  now = new Date(),
  env = process.env,
} = {}) {
  const windowStartMs = now.getTime() - windowHours * MS_PER_HOUR;
  const writerReachable = Boolean(env[PROVIDER_KEY_ENV]);

  const spendRowsInWindow = countRowsInWindow(tryRead(readSpendRows), {
    timestampFields: SPEND_TIMESTAMP_FIELDS,
    windowStartMs,
  });
  const siblingRowsInWindow = countRowsInWindow(tryRead(readSiblingRows), {
    timestampFields: SIBLING_TIMESTAMP_FIELDS,
    windowStartMs,
  });

  return {
    ...classifySpendTelemetry({ spendRowsInWindow, siblingRowsInWindow, writerReachable }),
    spendRowsInWindow,
    siblingRowsInWindow,
    writerReachable,
    windowHours,
    windowStart: new Date(windowStartMs).toISOString(),
  };
}

/**
 * Side effect: run a reader, turning any throw into `null` so the classifier
 * — not an exception — decides what an unreadable file means.
 *
 * @param {() => unknown} reader
 * @returns {unknown}
 */
function tryRead(reader) {
  try {
    return reader();
  } catch {
    return null;
  }
}

/**
 * One human-readable line for the verdict.
 *
 * @param {{ state: string, reason: string, spendRowsInWindow: number|null, siblingRowsInWindow: number|null, windowHours: number }} result
 * @returns {string}
 */
export function formatVerdict(result) {
  const count = (n) => (n === null ? "unknown" : String(n));
  return (
    `${result.state}: spend +${count(result.spendRowsInWindow)}, ` +
    `${SIBLING_METRIC} +${count(result.siblingRowsInWindow)} ` +
    `in the last ${result.windowHours}h — ${result.reason}`
  );
}

// ---------------------------------------------------------------------------
// CLI entry point.
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = assessAgentSpendTelemetry();

  if (process.argv.includes("--json")) {
    // Machine-readable output for metrics-collectors.yml, matching
    // `metrics-freshness.mjs --json`. `line` is the same text the human mode
    // prints, so the step summary need not re-derive it.
    process.stdout.write(
      `${JSON.stringify({ ...result, line: formatVerdict(result) }, null, 2)}\n`
    );
    process.exit(result.ok ? 0 : 1);
  }

  process.exit(
    runCheck({
      name: "agent-spend telemetry",
      findings: result.ok ? [] : [result],
      formatFinding: formatVerdict,
      passMessage: `PASS: agent-spend telemetry — ${formatVerdict(result)}`,
      failMessage: "FAIL: agent-spend telemetry — the paired-growth invariant does not hold:",
    })
  );
}
