import { resolve } from "node:path";
import {
  runSession,
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
  type SessionEvent,
} from "@mbe/agent-core";
import type { AgentSession } from "@mbe/types";
import type { sessionService as SessionServiceType } from "./session.js";
import type { SessionConcurrency } from "./session-concurrency.js";
import { mapSdkEvent } from "./sdk-event-mapper.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface SessionExecutorConfig {
  /** The single gate that owns the max-concurrent-sessions policy. */
  concurrency: SessionConcurrency;
  sessionService: typeof SessionServiceType;
}

export interface SessionExecutor {
  executeSession(session: AgentSession): Promise<void>;
  cancelSession(sessionId: string): Promise<boolean>;
  getActiveSessionCount(): number;
}

// ── Factory ───────────────────────────────────────────────────────────

export function createSessionExecutor(config: SessionExecutorConfig): SessionExecutor {
  const { concurrency, sessionService } = config;
  // AbortControllers keyed by session id, used purely for cancellation handles.
  // The active-slot COUNT is owned by the injected `concurrency` gate, not here.
  const activeControllers = new Map<string, AbortController>();

  function getRepoPath(): string {
    return resolve(process.env.REPO_PATH ?? process.cwd());
  }

  function getActiveSessionCount(): number {
    return concurrency.activeCount();
  }

  async function executeSession(session: AgentSession): Promise<void> {
    // Atomic check-and-reserve through the single gate. A slot freed elsewhere
    // (e.g. the liveness monitor cancelling a stale session) can be claimed
    // here exactly once — no over-subscription.
    if (!concurrency.acquire(session.id)) {
      await sessionService.updateStatus(session.id, "FAILED", {
        errors: [`Max concurrent sessions (${concurrency.limit}) reached`],
      });
      return;
    }

    const controller = new AbortController();
    activeControllers.set(session.id, controller);

    try {
      await sessionService.updateStatus(session.id, "RUNNING");
      await sessionService.addEvent(session.id, "session:start", {
        message: "Session execution started",
      });

      const sessionConfig: SessionConfig = {
        taskDescription: session.taskDescription,
        repoPath: getRepoPath(),
        baseBranch: session.baseBranch,
        model: session.model,
        maxTurns: session.maxTurns,
        maxBudgetUsd: session.maxBudgetUsd,
        allowedTools: [...DEFAULT_SESSION_CONFIG.allowedTools],
        createPr: session.maxBudgetUsd > 0,
      };

      const onEvent = async (event: SessionEvent) => {
        try {
          const mapped = mapSdkEvent(event);
          await sessionService.addEvent(session.id, mapped.type, mapped.data);
        } catch {
          // Event logging is best-effort
        }
      };

      const result = await runSession(sessionConfig, onEvent);

      const finalStatus = result.status === "succeeded" ? "SUCCEEDED" : "FAILED";

      await sessionService.updateStatus(session.id, finalStatus, {
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

      await sessionService.addEvent(session.id, "session:complete", {
        status: finalStatus,
        costUsd: result.costUsd,
        prUrl: result.prUrl,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await sessionService.updateStatus(session.id, "FAILED", {
        errors: [errorMessage],
      });

      await sessionService.addEvent(session.id, "session:error", {
        message: errorMessage,
      });
    } finally {
      activeControllers.delete(session.id);
      concurrency.release(session.id);
    }
  }

  async function cancelSession(sessionId: string): Promise<boolean> {
    const controller = activeControllers.get(sessionId);
    if (!controller) {
      return false;
    }

    controller.abort();
    activeControllers.delete(sessionId);
    concurrency.release(sessionId);

    await sessionService.updateStatus(sessionId, "CANCELLED", {
      errors: ["Cancelled by user"],
    });

    await sessionService.addEvent(sessionId, "session:cancelled", {
      message: "Session cancelled by user",
    });

    return true;
  }

  return { executeSession, cancelSession, getActiveSessionCount };
}

// ── Default instance (backward-compat module-level exports) ───────────

import { sessionService } from "./session.js";
import { defaultConcurrency } from "./session-concurrency.js";

const _defaultExecutor = createSessionExecutor({
  concurrency: defaultConcurrency,
  sessionService,
});

export const getActiveSessionCount = _defaultExecutor.getActiveSessionCount;
export const executeSession = _defaultExecutor.executeSession;
export const cancelSession = _defaultExecutor.cancelSession;
