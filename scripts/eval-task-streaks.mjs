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

/** Parses JSONL into entries; unparseable lines are counted, not dropped silently. */
export function parseEvalHistory(text) {
  const entries = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      malformed += 1;
    }
  }
  return { entries, malformed };
}

const stamp = (entry) => Date.parse(entry.timestamp ?? "") || 0;

/** Length of the trailing run of `passed === false` outcomes (oldest first). */
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
  const usable = entries
    .filter((e) => Array.isArray(e?.tasks) && e.tasks.length > 0)
    .sort((a, b) => stamp(a) - stamp(b));
  if (usable.length === 0) {
    return { status: "undeterminable", reason: "no eval history rows with tasks", alarms: [] };
  }
  const latest = usable[usable.length - 1];
  const alarms = latest.tasks.flatMap(({ taskId }) => {
    const outcomes = usable.flatMap((e) => {
      const task = e.tasks.find((t) => t.taskId === taskId);
      return task ? [task.passed] : [];
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
  const { entries, malformed } = parseEvalHistory(text);
  const verdict = { ...classifyTaskStreaks(entries), malformed };
  process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
  process.exitCode = { ok: 0, alarm: 1, undeterminable: 2 }[verdict.status];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv);
}
