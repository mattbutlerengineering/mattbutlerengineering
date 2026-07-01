import { randomUUID } from "node:crypto";
import { DEFAULT_SESSION_CONFIG } from "../types.js";
import type {
  CreateSessionInput,
  SessionLifecycleStore,
  SessionResultPatch,
  StoredEvent,
  StoredSession,
} from "./types.js";
import type { SessionStatus } from "../types.js";

/** Test/CLI-facing store. Drives the orchestrator with zero I/O. */
export interface InMemorySessionStore extends SessionLifecycleStore {
  /** All events recorded for a session, in insertion order. */
  listEvents(id: string): readonly StoredEvent[];
}

/**
 * In-memory implementation of the session storage seam. Updates are immutable:
 * each `updateStatus` replaces the stored record with a new object, so a
 * previously-returned reference is never mutated.
 */
export function createInMemorySessionStore(): InMemorySessionStore {
  const sessions = new Map<string, StoredSession>();
  const events = new Map<string, StoredEvent[]>();

  return {
    async create(input: CreateSessionInput): Promise<StoredSession> {
      const session: StoredSession = {
        id: randomUUID(),
        status: "pending",
        taskDescription: input.taskDescription,
        baseBranch: input.baseBranch ?? DEFAULT_SESSION_CONFIG.baseBranch,
        model: input.model ?? DEFAULT_SESSION_CONFIG.model,
        maxTurns: input.maxTurns ?? DEFAULT_SESSION_CONFIG.maxTurns,
        maxBudgetUsd: input.maxBudgetUsd ?? DEFAULT_SESSION_CONFIG.maxBudgetUsd,
        createPr: input.createPr ?? DEFAULT_SESSION_CONFIG.createPr,
        userId: input.userId ?? null,
        parentId: input.parentId ?? null,
        errors: [],
      };
      sessions.set(session.id, session);
      return session;
    },

    async getById(id: string): Promise<StoredSession | null> {
      return sessions.get(id) ?? null;
    },

    async updateStatus(
      id: string,
      status: SessionStatus,
      patch?: SessionResultPatch,
      opts?: { readonly fromStatus?: readonly SessionStatus[] }
    ): Promise<StoredSession | null> {
      const existing = sessions.get(id);
      if (!existing) return null;
      if (opts?.fromStatus && !opts.fromStatus.includes(existing.status)) return null;

      const updated: StoredSession = {
        ...existing,
        status,
        ...(patch?.branchName !== undefined && { branchName: patch.branchName }),
        ...(patch?.prUrl !== undefined && { prUrl: patch.prUrl }),
        ...(patch?.prNumber !== undefined && { prNumber: patch.prNumber }),
        ...(patch?.resultText !== undefined && { resultText: patch.resultText }),
        ...(patch?.costUsd !== undefined && { costUsd: patch.costUsd }),
        ...(patch?.inputTokens !== undefined && { inputTokens: patch.inputTokens }),
        ...(patch?.outputTokens !== undefined && { outputTokens: patch.outputTokens }),
        ...(patch?.numTurns !== undefined && { numTurns: patch.numTurns }),
        ...(patch?.durationMs !== undefined && { durationMs: patch.durationMs }),
        ...(patch?.errors !== undefined && { errors: [...patch.errors] }),
        ...(patch?.sdkSessionId !== undefined && { sdkSessionId: patch.sdkSessionId }),
      };
      sessions.set(id, updated);
      return updated;
    },

    async addEvent(id: string, type: string, data: Record<string, unknown>): Promise<void> {
      const list = events.get(id) ?? [];
      list.push({ type, data });
      events.set(id, list);
    },

    listEvents(id: string): readonly StoredEvent[] {
      return events.get(id) ?? [];
    },
  };
}
