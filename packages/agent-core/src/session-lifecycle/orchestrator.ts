import { runSession as defaultRunSession } from "../session-runner.js";
import { DEFAULT_SESSION_CONFIG } from "../types.js";
import type { SessionConfig, SessionEvent, SessionResult } from "../types.js";
import type {
  CreateSessionInput,
  EventProjector,
  SessionLifecycleDeps,
  SessionLifecycleLogger,
  SessionLifecycleOrchestrator,
  SessionResultPatch,
  StoredSession,
} from "./types.js";

/** Default projector: store the event type with its data verbatim. */
const passthroughProjector: EventProjector = (event: SessionEvent) => ({
  type: event.type,
  data: event.data,
});

/** Default logger: agent-core is a library, so this is the last resort. */
const consoleLogger: SessionLifecycleLogger = {
  error: (meta, message) => console.error(meta, message),
};

/** Projects a pipeline SessionResult onto the store's terminal-write patch. */
function buildResultPatch(result: SessionResult): SessionResultPatch {
  return {
    branchName: result.branchName,
    prUrl: result.prUrl ?? undefined,
    resultText: result.resultText,
    costUsd: result.costUsd,
    inputTokens: result.tokenUsage.inputTokens,
    outputTokens: result.tokenUsage.outputTokens,
    numTurns: result.numTurns,
    durationMs: result.durationMs,
    errors: [...result.errors],
    sdkSessionId: result.sessionId,
  };
}

/**
 * Owns every session state transition — create → running →
 * succeeded/failed/cancelled — with storage, execution, concurrency, and event
 * projection all injected at the seam. `runSession` (the #1992 phase pipeline)
 * is the unit of execution; this is the state+storage owner that wraps it, so
 * the CLI and the API service drive the exact same code path.
 */
