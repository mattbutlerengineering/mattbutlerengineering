import { z } from "zod";
import type { SessionResult } from "../types.js";

/**
 * Golden-task eval harness types.
 *
 * A {@link Task} is a fixed, versioned benchmark case. The harness runs each
 * task through the agent (via an injected runner — see {@link TaskRunner}),
 * producing a {@link TaskRunResult}; the scorer turns that into a
 * {@link TaskScore}; the harness aggregates scores into an {@link EvalReport}.
 */

export const TASK_CATEGORIES = [
  "bugfix",
  "refactor",
  "new-route",
  "dep-bump",
  "test-writing",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

/** Objective expectations a task is scored against. */
export const rubricSchema = z.object({
  /** Target test command(s) that must pass for the change to count. */
  testsMustPass: z.boolean().default(true),
  /** Typecheck must be clean. */
  typecheckMustPass: z.boolean().default(true),
  /** Lint must be clean. */
  lintMustPass: z.boolean().default(false),
  /** Free-text criteria for the LLM judge (added in a later slice). */
  judgeCriteria: z.array(z.string()).default([]),
});

export type Rubric = z.infer<typeof rubricSchema>;

export const taskBudgetSchema = z.object({
  maxTurns: z.number().int().positive().default(50),
  maxCostUsd: z.number().positive().default(1),
});

export type TaskBudget = z.infer<typeof taskBudgetSchema>;

export const taskSchema = z.object({
  id: z.string().min(1),
  category: z.enum(TASK_CATEGORIES),
  /** The instruction handed to the agent. */
  prompt: z.string().min(1),
  /** Identifier for the fixture the task runs against (repo subdir, ref, etc.). */
  fixtureRef: z.string().min(1),
  rubric: rubricSchema.default({
    testsMustPass: true,
    typecheckMustPass: true,
    lintMustPass: false,
    judgeCriteria: [],
  }),
  budget: taskBudgetSchema.default({ maxTurns: 50, maxCostUsd: 1 }),
});

export type Task = z.infer<typeof taskSchema>;

/** Deterministic check outcomes computed by the runner after the agent runs. */
export interface DeterministicChecks {
  readonly testsPass: boolean;
  readonly typecheckPass: boolean;
  readonly lintPass: boolean;
  readonly withinBudget: boolean;
}

/** Raw outcome of running one task through the agent + deterministic checks. */
export interface TaskRunResult {
  readonly task: Task;
  readonly session: SessionResult;
  readonly checks: DeterministicChecks;
}

/** A task's score after applying its rubric to the run result. */
export interface TaskScore {
  readonly taskId: string;
  readonly category: TaskCategory;
  readonly passed: boolean;
  /** 0..1 — fraction of applicable rubric signals satisfied. */
  readonly score: number;
  readonly deterministic: DeterministicChecks;
  /** Self-reported agent evaluation, when present — used for calibration. */
  readonly selfEvaluation?: SessionResult["evaluation"];
  readonly costUsd: number;
  readonly turns: number;
  /** Set when the task crashed mid-run rather than completing. */
  readonly error?: string;
}

export interface CategoryStats {
  readonly total: number;
  readonly passRate: number;
}

export interface EvalAggregate {
  readonly total: number;
  readonly passRate: number;
  readonly meanScore: number;
  readonly meanCostUsd: number;
  readonly meanTurns: number;
  readonly stuckCount: number;
  /** Per-category pass rate, keyed by {@link TaskCategory}. Only categories present in the run appear. */
  readonly byCategory: Readonly<Record<string, CategoryStats>>;
}

export interface EvalReport {
  readonly runId: string;
  readonly tasks: readonly TaskScore[];
  readonly aggregate: EvalAggregate;
}

/** Injected agent-invocation seam. Real impl runs `runSession` + checks; tests stub it. */
export type TaskRunner = (task: Task) => Promise<TaskRunResult>;
