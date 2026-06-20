import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  SessionConfig,
  SessionEventCallback,
  WorktreeInfo,
  TurnMetrics,
  ToolCallMetrics,
  PrOptions,
  PrResult,
} from "../types.js";
import type { StuckPattern } from "../stuck-detector.js";
import type { ContextMetrics } from "../context-budget.js";
import type { EvaluationResult } from "../success-evaluator.js";
import type { GatewayVerdict, PostCommitGatewayInput } from "../post-commit-gateway.js";
import type { TaskSignals } from "../task-signal-registry.js";
import type { HardenedQueryConfig, HardenedQueryResult } from "../run-hardened-query.js";
import type { FeedbackLoopParams, FeedbackLoopResult } from "../feedback-loop.js";
import type { SourceFileEntry, PromptBuilderConfig } from "../prompt-builder.js";
import type { FailureMemory, FailureRecord } from "../failure-memory.js";

/** Options accepted by `mergeDirectly` (dep-bump fast path). */
export interface MergeDirectlyOptions {
  readonly branchName: string;
  readonly baseBranch: string;
  readonly repoPath: string;
  readonly commitTitle: string;
}

// ── Phase result ────────────────────────────────────────────────────

export type PhaseStatus = "success" | "failed" | "skipped";

export interface PhaseResult {
  readonly phase: string;
  readonly status: PhaseStatus;
  readonly errors: readonly string[];
}

// ── Injected phase dependencies ─────────────────────────────────────
//
// Phases collaborate with the rest of agent-core through these injected
// interfaces instead of importing module functions directly. This lets
// tests substitute lightweight fakes for one `PhaseDeps` object rather
// than `vi.mock`-ing a dozen modules.

export interface WorktreeManagerDeps {
  createWorktree(
    repoPath: string,
    baseBranch: string,
    taskDescription: string
  ): Promise<WorktreeInfo>;
  hasChanges(worktreePath: string): Promise<boolean>;
  commitChanges(worktreePath: string, message: string): Promise<string>;
  pushBranch(worktreePath: string, branchName: string): Promise<void>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
}

export interface PromptBuilderDeps {
  buildSystemPrompt(taskDescription: string, config?: PromptBuilderConfig): Promise<string>;
  loadSourceFiles(paths: readonly string[]): Promise<readonly SourceFileEntry[]>;
  loadProjectContext(repoPath: string): Promise<string | null>;
}

export interface FailureMemoryDeps {
  loadMemory(repoPath: string): Promise<FailureMemory>;
  queryPastFailures(memory: FailureMemory, taskDescription: string): readonly FailureRecord[];
  buildFailureContext(failures: readonly FailureRecord[]): string;
}

export interface QueryRunnerDeps {
  runHardenedQuery(
    config: HardenedQueryConfig,
    onEvent?: SessionEventCallback
  ): Promise<HardenedQueryResult>;
}

export interface SuccessEvaluatorDeps {
  getGitDiff(worktreePath: string): Promise<string>;
}

export interface GatewayDeps {
  runPostCommitGateway(
    input: PostCommitGatewayInput,
    onEvent?: SessionEventCallback
  ): Promise<GatewayVerdict>;
}

export interface PrCreatorDeps {
  createPullRequest(options: PrOptions): Promise<PrResult>;
  buildPrTitle(taskDescription: string): string;
  buildPrBody(
    taskDescription: string,
    sessionId: string,
    costUsd: number,
    numTurns: number
  ): string;
  buildFailurePrBody(
    taskDescription: string,
    errors: readonly string[],
    stuckPattern?: string
  ): string;
  mergeDirectly(options: MergeDirectlyOptions): Promise<string>;
}

export interface FeedbackLoopDeps {
  runFeedbackLoop(
    config: FeedbackLoopParams,
    onEvent?: SessionEventCallback
  ): Promise<FeedbackLoopResult>;
}

