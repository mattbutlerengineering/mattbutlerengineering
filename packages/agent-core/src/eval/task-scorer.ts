import type { EvaluationResult } from "../success-evaluator.js";
import type { JudgeFunction, TaskRunResult, TaskScore } from "./types.js";

/**
 * Scores a single task run against its rubric.
 *
 * Deterministic signals (tests, typecheck, lint, budget) are always applied.
 * When the rubric has `judgeCriteria`, the LLM judge's pass/fail outcome is
 * added as one additional signal — behind an injectable seam so tests can stub
 * it without live LLM calls. The judge fails closed: no judge wired, or one
 * that throws, yields `passed: false, evaluationFailed: true` rather than
 * silently dropping the criteria.
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
  if (rubric.judgeCriteria.length > 0) {
    judgeResult = await runJudge(task.prompt, rubric.judgeCriteria.join("\n"), judge);
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
    ...(session.errors?.length ? { sessionErrors: session.errors } : {}),
  };
}

function inconclusive(reasoning: string): EvaluationResult {
  return {
    passed: false,
    confidence: 0,
    reasoning,
    issues: ["LLM judge could not run"],
    evaluationFailed: true,
  };
}

async function runJudge(
  prompt: string,
  criteria: string,
  judge: JudgeFunction | undefined
): Promise<EvaluationResult> {
  if (judge === undefined) return inconclusive("No judge configured — judgeCriteria not evaluated");
  try {
    return await judge(prompt, criteria);
  } catch (err) {
    return inconclusive(`Judge threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
