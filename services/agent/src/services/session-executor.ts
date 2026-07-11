import { resolve } from "node:path";
import {
  createSessionLifecycleOrchestrator,
  runSession,
  type EventProjector,
  type MappedEvent,
  type SessionEvent,
  type SessionLifecycleStore,
} from "@mbe/agent-core";
import type { AgentSession } from "@mbe/types";
import type { SessionConcurrency } from "./session-concurrency.js";
import { mapForStorage } from "./storage-event-mapper.js";
import { getServiceLogger } from "./logger.js";

// ── Types ─────────────────────────────────────────────────────────────

export interface SessionExecutorConfig {
  /** The single gate that owns the max-concurrent-sessions policy. */
  concurrency: SessionConcurrency;
  /** Persistence seam; the Prisma-backed store in production. */
  store: SessionLifecycleStore;
}

export interface SessionExecutor {
  executeSession(session: AgentSession): Promise<void>;
  cancelSession(sessionId: string): Promise<boolean>;
  getActiveSessionCount(): number;
}

// ── Event projection ──────────────────────────────────────────────────

/**
 * Projects a runtime SessionEvent to the stored shape. `run-hardened-query`
 * emits typed MappedEvents as JSON in the event message; those are parsed and
 * passed through `mapForStorage` (truncation + field selection). Plain message
 * events (session:start, session:error, …) are stored verbatim.
 */
const projectEvent: EventProjector = (event: SessionEvent) => {
  const eventData = event.data as { message?: string };
  if (typeof eventData.message === "string") {
    try {
      const parsed = JSON.parse(eventData.message) as MappedEvent;
      if (parsed && typeof parsed.type === "string" && parsed.type.startsWith("session:")) {
        return mapForStorage(parsed);
      }
    } catch {
      // Not JSON — fall through to plain message storage.
    }
  }
  return { type: event.type, data: event.data as Record<string, unknown> };
};

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Thin construction of the shared SessionLifecycleOrchestrator (@mbe/agent-core)
 * with the Prisma-backed store and the injected concurrency gate. All session
 * state transitions live in the orchestrator; this module only adapts the
 * service's `(session: AgentSession)` calling convention onto it.
 */
export function createSessionExecutor(config: SessionExecutorConfig): SessionExecutor {
  const { concurrency, store } = config;

  const orchestrator = createSessionLifecycleOrchestrator({
    store,
    resolveRepoPath: () => resolve(process.env.REPO_PATH ?? process.cwd()),
    runSession,
    concurrency,
    projectEvent,
    // Live-bound so the real Fastify logger — wired in later at boot via
    // setServiceLogger — is used even though this orchestrator may be
    // constructed before that happens (the default executor is lazy).
    logger: { error: (meta, message) => getServiceLogger().error(meta, message) },
  });

  return {
    async executeSession(session: AgentSession): Promise<void> {
      await orchestrator.execute(session.id);
    },
    cancelSession(sessionId: string): Promise<boolean> {
      return orchestrator.cancel(sessionId);
    },
    getActiveSessionCount(): number {
      return orchestrator.getActiveSessionCount();
    },
  };
}

// ── Default instance (backward-compat module-level exports) ───────────

import { sessionLifecycleStore } from "./session-lifecycle-store.js";
import { defaultConcurrency } from "./session-concurrency.js";

// Built lazily on first use so importing this module is side-effect-free — the
// orchestrator is constructed only when a session is actually executed, which
// keeps test doubles for @mbe/agent-core simple.
let _defaultExecutor: SessionExecutor | undefined;
function defaultExecutor(): SessionExecutor {
  _defaultExecutor ??= createSessionExecutor({
    concurrency: defaultConcurrency,
    store: sessionLifecycleStore,
  });
  return _defaultExecutor;
}

export const getActiveSessionCount = (): number => defaultExecutor().getActiveSessionCount();
export const executeSession = (session: AgentSession): Promise<void> =>
  defaultExecutor().executeSession(session);
export const cancelSession = (sessionId: string): Promise<boolean> =>
  defaultExecutor().cancelSession(sessionId);
