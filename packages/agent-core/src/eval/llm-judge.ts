import { evaluateSuccess } from "../success-evaluator.js";
import type { EvaluationResult } from "../success-evaluator.js";
import type { JudgeFunction, TaskRunResult } from "./types.js";

type Evaluate = (
  task: string,
  diff: string,
  config?: { readonly forceEvaluate?: boolean }
) => Promise<EvaluationResult>;

/**
 * Builds the production {@link JudgeFunction} for one run: the existing
 * `evaluateSuccess` LLM evaluator, pointed at that run's diff and the task's
 * rubric criteria. The skip policy is bypassed — a task's `judgeCriteria` are
 * the definition of done and must always get a real verdict. A judge that
 * cannot run comes back `evaluationFailed` (fail closed) from `evaluateSuccess`.
 *
 * `run.diff === undefined` means the runner could not capture the diff, which
 * is inconclusive — distinct from `""` (captured, nothing changed), which is
 * still judged: under `forceEvaluate` the evaluator shows the judge an
 * explicit no-changes marker, so a task whose criteria allow a no-op can pass.
 *
 * `evaluate` is injectable so tests never make live LLM calls.
 */
export function createEvalJudge(
  run: TaskRunResult,
  evaluate: Evaluate = evaluateSuccess
): JudgeFunction {
  return async (taskPrompt, criteria) => {
    if (run.diff === undefined) {
      return {
        passed: false,
        confidence: 0,
        reasoning: "The session's diff could not be captured — judgeCriteria not evaluated",
        issues: ["LLM judge could not run"],
        evaluationFailed: true,
      };
    }
    return evaluate(`${taskPrompt}\n\n${formatAcceptanceCriteria(criteria)}`, run.diff, {
      forceEvaluate: true,
    });
  };
}

/**
 * Renders newline-joined criteria as the `## Acceptance Criteria` checkbox
 * list `extractAcceptanceCriteria` parses, so the evaluator prompt gets its
 * per-criterion section.
 */
function formatAcceptanceCriteria(criteria: string): string {
  const items = criteria
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- [ ] ${line}`);
  return ["## Acceptance Criteria", ...items].join("\n");
}
