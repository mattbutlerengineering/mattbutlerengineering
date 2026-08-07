/**
 * runCliAdapterSession — routes gemini/opencode Sessions through the SAME
 * Phase pipeline the Claude adapter uses: WorktreePhase → [CLI dispatch] →
 * VerificationPhase → PublishPhase → FeedbackPhase (#3234). Replaces the
 * hand-rolled worktree/gateway/publish-decision tree that used to live in
 * the deleted `cli-adapter-session-runner.ts`, which had already drifted
 * from the shared pipeline (unused `AbortSignal`, no budget gate).
 *
 * The only adapter-specific step is the "query": instead of Claude's SDK
 * `query()` loop (QueryPhase), a CLI-subprocess adapter's `dispatch()` is
 * invoked once and its result mapped to the adapter-neutral
 * `SessionResultSummary` (#3233) that VerificationPhase/PublishPhase/
 * FeedbackPhase already consume — no SDK-shaped result is fabricated.
 *
 * Cancellation mirrors session-runner.ts exactly: `signal` is checked at
 * phase boundaries only (never mid-phase — an in-flight phase always runs
 * to its own natural end).
 *
 * Known scope limits (see #3234 write-up):
 *  - No stuck detection — that's Claude-SDK streaming instrumentation with
 *    no subprocess equivalent; `stuckReason` is always undefined here.
 *  - No partial-work PR push on cancellation/error — unlike session-runner's
 *    best-effort `pushPartialWork`, an aborted or worktree-failed CLI
 *    session simply reports failure; this keeps the module from growing a
 *    second copy of that fallback logic.
 *  - FeedbackPhase's fix session always runs via Claude's SDK query loop
 *    (`runFeedbackLoop` → `runHardenedQuery`), regardless of which adapter
 *    did the initial task — that is FeedbackPhase's existing, shared
 *    behavior, not something this module special-cases.
 */

import { emitEvent } from "../utils.js";
import { recordSpend } from "../spend-recorder.js";
import { categorizeFailure } from "../observability.js";
import { shouldHaltForBudget } from "../budget-gate.js";
import { createDefaultPhaseDeps } from "../phases/default-deps.js";
import { WorktreePhase, VerificationPhase, PublishPhase, FeedbackPhase } from "../phases/index.js";
import type { PhaseDeps } from "../phases/index.js";
import type { AdapterResult } from "../cli-adapter.js";
import type { GatewayVerdict } from "../post-commit-gateway.js";
import type { CliAdapterContract } from "./cli-adapter-contract.js";
import type {
  FailureCategory,
  SessionConfig,
  SessionEventCallback,
  SessionResult,
  SessionResultSummary,
  SessionStatus,
  TurnMetrics,
  WorktreeInfo,
} from "../types.js";

/** ~2 minutes per turn — matches the CLI's prior worktree-managed dispatch. */
const TIMEOUT_MS_PER_TURN = 120_000;

const ABORT_MESSAGE = "Session aborted";

// ── Pipeline phases (stateless singletons, shared with session-runner.ts) ──

const worktreePhase = new WorktreePhase();
const verificationPhase = new VerificationPhase();
const publishPhase = new PublishPhase();
const feedbackPhase = new FeedbackPhase();

