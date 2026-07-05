#!/usr/bin/env node
/**
 * orchestrate.mjs — multi-agent orchestration entrypoint (ACMM L6).
 *
 * WHY THIS EXISTS — composing single agents into one autonomous system:
 * A single implement-queue worker can only make so much progress on its own.
 * L6 autonomy is reached when a *dispatcher* decomposes one body of work into
 * independent sub-tasks and runs several agents in parallel — one fixes a bug
 * while another writes the test and a third updates the docs.
 *
 * This module is that dispatcher. It does NOT reinvent the repo's dispatch
 * primitives; it COMPOSES them:
 *   - `zoneForPaths`      (merge-train-lock.mjs)  → which tasks conflict, so
 *                                                    they must be serialized
 *                                                    across waves rather than
 *                                                    run together.
 *   - `canDispatchWorkers`(worker-dispatch.mjs)   → whether there is capacity
 *                                                    to dispatch right now, and
 *                                                    how many parallel slots.
 *   - `appendTelemetryRow`(collect-queue-telemetry.mjs) → record each dispatch
 *                                                    (optional / injected).
 *
 * The core planner (`planWaves`) is a pure, dependency-injected function so it
 * is exhaustively testable without spawning anything. The side-effecting
 * `orchestrate` runner takes an injectable `dispatch` function; the default
 * documents exactly how a real sub-agent spawn would occur (see
 * {@link defaultDispatch}) without performing side effects.
 *
 * Public API:
 *   planWaves(opts)            → { waves, gate, deferred, slotsPerWave }
 *   orchestrate(opts)          → Promise<{ plan, dispatched, waves }>
 *   deriveTaskZone(task, fn?)  → string | null
 *   zonesConflict(a, b)        → boolean
 *   taskTelemetryRow(task, ms) → telemetry row (queue-telemetry schema)
 *   defaultTelemetryRecorder(opts?) → (row) => { written, reason? }
 *   issueToTask(issue)         → task descriptor
 *   extractPaths(body)         → string[]
 *
 * CLI:
 *   node scripts/orchestrate.mjs [--telemetry] [--dispatch]
 *     Reads open `ready` issues, counts open `in-progress` issues as the
 *     active-worker load, plans the parallel dispatch waves, and prints the
 *     plan. `--telemetry` records a claim row per dispatched issue; `--dispatch`
 *     is reserved for wiring a real spawner (the default documents the command).
 *
 * @module orchestrate
 */

import { canDispatchWorkers, MAX_CONCURRENT_WORKERS } from "./worker-dispatch.mjs";
import { zoneForPaths } from "./merge-train-lock.mjs";
import { appendTelemetryRow } from "./collect-queue-telemetry.mjs";
import { createGhClient } from "@mbe/gh-client";

/** `gh issue list --json` fields required to build task descriptors. */
export const READY_ISSUE_FIELDS = "number,title,body,labels";

// ---------------------------------------------------------------------------
// Zone resolution — reuses zoneForPaths to decide which tasks may run together
// ---------------------------------------------------------------------------

/**
 * Resolves a task's merge zone.
 *
 * An explicit `task.zone` (including `null`) always wins; otherwise the zone is
 * derived from `task.paths` via {@link zoneForPaths}. A `null` zone means the
 * task is cross-cutting (spans multiple zones, or its paths are unknown) and so
 * would take the GLOBAL merge-train lock — it must never share a wave.
 *
 * @param {{zone?: string|null, paths?: string[]}} task
 * @param {(paths: string[]) => string|null} [deriveZone] - injectable for tests
 * @returns {string|null}
 */
export function deriveTaskZone(task, deriveZone = zoneForPaths) {
  if (task && Object.prototype.hasOwnProperty.call(task, "zone")) {
    return task.zone;
  }
  return deriveZone(task?.paths ?? []);
}

/**
 * True when two zones cannot run in the same parallel wave.
 *
 * Mirrors the merge-train collision rule: a `null` zone is cross-cutting (global
 * lock) and conflicts with everything; two equal zones contend for the same
 * per-zone lock and must be serialized. Distinct non-null zones are independent.
 *
 * @param {string|null} a
 * @param {string|null} b
 * @returns {boolean}
 */