export function createSessionLifecycleOrchestrator(
  deps: SessionLifecycleDeps
): SessionLifecycleOrchestrator {
  const {
    store,
    resolveRepoPath,
    runSession = defaultRunSession,
    concurrency,
    projectEvent = passthroughProjector,
    allowedTools = DEFAULT_SESSION_CONFIG.allowedTools,
    feedbackLoop,
    logger = consoleLogger,
  } = deps;

  // AbortControllers keyed by session id — cancellation handles only. The
  // active-slot count is owned by the injected concurrency gate, not here.
  const activeControllers = new Map<string, AbortController>();

  function toSessionConfig(session: StoredSession): SessionConfig {
    return {
      taskDescription: session.taskDescription,
      repoPath: resolveRepoPath(),
      baseBranch: session.baseBranch,
      model: session.model,
      maxTurns: session.maxTurns,
      maxBudgetUsd: session.maxBudgetUsd,
      allowedTools: [...allowedTools],
      createPr: session.createPr,
      ...(feedbackLoop ? { feedbackLoop } : {}),
    };
  }

  async function addEvent(id: string, type: string, data: Record<string, unknown>): Promise<void> {
    try {
      await store.addEvent(id, type, data);
    } catch (err) {
      // Event persistence is best-effort — never fail a session over logging —
      // but the failure itself must stay visible, not silently absorbed.
      logger.error({ sessionId: id, type, err }, "session event persistence failed");
    }
  }

  async function create(input: CreateSessionInput): Promise<StoredSession> {
    return store.create(input);
  }

  async function execute(sessionId: string): Promise<SessionResult | null> {
    // Every DB call this function makes — including the initial fetch and the
    // concurrency-reject write — sits inside this try/finally so a transient
    // failure anywhere always resolves the session instead of leaving it
    // stranded in `pending` with no error signal (#2886).
    let controller: AbortController | undefined;
    // Set once runSession resolves. Distinguishes "the pipeline failed" from
    // "the pipeline succeeded but a later storage write threw" in the catch
    // below, so a storage hiccup after a genuine success never masquerades as
    // a pipeline failure that drops the result (#2887B).
    let pipelineResult: SessionResult | undefined;

    try {
      const session = await store.getById(sessionId);
      if (!session) return null;

      // Atomic check-and-reserve through the single gate (when provided).
      if (concurrency && !concurrency.acquire(sessionId)) {
        await store.updateStatus(sessionId, "failed", {
          errors: [`Max concurrent sessions (${concurrency.limit}) reached`],
        });
        return null;
      }

      controller = new AbortController();
      activeControllers.set(sessionId, controller);

      await store.updateStatus(sessionId, "running");
      await addEvent(sessionId, "session:start", { message: "Session execution started" });

      const onEvent = (event: SessionEvent): void => {
        const stored = projectEvent(event);
        if (stored) void addEvent(sessionId, stored.type, stored.data);
      };

      const result = await runSession(
        toSessionConfig(session),
        onEvent,
        undefined,
        controller.signal
      );
      pipelineResult = result;

      // If cancel() fired while the pipeline was running, it already wrote the
      // terminal `cancelled` state. The pipeline short-circuits at the next
      // phase boundary rather than being force-killed mid-phase, and may
      // still have produced a real branch/PR/cost — persist that onto the
      // already-`cancelled` row instead of discarding it (#2887A).
      if (controller.signal.aborted) {
        await store.updateStatus(sessionId, "cancelled", buildResultPatch(result), {
          fromStatus: ["cancelled"],
        });
        return result;
      }

      const finalStatus = result.status === "succeeded" ? "succeeded" : "failed";

      await store.updateStatus(sessionId, finalStatus, buildResultPatch(result), {
        fromStatus: ["running"],
      });

      await addEvent(sessionId, "session:complete", {
        status: finalStatus,
        costUsd: result.costUsd,
        prUrl: result.prUrl,
      });

      return result;
    } catch (error) {
      if (pipelineResult) {
        // The run genuinely succeeded — only the write that followed it
        // threw. Log the storage failure and return the real result rather
        // than clobbering the row with a bare `failed: <db error>` that would
        // discard it (#2887B).
        logger.error(
          { sessionId, err: error },
          "session result-patch write failed after a successful run"
        );
        return pipelineResult;
      }

      // A cancelled session already holds its terminal state — don't overwrite.
      if (controller?.signal.aborted) return null;

      const errorMessage = error instanceof Error ? error.message : String(error);
      await store.updateStatus(
        sessionId,
        "failed",
        { errors: [errorMessage] },
        { fromStatus: ["pending", "running"] }
      );
      await addEvent(sessionId, "session:error", { message: errorMessage });
      return null;
    } finally {
      activeControllers.delete(sessionId);
      concurrency?.release(sessionId);
    }
  }

  async function cancel(sessionId: string): Promise<boolean> {
    const controller = activeControllers.get(sessionId);
    if (!controller) return false;

    // Mark terminal + free the slot. `runSession` is given this same signal
    // (see `execute`) and checks it at each phase boundary, so the in-flight
    // pipeline short-circuits at the next boundary rather than running to its
    // natural end — see the design note's cancellation-semantics section.
    controller.abort();
    activeControllers.delete(sessionId);
    concurrency?.release(sessionId);

    // CAS: only transition a still-`running` session. If execute() already
    // persisted a terminal status (succeeded/failed) in the window between
    // that write and this call, the store rejects the write and returns null —
    // cancel() must not clobber a completed session back to `cancelled`.
    const updated = await store.updateStatus(
      sessionId,
      "cancelled",
      { errors: ["Cancelled by user"] },
      { fromStatus: ["running"] }
    );
    if (!updated) return false;

    await addEvent(sessionId, "session:cancelled", { message: "Session cancelled by user" });

    return true;
  }

  function getActiveSessionCount(): number {
    return concurrency ? concurrency.activeCount() : activeControllers.size;
  }

  return { create, execute, cancel, getActiveSessionCount };
}
