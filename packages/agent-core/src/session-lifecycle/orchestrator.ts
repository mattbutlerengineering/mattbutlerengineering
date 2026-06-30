import { runSession as defaultRunSession } from "../session-runner.js";
import { DEFAULT_SESSION_CONFIG } from "../types.js";
import type { SessionConfig, SessionEvent, SessionResult } from "../types.js";
import type {
  CreateSessionInput,
  EventProjector,
  SessionLifecycleDeps,
  SessionLifecycleOrchestrator,
  StoredSession,
} from "./types.js";

/** Default projector: store the event type with its data verbatim. */
const passthroughProjector: EventProjector = (event: SessionEvent) => ({
  type: event.type,
  data: event.data as Record<string, unknown>,
});

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
    } catch {
      // Event persistence is best-effort — never fail a session over logging.
    }
  }

  async function create(input: CreateSessionInput): Promise<StoredSession> {
    return store.create(input);
  }

  async function execute(sessionId: string): Promise<SessionResult | null> {
    const session = await store.getById(sessionId);
    if (!session) return null;

    // Atomic check-and-reserve through the single gate (when provided).
    if (concurrency && !concurrency.acquire(sessionId)) {
      await store.updateStatus(sessionId, "failed", {
        errors: [`Max concurrent sessions (${concurrency.limit}) reached`],
      });
      return null;
    }

    const controller = new AbortController();
    activeControllers.set(sessionId, controller);

    try {
      await store.updateStatus(sessionId, "running");
      await addEvent(sessionId, "session:start", { message: "Session execution started" });

      const onEvent = (event: SessionEvent): void => {
        const stored = projectEvent(event);
        if (stored) void addEvent(sessionId, stored.type, stored.data);
      };

      const result = await runSession(toSessionConfig(session), onEvent);

      // If cancel() fired while the pipeline was running, it already wrote the
      // terminal `cancelled` state — do not clobber it with the run result.
      if (controller.signal.aborted) return result;

      const finalStatus = result.status === "succeeded" ? "succeeded" : "failed";

      await store.updateStatus(sessionId, finalStatus, {
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
      });

      await addEvent(sessionId, "session:complete", {
        status: finalStatus,
        costUsd: result.costUsd,
        prUrl: result.prUrl,
      });

      return result;
    } catch (error) {
      // A cancelled session already holds its terminal state — don't overwrite.
      if (controller.signal.aborted) return null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      await store.updateStatus(sessionId, "failed", { errors: [errorMessage] });
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

    // Mark terminal + free the slot. NOTE: runSession does not yet accept an
    // AbortSignal, so the in-flight pipeline runs to its natural end — see the
    // design note's cancellation-semantics section.
    controller.abort();
    activeControllers.delete(sessionId);
    concurrency?.release(sessionId);

    await store.updateStatus(sessionId, "cancelled", { errors: ["Cancelled by user"] });
    await addEvent(sessionId, "session:cancelled", { message: "Session cancelled by user" });

    return true;
  }

  function getActiveSessionCount(): number {
    return concurrency ? concurrency.activeCount() : activeControllers.size;
  }

  return { create, execute, cancel, getActiveSessionCount };
}
