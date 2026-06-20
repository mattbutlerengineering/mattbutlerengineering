import type { EvalAggregate, EvalReport, Task, TaskRunner, TaskScore } from "./types.js";
import { scoreTask } from "./task-scorer.js";

export interface RunEvalSuiteOptions {
  /** Agent-invocation seam. Real impl runs `runSession`; tests stub it. */
  readonly runTask: TaskRunner;
  /** Stable id for this run (callers pass a timestamp/uuid — kept injectable for determinism in tests). */
  readonly runId: string;
  /** When set, run only the task with this id. */
  readonly only?: string;
}

/**
 * Runs each task through the agent (via `runTask`), scores it, and aggregates.
 *
 * A task that throws is recorded as a failed {@link TaskScore} (score 0) with
 * its error captured — one bad task never voids the suite.
 */
export async function runEvalSuite(
  tasks: readonly Task[],
  opts: RunEvalSuiteOptions
): Promise<EvalReport> {
  const selected = opts.only ? tasks.filter((t) => t.id === opts.only) : tasks;

  const scores: TaskScore[] = [];
  for (const task of selected) {
    try {
      const runResult = await opts.runTask(task);
      scores.push(await scoreTask(runResult));
    } catch (err) {
      scores.push(failedScore(task, err));
    }
  }

  return { runId: opts.runId, tasks: scores, aggregate: aggregate(scores) };
}

function failedScore(task: Task, err: unknown): TaskScore {
  return {
    taskId: task.id,
    category: task.category,
    passed: false,
    score: 0,
    deterministic: {
      testsPass: false,
      typecheckPass: false,
      lintPass: false,
      withinBudget: false,
    },
    costUsd: 0,
    turns: 0,
    error: err instanceof Error ? err.message : String(err),
  };
}

function aggregate(scores: readonly TaskScore[]): EvalAggregate {
  const total = scores.length;
  if (total === 0) {
    return { total: 0, passRate: 0, meanScore: 0, meanCostUsd: 0, meanTurns: 0, stuckCount: 0 };
  }
  const sum = (pick: (s: TaskScore) => number): number =>
    scores.reduce((acc, s) => acc + pick(s), 0);
  return {
    total,
    passRate: scores.filter((s) => s.passed).length / total,
    meanScore: sum((s) => s.score) / total,
    meanCostUsd: sum((s) => s.costUsd) / total,
    meanTurns: sum((s) => s.turns) / total,
    // Tasks that failed to complete (crashed mid-run) — a proxy for "stuck"
    // until session stuckPattern is propagated in a later slice.
    stuckCount: scores.filter((s) => s.error !== undefined).length,
  };
}
