import type { EvalReport, TaskScore } from "./types.js";

/**
 * A task that reports 0 turns and $0 cost never produced an accounted run —
 * most commonly because the adapter had no credentials (e.g. missing
 * `ANTHROPIC_API_KEY`), but also when a session crashes before its first
 * result message and cost/turns are never recorded. A genuine completed run,
 * even one that scores 0%, always burns at least one turn or some cost.
 */
export function taskDidNotRun(score: Pick<TaskScore, "turns" | "costUsd">): boolean {
  return score.turns === 0 && score.costUsd === 0;
}

/**
 * True when a report has at least one task and none of them executed.
 * Distinguishes "the agent never ran" (no credentials / missing
 * prerequisite) from "the suite genuinely scored low" — only the latter is
 * a real measurement worth recording or gating on.
 */
export function suiteDidNotRun(report: EvalReport): boolean {
  return report.tasks.length > 0 && report.tasks.every(taskDidNotRun);
}
