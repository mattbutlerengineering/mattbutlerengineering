import type { JudgeFunction, TaskRunResult, TaskScore } from "./types.js";

/**
 * Scores a single task run against its rubric.
 *
 * Deterministic signals (tests, typecheck, lint, budget) are always applied.
 * When the rubric has `judgeCriteria` AND a `judge` function is provided, the
 * LLM judge is invoked and its pass/fail outcome is added as one additional
 * signal — keeping the judge isolated behind an injectable seam so tests
 * can stub it without live LLM calls.
 *
 * `score` is the fraction of *applicable* signals that were satisfied;
 * `passed` requires every applicable signal to hold.
 */
export async function scoreTask(run: TaskRunResult, judge?: JudgeFunction): Promise<TaskScore> {
  const { task, session, checks } = run;
  const { rubric } = task;

  const signals: boolean[] = [];
  if (rubric.testsMustPass) signals.push(checks.testsPass);
  if (rubric.typecheckMustPass) signals.push(checks.typecheckPass);
  if (rubric.lintMustPass) signals.push(checks.lintPass);
  // Budget is always an applicable signal.
  signals.push(checks.withinBudget);

  // LLM-judge signals — only when criteria are specified and a judge is injected.
  let judgeResult: TaskScore["judgeResult"];
  if (rubric.judgeCriteria.length > 0 && judge !== undefined) {
    const criteria = rubric.judgeCriteria.join("\n");
    judgeResult = await judge(task.prompt, criteria);
    signals.push(judgeResult.passed);
  }

  const satisfied = signals.filter(Boolean).length;
  const score = signals.length === 0 ? 0 : satisfied / signals.length;
  const passed = signals.every(Boolean);

  return {
    taskId: task.id,
    category: task.category,
    passed,
    score,
    deterministic: checks,
    judgeResult,
    selfEvaluation: session.evaluation,
    costUsd: session.costUsd,
    turns: session.numTurns,
  };
}
