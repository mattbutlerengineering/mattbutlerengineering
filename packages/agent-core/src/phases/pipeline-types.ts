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
import type { GatewayVerdict } from "../post-commit-gateway.js";
import type { TaskSignals } from "../task-signal-registry.js";
import type { HardenedQueryConfig, HardenedQueryResult } from "../run-hardened-query.js";
import type {
  FeedbackLoopParams,
  FeedbackLoopResult,
  FeedbackLoopRunnerDeps,
} from "../feedback-loop.js";
import type { PrFeedbackPort } from "../pr-feedback-port.js";
import type { SourceFileEntry, PromptBuilderConfig } from "../prompt-builder.js";

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
// These are the cross-process / spawn-session collaborators whose real
// implementation genuinely differs between production and test, so phases
// receive them injected and tests substitute lightweight fakes for one
// `PhaseDeps` object. In-implementation phase collaborators (failure
// memory, git-diff, post-commit gateway) are imported directly inside
// their owning phase and mocked with `vi.mock` — see ADR-017 (#3120).

export interface WorktreeManagerDeps {
  createWorktree(
    repoPath: string,
    baseBranch: string,
    taskDescription: string
  ): Promise<WorktreeInfo>;
  hasChanges(worktreePath: string): Promise<boolean>;
  commitChanges(worktreePath: string, message: string): Promise<string>;
  pushBranch(worktreePath: string, branchName: string): Promise<void>;
  commitAndPush(worktreePath: string, branchName: string, message: string): Promise<void>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
}

export interface PromptBuilderDeps {
  buildSystemPrompt(taskDescription: string, config?: PromptBuilderConfig): Promise<string>;
  loadSourceFiles(paths: readonly string[]): Promise<readonly SourceFileEntry[]>;
  loadProjectContext(repoPath: string): Promise<string | null>;
}

export interface QueryRunnerDeps {
  runHardenedQuery(
    config: HardenedQueryConfig,
    onEvent?: SessionEventCallback
  ): Promise<HardenedQueryResult>;
}

export interface PrCreatorDeps {
  createPullRequest(options: PrOptions): Promise<PrResult>;
  buildPrTitle(taskDescription: string): string;
  buildPrBody(
    taskDescription: string,
    sessionId: string,
    costUsd: number | undefined,
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
    deps: FeedbackLoopRunnerDeps,
    onEvent?: SessionEventCallback
  ): Promise<FeedbackLoopResult>;
  readonly feedbackPoller: PrFeedbackPort;
}

/**
 * The full bundle of collaborators injected into the phase pipeline.
 * `createDefaultPhaseDeps()` wires the real module implementations;
 * tests pass lightweight fakes.
 */
export interface PhaseDeps {
  readonly worktreeManager: WorktreeManagerDeps;
  readonly promptBuilder: PromptBuilderDeps;
  readonly queryRunner: QueryRunnerDeps;
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
  /** Forwarded to `FeedbackLoopParams.signal` so a pipeline cancel() reaches
   * the feedback loop's delay/poll/query calls. */
  readonly signal?: AbortSignal;
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