export function zonesConflict(a, b) {
  if (a === null || b === null) return true;
  return a === b;
}

// ---------------------------------------------------------------------------
// planWaves — pure decomposition into independent parallel waves
// ---------------------------------------------------------------------------

/**
 * Decomposes a set of tasks into ordered parallel *waves*.
 *
 * Within a wave every task runs concurrently; waves are barriers (wave N+1
 * starts only after wave N completes). Two invariants shape the plan:
 *
 *   1. Zone independence — no two tasks in a wave conflict (see
 *      {@link zonesConflict}), so a wave's PRs never contend for the same
 *      merge-train lock. Conflicting tasks spill into later waves.
 *   2. Capacity — no wave exceeds the free worker slots. Dispatch is gated by
 *      {@link canDispatchWorkers}: if the queue is already at capacity the plan
 *      is empty and every task is deferred; otherwise `slotsPerWave` is the
 *      number of free slots (`maxWorkers - activeWorkers`, at least 1).
 *
 * Pure and deterministic — no I/O, input is never mutated.
 *
 * @param {object} [opts]
 * @param {Array<{id?: string, issueNumber?: number, zone?: string|null, paths?: string[], labels?: string[], title?: string}>} [opts.tasks]
 * @param {number} [opts.activeWorkers] - workers already running (default 0)
 * @param {number} [opts.maxWorkers]    - dispatch ceiling (default MAX_CONCURRENT_WORKERS)
 * @param {(o: {activeWorkers: number, maxWorkers: number}) => {allowed: boolean, reason: string}} [opts.canDispatch]
 * @param {(paths: string[]) => string|null} [opts.deriveZone]
 * @returns {{waves: Array<Array<object>>, gate: {allowed: boolean, reason: string}, deferred: object[], slotsPerWave: number}}
 */
export function planWaves({
  tasks = [],
  activeWorkers = 0,
  maxWorkers = MAX_CONCURRENT_WORKERS,
  canDispatch = canDispatchWorkers,
  deriveZone = zoneForPaths,
} = {}) {
  const enriched = tasks.map((task) => ({ ...task, zone: deriveTaskZone(task, deriveZone) }));

  const gate = canDispatch({ activeWorkers, maxWorkers });
  if (!gate.allowed) {
    // At capacity: dispatch nothing now, defer the whole set.
    return { waves: [], gate, deferred: enriched, slotsPerWave: 0 };
  }

  // gate.allowed guarantees activeWorkers < maxWorkers, so this is >= 1.
  const slotsPerWave = Math.max(1, maxWorkers - activeWorkers);

  /** @type {Array<Array<object>>} */
  const waves = [];
  for (const task of enriched) {
    let placed = false;
    for (const wave of waves) {
      const hasRoom = wave.length < slotsPerWave;
      const conflicts = wave.some((t) => zonesConflict(t.zone, task.zone));
      if (hasRoom && !conflicts) {
        wave.push(task);
        placed = true;
        break;
      }
    }
    if (!placed) waves.push([task]);
  }

  return { waves, gate, deferred: [], slotsPerWave };
}

// ---------------------------------------------------------------------------
// Telemetry — optional composition of appendTelemetryRow
// ---------------------------------------------------------------------------

/**
 * Builds a queue-telemetry row recording that a task was claimed for dispatch.
 * Shaped to the permitted schema in collect-queue-telemetry.mjs (issue_number
 * required; labels optional).
 *
 * @param {{issueNumber: number, labels?: string[]}} task
 * @param {number} nowMs - claim timestamp in ms (injected for determinism)
 * @returns {{issue_number: number, claimed_at: string, labels?: string[]}}
 */
export function taskTelemetryRow(task, nowMs) {
  const row = {
    issue_number: task.issueNumber,
    claimed_at: new Date(nowMs).toISOString(),
  };
  if (Array.isArray(task.labels) && task.labels.length > 0) {
    row.labels = task.labels;
  }
  return row;
}

