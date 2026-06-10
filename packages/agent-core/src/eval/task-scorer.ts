import type { TaskRunResult, TaskScore } from "./types.js";

/**
 * Scores a single task run against its rubric using deterministic signals only.
 *
 * (The LLM-judge half — for rubric `judgeCriteria` a deterministic check can't
 * express — is added in a later slice and folded into `score`/`passed` here.)
 *
 * `score` is the fraction of *applicable* rubric signals that were satisfied;
 * `passed` requires every applicable signal to hold.
 */
export function scoreTask(run: TaskRunResult): TaskScore {
  const { task, session, checks } = run;
  const { rubric } = task;

  const signals: boolean[] = [];
  if (rubric.testsMustPass) signals.push(checks.testsPass);
  if (rubric.typecheckMustPass) signals.push(checks.typecheckPass);
  if (rubric.lintMustPass) signals.push(checks.lintPass);
  // Budget is always an applicable signal.
  signals.push(checks.withinBudget);

  const satisfied = signals.filter(Boolean).length;
  const score = signals.length === 0 ? 0 : satisfied / signals.length;
  const passed = signals.every(Boolean);

  return {
    taskId: task.id,
    category: task.category,
    passed,
    score,
    deterministic: checks,
    selfEvaluation: session.evaluation,
    costUsd: session.costUsd,
    turns: session.numTurns,
  };
}
