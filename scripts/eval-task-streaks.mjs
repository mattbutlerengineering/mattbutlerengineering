#!/usr/bin/env node
/**
 * Per-task failure streaks over the eval history (`.metrics-data/eval-reports.jsonl`).
 *
 * The weekly checkpoint alarms on a suite-score delta, which cannot see a task
 * that fails every run: a constant never regresses (#10139). This reads the
 * recorded history only — it never runs the (paid) eval suite.
 *
 * Usage: node scripts/eval-task-streaks.mjs [path-to-eval-reports.jsonl]
 * Exit 0 = healthy, 1 = a task is on a failure streak, 2 = undeterminable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Consecutive recorded failing runs after which a task is reported. */
export const STREAK_THRESHOLD = 3;

const DEFAULT_HISTORY = ".metrics-data/eval-reports.jsonl";

/** Dedupe key for the per-task issue: the task id only, never a run id or timestamp. */
export const streakDedupeKey = (taskId) => `eval-task-streak:${taskId}`;

/**
 * Parses JSONL into entries; unparseable lines are counted, not dropped silently.
 * `newestMalformed` is true when the LAST non-blank line is unparseable (a write
 * cut mid-line): the newest run decides the verdict, so that must fail closed.
 */
export function parseEvalHistory(text) {
  const entries = [];
  let malformed = 0;
  let newestMalformed = false;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      entries.push(JSON.parse(line));
      newestMalformed = false;
    } catch {
      malformed += 1;
      newestMalformed = true;
    }
  }
  return { entries, malformed, newestMalformed };
}

/**
 * Same rule as `taskDidNotRun()` in packages/agent-core/src/eval/run-detection.ts
 * (copied: this script cannot import the compiled TS package): no turns and no
 * cost means the agent never ran.
 */
const didNotRun = (task) => task.turns === 0 && task.costUsd === 0;

/**
 * The task's verdict in one run: true/false when it was really judged, null when
 * there is no verdict (no boolean `passed`, a non-run, or the LLM judge threw,
 * `judgeResult.evaluationFailed` as in `suiteJudgeUnavailable()`). The harness
 * records both of the latter as `passed: false`, which is not a judged failure.
 */
function judgedOutcome(task) {
  if (typeof task.passed !== "boolean") return null;
  if (didNotRun(task) || task.judgeResult?.evaluationFailed === true) return null;
  return task.passed;
}

/**
 * Rows oldest first. A row without a parseable timestamp keeps its file position
 * relative to its neighbours (it inherits the previous row's time); the sort is stable.
 */
function chronological(entries) {
  let previous = Number.NEGATIVE_INFINITY;
  return entries
    .map((entry) => {
      const parsed = Date.parse(entry.timestamp ?? "");
      previous = Number.isNaN(parsed) ? previous : parsed;
      return { entry, time: previous };
    })
    .sort((a, b) => a.time - b.time)
    .map(({ entry }) => entry);
}

/** Length of the trailing run of `false` outcomes; `null` (no verdict) is skipped by the caller. */
function trailingFailures(outcomes) {
  let streak = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === false; i--) streak += 1;
  return streak;
}

/**
 * Pure verdict over parsed history. Fails closed: no usable row is
 * `undeterminable`, never `ok`. Only tasks present in the latest row are
 * judged, so a removed task cannot alarm forever.
 * @param {Array<{ timestamp?: string, tasks?: Array<{ taskId: string, passed: boolean }> }>} entries
 * @param {{ threshold?: number }} [options]
 */
export function classifyTaskStreaks(entries, { threshold = STREAK_THRESHOLD } = {}) {
  const usable = chronological(
    entries.filter((e) => Array.isArray(e?.tasks) && e.tasks.length > 0)
  );
  if (usable.length === 0) {
    return { status: "undeterminable", reason: "no eval history rows with tasks", alarms: [] };
  }
  const latest = usable[usable.length - 1];
  const alarms = latest.tasks.flatMap(({ taskId }) => {
    const outcomes = usable.flatMap((e) => {
      const found = e.tasks.find((t) => t.taskId === taskId);
      const outcome = found ? judgedOutcome(found) : null;
      return outcome === null ? [] : [outcome];
    });
    const streak = trailingFailures(outcomes);
    return streak >= threshold
      ? [
          {
            taskId,
            streak,
            dedupeKey: streakDedupeKey(taskId),
            title: `ci-fix: eval task ${taskId} has failed ${threshold}+ consecutive runs`,
          },
        ]
      : [];
  });
  return { status: alarms.length > 0 ? "alarm" : "ok", reason: "", alarms };
}

/** Parse and classify raw JSONL; a truncated newest line is undeterminable, never ok. */
export function classifyEvalHistory(text, options) {
  const { entries, malformed, newestMalformed } = parseEvalHistory(text);
  if (newestMalformed) {
    return {
      status: "undeterminable",
      reason: "the newest history line is unparseable (truncated write?)",
      alarms: [],
      malformed,
    };
  }
  return { ...classifyTaskStreaks(entries, options), malformed };
}

function main(argv) {
  const path = argv[2] ?? DEFAULT_HISTORY;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ status: "undeterminable", reason: `cannot read ${path}: ${err.message}` }) +
        "\n"
    );
    process.exitCode = 2;
    return;
  }
  const verdict = classifyEvalHistory(text);
  process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
  process.exitCode = { ok: 0, alarm: 1, undeterminable: 2 }[verdict.status];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv);
}