export async function runCliAdapterSession(
  cliAdapter: CliAdapterContract,
  config: SessionConfig,
  onEvent?: SessionEventCallback,
  deps: PhaseDeps = createDefaultPhaseDeps(),
  signal?: AbortSignal
): Promise<SessionResult> {
  const errors: string[] = [];
  let worktree: WorktreeInfo | undefined;
  let adapterResult: AdapterResult | undefined;
  let resultSummary: SessionResultSummary | undefined;
  let prUrl: string | null = null;
  let budgetEnforced = false;

  // WorktreePhase — identical to the Claude path. The built systemPrompt is
  // unused by CLI-subprocess adapters (they only forward taskDescription).
  const worktreeExec = await worktreePhase.run({ config, onEvent }, deps);
  if (worktreeExec.output) {
    worktree = worktreeExec.output.worktree;
  } else {
    errors.push(...worktreeExec.result.errors);
  }

  let aborted = worktree ? checkAborted(signal, errors) : true;

  if (worktree && !aborted) {
    adapterResult = await cliAdapter.dispatch({
      taskDescription: config.taskDescription,
      worktreePath: worktree.path,
      repoPath: config.repoPath,
      baseBranch: config.baseBranch,
      model: config.model,
      maxTurns: config.maxTurns,
      timeoutMs: config.maxTurns * TIMEOUT_MS_PER_TURN,
    });
    if (adapterResult.error) errors.push(adapterResult.error);

    resultSummary = {
      success: adapterResult.success,
      sessionId: cliAdapter.name,
      costUsd: adapterResult.costUsd ?? 0,
      numTurns: 0,
    };

    const breach = shouldHaltForBudget(
      buildSyntheticTurnMetrics(resultSummary.costUsd, config.model),
      config.maxBudgetUsd
    );
    if (breach.exceeded) {
      emitEvent(onEvent, "session:budget_breach", { message: JSON.stringify(breach) });
      if (config.enforceBudget) {
        errors.push(
          `Budget breached: accumulated $${breach.accumulatedCostUsd.toFixed(4)} exceeds limit $${breach.maxBudgetUsd}`
        );
        budgetEnforced = true;
      }
    }

    aborted = checkAborted(signal, errors);
  }

  let hasChanges = false;
  let gatewayVerdict: GatewayVerdict | undefined;

  if (worktree && !aborted && !budgetEnforced) {
    const verifyExec = await verificationPhase.run(
      { config, onEvent, worktree, resultMessage: resultSummary, stuckReason: undefined },
      deps
    );
    errors.push(...verifyExec.result.errors);
    hasChanges = verifyExec.output?.hasChanges ?? false;
    gatewayVerdict = verifyExec.output?.gatewayVerdict;

    // A failed CLI dispatch that still wrote changes must always publish via
    // the draft/failure path, regardless of gatewayVerdict. VerificationPhase
    // skips the gateway entirely on failure (isSuccess false), leaving
    // gatewayVerdict undefined — which PublishPhase's `!gatewayVerdict`
    // branch otherwise treats identically to "gates passed, ship a normal
    // PR" (resultSummary is always a truthy object, even on failure).
    // Forcing "create-draft-pr" here routes PublishPhase into its
    // unconditional buildFailurePrBody branch. Mirrors the deleted
    // cli-adapter-session-runner.ts's unconditional `if (!adapterSucceeded)`
    // failure branch.
    if (adapterResult?.success === false) {
      gatewayVerdict = {
        outcome: "create-draft-pr",
        passed: false,
        gateFailures: ["cli-dispatch"],
        errors: [],
      };
    }

    aborted = checkAborted(signal, errors);
  }

  if (worktree && !aborted && !budgetEnforced) {
    const publishExec = await publishPhase.run(
      {
        config,
        onEvent,
        worktree,
        hasChanges,
        resultMessage: resultSummary,
        stuckReason: undefined,
        gatewayVerdict,
        errors,
      },
      deps
    );
    prUrl = publishExec.output?.prUrl ?? null;
    const prNumber = publishExec.output?.prNumber;

    aborted = checkAborted(signal, errors);

    if (!aborted) {
      await feedbackPhase.run(
        { config, onEvent, worktree, resultMessage: resultSummary, prUrl, prNumber, signal },
        deps
      );
    }
  }

  if (worktree && config.createPr) {
    await deps.worktreeManager.removeWorktree(config.repoPath, worktree.path);
  }

  // An abort forces "failed" regardless of how far the pipeline got before
  // the boundary check caught it — mirrors session-runner.ts, where the
  // thrown "Session aborted" always lands in the outer catch's failure
  // result, even after a fully successful query/verification/publish.
  const status: SessionStatus =
    aborted || budgetEnforced || resultSummary?.success !== true ? "failed" : "succeeded";
  emitEvent(onEvent, "session:result", { message: `Session completed: ${status}` });

  const failureCategory: FailureCategory | undefined =
    status === "failed"
      ? adapterResult?.rateLimited
        ? "rate_limited"
        : categorizeFailure(errors)
      : undefined;

  const costUsd = adapterResult?.costUsd ?? 0;
  const tokenUsage = adapterResult?.tokenUsage ?? { inputTokens: 0, outputTokens: 0 };

  // Record spend through the single seam — the ONLY spend write for a
  // gemini/opencode run, mirroring session-runner's write for the claude
  // path. Best-effort: never fail a session over spend logging.
  try {
    recordSpend(config.repoPath, {
      costUsd,
      model: config.model,
      adapter: cliAdapter.name,
      status,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
    });
  } catch {
    // Best-effort — spend logging must never crash a session.
  }

  return {
    sessionId: "",
    status,
    branchName: worktree?.branchName ?? "",
    prUrl,
    costUsd,
    tokenUsage,
    durationMs: adapterResult?.durationMs ?? 0,
    numTurns: 0,
    resultText: "",
    errors,
    ...(failureCategory ? { failureCategory } : {}),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Checks `signal` at a phase boundary; records the abort message once and
 * returns whether the pipeline should stop. Mirrors session-runner.ts's
 * `throwIfAborted`, but as a boolean predicate instead of a throw — this
 * module has no outer try/catch to unwind through.
 */
function checkAborted(signal: AbortSignal | undefined, errors: string[]): boolean {
  if (!signal?.aborted) return false;
  if (!errors.includes(ABORT_MESSAGE)) errors.push(ABORT_MESSAGE);
  return true;
}

/**
 * Wraps the CLI adapter's total reported cost as a single synthetic "turn"
 * so the shared `shouldHaltForBudget` predicate — built for Claude's
 * per-turn metrics — applies unchanged to a subprocess adapter that only
 * ever reports one aggregate cost figure.
 */
function buildSyntheticTurnMetrics(costUsd: number, modelId: string): readonly TurnMetrics[] {
  return [
    {
      turnIndex: 1,
      startedAt: new Date().toISOString(),
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      costUsd,
      modelId,
    },
  ];
}