/**
 * The full bundle of collaborators injected into the phase pipeline.
 * `createDefaultPhaseDeps()` wires the real module implementations;
 * tests pass lightweight fakes.
 */
export interface PhaseDeps {
  readonly worktreeManager: WorktreeManagerDeps;
  readonly promptBuilder: PromptBuilderDeps;
  readonly failureMemory: FailureMemoryDeps;
  readonly queryRunner: QueryRunnerDeps;
  readonly successEvaluator: SuccessEvaluatorDeps;
  readonly gateway: GatewayDeps;
  readonly prCreator: PrCreatorDeps;
  readonly feedbackLoop: FeedbackLoopDeps;
}

// ── Per-phase input / output contracts ──────────────────────────────
//
// Each phase declares exactly the fields it reads (input) and produces
// (output). session-runner composes them explicitly, threading one
// phase's output into the next phase's input — no amorphous shared bag.

export interface WorktreePhaseInput {
  readonly config: SessionConfig;
  readonly onEvent?: SessionEventCallback;
}

export interface WorktreePhaseOutput {
  readonly worktree: WorktreeInfo;
  readonly systemPrompt: string;
  readonly taskSignals: TaskSignals;
}

export interface QueryPhaseInput {
  readonly config: SessionConfig;
  readonly onEvent?: SessionEventCallback;
  readonly worktree: WorktreeInfo;
  readonly systemPrompt: string;
}

export interface QueryPhaseOutput {
  readonly resultMessage?: SDKResultMessage;
  readonly stuckReason?: StuckPattern;
  readonly turnMetrics: readonly TurnMetrics[];
  readonly toolCallMetrics: readonly ToolCallMetrics[];
  readonly contextMetrics?: ContextMetrics;
}

export interface VerificationPhaseInput {
  readonly config: SessionConfig;
  readonly onEvent?: SessionEventCallback;
  readonly worktree: WorktreeInfo;
  readonly resultMessage?: SDKResultMessage;
  readonly stuckReason?: StuckPattern;
}

export interface VerificationPhaseOutput {
  readonly hasChanges: boolean;
  readonly commitMsg?: string;
  readonly cachedDiff?: string;
  readonly gatewayVerdict?: GatewayVerdict;
  readonly gatewayEvaluation?: EvaluationResult;
}

export interface PublishPhaseInput {
  readonly config: SessionConfig;
  readonly onEvent?: SessionEventCallback;
  readonly worktree: WorktreeInfo;
  readonly hasChanges: boolean;
  readonly resultMessage?: SDKResultMessage;
  readonly stuckReason?: StuckPattern;
  readonly gatewayVerdict?: GatewayVerdict;
  /** Accumulated errors from prior phases — included in failure PR bodies. */
  readonly errors: readonly string[];
}

export interface PublishPhaseOutput {
  readonly prUrl: string | null;
  readonly prNumber?: number;
}

export interface FeedbackPhaseInput {
  readonly config: SessionConfig;
  readonly onEvent?: SessionEventCallback;
  readonly worktree: WorktreeInfo;
  readonly resultMessage?: SDKResultMessage;
  readonly prUrl: string | null;
  readonly prNumber?: number;
}

/**
 * The outcome of running a phase: a `PhaseResult` plus the phase's typed
 * output. `output` is `null` when the phase failed or was skipped (it has
 * nothing valid to contribute), so the caller composes forward only the
 * outputs of phases that succeeded.
 */
export interface PhaseExecution<TOutput> {
  readonly result: PhaseResult;
  readonly output: TOutput | null;
}

/**
 * A pipeline phase: receives a typed input plus injected deps, returns a
 * `PhaseResult` and a typed output. The caller composes the output into
 * the next phase's input.
 */
export interface Phase<TInput, TOutput> {
  readonly name: string;
  run(input: TInput, deps: PhaseDeps): Promise<PhaseExecution<TOutput>>;
}
