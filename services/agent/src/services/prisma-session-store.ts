import type {
  CreateSessionInput,
  SessionLifecycleStore,
  SessionResultPatch,
  StoredSession,
} from "@mbe/agent-core";
import type { SessionStatus as LifecycleStatus } from "@mbe/agent-core";
import type { AgentSession } from "@mbe/types";
import type { SessionStatus as PrismaSessionStatus } from "../generated/prisma/index.js";
import type { sessionService as SessionServiceType } from "./session.js";

/** Map the orchestrator's lowercase status to the Prisma uppercase enum. */
function toPrismaStatus(status: LifecycleStatus): PrismaSessionStatus {
  return status.toUpperCase() as PrismaSessionStatus;
}

/**
 * Project a persisted AgentSession onto the orchestrator's StoredSession.
 *
 * `createPr` is derived from the budget (a no-budget session never opens a PR) —
 * this preserves the prior session-executor behaviour, which ignored the stored
 * `createPr` column and gated PR creation on `maxBudgetUsd > 0`.
 */
function toStoredSession(session: AgentSession): StoredSession {
  return {
    id: session.id,
    status: session.status,
    taskDescription: session.taskDescription,
    baseBranch: session.baseBranch,
    model: session.model,
    maxTurns: session.maxTurns,
    maxBudgetUsd: session.maxBudgetUsd,
    createPr: session.maxBudgetUsd > 0,
    userId: session.userId,
    parentId: session.parentId,
    branchName: session.branchName,
    prUrl: session.prUrl,
    prNumber: session.prNumber,
    resultText: session.resultText,
    costUsd: session.costUsd ?? undefined,
    inputTokens: session.inputTokens ?? undefined,
    outputTokens: session.outputTokens ?? undefined,
    numTurns: session.numTurns ?? undefined,
    durationMs: session.durationMs ?? undefined,
    errors: session.errors,
  };
}

/**
 * Prisma-backed implementation of the SessionLifecycleStore seam, delegating to
 * the existing sessionService. This is the production adapter; tests use the
 * in-memory adapter from @mbe/agent-core.
 */
export function createPrismaSessionStore(
  sessionService: typeof SessionServiceType
): SessionLifecycleStore {
  return {
    async create(input: CreateSessionInput): Promise<StoredSession> {
      const session = await sessionService.create({
        taskDescription: input.taskDescription,
        ...(input.baseBranch !== undefined && { baseBranch: input.baseBranch }),
        ...(input.model !== undefined && { model: input.model }),
        ...(input.maxTurns !== undefined && { maxTurns: input.maxTurns }),
        ...(input.maxBudgetUsd !== undefined && { maxBudgetUsd: input.maxBudgetUsd }),
        ...(input.createPr !== undefined && { createPr: input.createPr }),
        ...(input.userId != null && { userId: input.userId }),
        ...(input.parentId != null && { parentId: input.parentId }),
      });
      return toStoredSession(session);
    },

    async getById(id: string): Promise<StoredSession | null> {
      const session = await sessionService.getById(id);
      return session ? toStoredSession(session) : null;
    },

    async updateStatus(
      id: string,
      status: LifecycleStatus,
      patch?: SessionResultPatch
    ): Promise<StoredSession | null> {
      // Preserve the exact sessionService call shape — no third arg when there
      // is no result patch (the RUNNING transition).
      let session: AgentSession | null;
      if (patch === undefined) {
        session = await sessionService.updateStatus(id, toPrismaStatus(status));
      } else {
        const { errors, ...rest } = patch;
        const result = errors !== undefined ? { ...rest, errors: [...errors] } : rest;
        session = await sessionService.updateStatus(id, toPrismaStatus(status), result);
      }
      return session ? toStoredSession(session) : null;
    },

    async addEvent(id: string, type: string, data: Record<string, unknown>): Promise<void> {
      await sessionService.addEvent(id, type, data);
    },
  };
}