/**
 * Returns a recorder that persists an orchestration telemetry row via
 * {@link appendTelemetryRow}. `telemetryOpts` are forwarded to
 * appendTelemetryRow (e.g. `filePath`, `readFile`, `writeFile`) so the recorder
 * is testable without touching the real sink.
 *
 * @param {object} [telemetryOpts] - forwarded to appendTelemetryRow
 * @returns {(row: object) => {written: boolean, reason?: string}}
 */
export function defaultTelemetryRecorder(telemetryOpts = {}) {
  return (row) => appendTelemetryRow(row, telemetryOpts);
}

// ---------------------------------------------------------------------------
// dispatch — default is documented and side-effect-free
// ---------------------------------------------------------------------------

/**
 * Default sub-agent dispatcher. It DOCUMENTS how a real spawn would occur
 * without performing side effects, so an orchestration can be planned and
 * dry-dispatched safely from CI or a scheduled job.
 *
 * A production deployment injects its own `dispatch` that either triggers the
 * `agent-task` workflow per task, e.g.:
 *
 *   gh workflow run agent-task.yml \
 *     -f task="<issue title / body>" \
 *     -f model=claude-sonnet-4-6 \
 *     -f max_budget=1.00
 *
 * ...or spawns an in-process Task sub-agent. The orchestrator only requires
 * that `dispatch(task, ctx)` returns (or resolves to) a descriptor.
 *
 * @param {{id?: string, title?: string, issueNumber?: number, zone?: string|null}} task
 * @param {{wave: number}} ctx
 * @returns {{id: string, zone: string|null, wave: number, dispatched: false, mode: "documented", command: string}}
 */
export function defaultDispatch(task, ctx) {
  const id = task.id ?? (task.issueNumber != null ? `issue-${task.issueNumber}` : "task");
  const subject = task.title ?? id;
  const command = `gh workflow run agent-task.yml -f task=${JSON.stringify(subject)}`;
  return {
    id,
    zone: task.zone ?? null,
    wave: ctx.wave,
    dispatched: false,
    mode: "documented",
    command,
  };
}

// ---------------------------------------------------------------------------
// orchestrate — plan then dispatch wave-by-wave
// ---------------------------------------------------------------------------

/**
 * Plans the dispatch waves and then dispatches them.
 *
 * Each wave is dispatched concurrently (`Promise.all`); the runner awaits the
 * whole wave before starting the next — the barrier that makes the plan safe
 * against merge-train conflicts. When a `recordTelemetry` recorder is supplied,
 * one claim row per dispatched issue is recorded.
 *
 * @param {object} [opts]
 * @param {object[]} [opts.tasks]
 * @param {number} [opts.activeWorkers]
 * @param {number} [opts.maxWorkers]
 * @param {(task: object, ctx: {wave: number}) => unknown} [opts.dispatch]
 * @param {((row: object) => unknown) | null} [opts.recordTelemetry] - optional
 * @param {(o: object) => {allowed: boolean, reason: string}} [opts.canDispatch]
 * @param {(paths: string[]) => string|null} [opts.deriveZone]
 * @param {() => number} [opts.now] - clock injection (default Date.now)
 * @param {(msg: string) => void} [opts.log]
 * @returns {Promise<{plan: object, dispatched: object[], waves: unknown[][]}>}
 */
export async function orchestrate({
  tasks = [],
  activeWorkers = 0,
  maxWorkers = MAX_CONCURRENT_WORKERS,
  dispatch = defaultDispatch,
  recordTelemetry = null,
  canDispatch = canDispatchWorkers,
  deriveZone = zoneForPaths,
  now = () => Date.now(),
  log = () => {},
} = {}) {
  const plan = planWaves({ tasks, activeWorkers, maxWorkers, canDispatch, deriveZone });

  if (!plan.gate.allowed) {
    log(`dispatch blocked (${plan.gate.reason}); ${plan.deferred.length} task(s) deferred`);
    return { plan, dispatched: [], waves: [] };
  }

  const dispatched = [];
  const waves = [];
  for (let i = 0; i < plan.waves.length; i++) {
    const wave = plan.waves[i];
    log(`wave ${i + 1}/${plan.waves.length}: dispatching ${wave.length} task(s) in parallel`);

    // Barrier: the whole wave runs concurrently; the next wave waits for it.
    const results = await Promise.all(wave.map((task) => dispatch(task, { wave: i })));

    for (const task of wave) {
      if (recordTelemetry && typeof task.issueNumber === "number") {
        recordTelemetry(taskTelemetryRow(task, now()));
      }
      dispatched.push(task);
    }
    waves.push(results);
  }

  return { plan, dispatched, waves };
}

// ---------------------------------------------------------------------------
// Issue → task descriptor (CLI input mapping)
// ---------------------------------------------------------------------------

// A backtick-quoted, path-like token: a run of path-safe characters (word
// chars, dots, dashes, @) containing at least one slash. Captures both files
// (`scripts/orchestrate.mjs`) and bare directories (`orchestrator/`), while
// ignoring plain single-word backtick spans.
const PATH_TOKEN_RE = /`([\w.@-]+(?:\/[\w.@-]*)+)`/g;

/**
 * Extracts repo-relative paths mentioned (in backticks) in an issue body.
 * Audit / ACMM issues routinely name the files they concern, which lets
 * {@link zoneForPaths} derive the task's merge zone. Returns a de-duplicated
 * list; an empty list means the zone is unknown (→ cross-cutting).
 *
 * @param {string} body
 * @returns {string[]}
 */
export function extractPaths(body) {
  if (typeof body !== "string" || body.length === 0) return [];
  const found = new Set();
  for (const match of body.matchAll(PATH_TOKEN_RE)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Normalizes `gh issue list` labels (`["x"]` or `[{name:"x"}]`) to string[].
 *
 * @param {Array<string | {name?: string}>} [labels]
 * @returns {string[]}
 */
export function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((l) => (typeof l === "string" ? l : l?.name))
    .filter((l) => typeof l === "string" && l.length > 0);
}

/**
 * Converts a `gh issue list --json` record into an orchestrator task descriptor.
 * The zone is left implicit (derived later from `paths` by {@link planWaves}).
 *
 * @param {{number: number, title?: string, body?: string, labels?: Array}} issue
 * @returns {{id: string, issueNumber: number, title: string, paths: string[], labels: string[]}}
 */
export function issueToTask(issue) {
  return {
    id: `issue-${issue.number}`,
    issueNumber: issue.number,
    title: issue.title ?? `#${issue.number}`,
    paths: extractPaths(issue.body ?? ""),
    labels: normalizeLabels(issue.labels),
  };
}

/**
 * Builds a compact, printable summary of an orchestration result.
 *
 * @param {{plan: object, dispatched: object[]}} result
 * @returns {object}
 */
export function summarize(result) {
  const { plan, dispatched } = result;
  return {
    blocked: !plan.gate.allowed,
    gate: plan.gate,
    slotsPerWave: plan.slotsPerWave,
    waveCount: plan.waves.length,
    dispatchedCount: dispatched.length,
    deferredCount: plan.deferred.length,
    waves: plan.waves.map((wave, i) => ({
      wave: i + 1,
      tasks: wave.map((t) => ({ id: t.id, zone: t.zone })),
    })),
  };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

/** CLI entry: reads `ready` issues via gh, plans and (dry-)dispatches waves. */
async function main() {
  const args = process.argv.slice(2);
  const withTelemetry = args.includes("--telemetry");

  const gh = createGhClient({ timeoutMs: 30_000 });
  const ready = gh.issue.list(["--label", "ready", "--state", "open", "--json", READY_ISSUE_FIELDS]);
  const inProgress = gh.issue.list(["--label", "in-progress", "--state", "open", "--json", "number"]);

  const tasks = ready.map(issueToTask);
  const activeWorkers = inProgress.length;

  const result = await orchestrate({
    tasks,
    activeWorkers,
    recordTelemetry: withTelemetry ? defaultTelemetryRecorder() : null,
    log: (msg) => console.log(`[orchestrate] ${msg}`),
  });

  console.log(JSON.stringify(summarize(result), null, 2));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[orchestrate] Error: ${err.message}\n`);
    process.exit(1);
  });
}
