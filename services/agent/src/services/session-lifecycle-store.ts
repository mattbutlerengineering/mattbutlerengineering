import type {
  CreateSessionInput,
  SessionLifecycleStore,
  SessionResultPatch,
  StoredSession,
} from "@mbe/agent-core";
import type { SessionStatus as LifecycleStatus } from "@mbe/agent-core";
import { isPrismaNotFound } from "@mbe/database";
import type {
  Prisma,
  Session,
  SessionStatus as PrismaSessionStatus,
} from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { mapPrismaEvent } from "./session.js";
import { getSessionEventEmitter } from "./session-event-emitter.js";

// ── Enum translation (the one edge) ───────────────────────────────────
//
// The orchestrator speaks lowercase SessionStatus; Prisma persists the
// uppercase enum. This module is the single place the two vocabularies meet.

function toPrismaStatus(status: LifecycleStatus): PrismaSessionStatus {
  return status.toUpperCase() as PrismaSessionStatus;
}

/**
 * Project a persisted row onto the orchestrator's StoredSession.
 *
 * `createPr` is the persisted column — user intent from the create request —
 * honored verbatim. It is NOT derived from the budget: `createPr: false` with
 * a positive budget must not open a PR, and the publish phase in
 * @mbe/agent-core gates on exactly this flag.
 */
function toStoredSession(row: Session): StoredSession {
  return {
    id: row.id,
    status: row.status.toLowerCase() as LifecycleStatus,
    taskDescription: row.taskDescription,
    baseBranch: row.baseBranch,
    model: row.model,
    maxTurns: row.maxTurns,
    maxBudgetUsd: row.maxBudgetUsd,
    createPr: row.createPr,
    userId: row.userId,
    parentId: row.parentId,
    branchName: row.branchName,
    prUrl: row.prUrl,
    prNumber: row.prNumber,
    resultText: row.resultText,
    costUsd: row.costUsd ?? undefined,
    inputTokens: row.inputTokens ?? undefined,
    outputTokens: row.outputTokens ?? undefined,
    numTurns: row.numTurns ?? undefined,
    durationMs: row.durationMs ?? undefined,
    errors: (row.errors as string[]) ?? [],
    sdkSessionId: row.sdkSessionId,
  };
}

/**
 * Prisma-backed implementation of the SessionLifecycleStore seam — the
 * production adapter, implemented directly on the Prisma client. Tests use
 * the in-memory adapter from @mbe/agent-core.
 */
export const sessionLifecycleStore: SessionLifecycleStore = {
  async create(input: CreateSessionInput): Promise<StoredSession> {
    const row = await prisma.session.create({
      data: {
        taskDescription: input.taskDescription,
        ...(input.baseBranch !== undefined && { baseBranch: input.baseBranch }),
        ...(input.model !== undefined && { model: input.model }),
        ...(input.maxTurns !== undefined && { maxTurns: input.maxTurns }),
        ...(input.maxBudgetUsd !== undefined && { maxBudgetUsd: input.maxBudgetUsd }),
        ...(input.createPr !== undefined && { createPr: input.createPr }),
        ...(input.userId != null && { userId: input.userId }),
        ...(input.parentId != null && { parentId: input.parentId }),
      },
    });
    return toStoredSession(row);
  },

  async getById(id: string): Promise<StoredSession | null> {
    const row = await prisma.session.findUnique({ where: { id } });
    return row ? toStoredSession(row) : null;
  },

  async updateStatus(
    id: string,
    status: LifecycleStatus,
    patch?: SessionResultPatch,
    opts?: { readonly fromStatus?: readonly LifecycleStatus[] }
  ): Promise<StoredSession | null> {
    const prismaStatus = toPrismaStatus(status);
    const now = new Date();
    const data = {
      status: prismaStatus,
      ...(prismaStatus === "RUNNING" && { startedAt: now }),
      ...(["SUCCEEDED", "FAILED", "CANCELLED"].includes(prismaStatus) && { completedAt: now }),
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

    if (opts?.fromStatus) {
      // Compare-and-swap: scope the update to rows still in an expected prior
      // status so the DB enforces the transition. A 0-row update means the
      // CAS lost the race (e.g. the session already reached a terminal
      // state) — signal that with null instead of clobbering.
      const { count } = await prisma.session.updateMany({
        where: { id, status: { in: opts.fromStatus.map(toPrismaStatus) } },
        data,
      });
      if (count === 0) return null;
      const row = await prisma.session.findUnique({ where: { id } });
      return row ? toStoredSession(row) : null;
    }

    try {
      const row = await prisma.session.update({ where: { id }, data });
      return toStoredSession(row);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async addEvent(id: string, type: string, data: Record<string, unknown>): Promise<void> {
    const event = await prisma.sessionEvent.create({
      data: { sessionId: id, type, data: data as Prisma.InputJsonValue },
    });
    // Publish on the seam so SSE subscribers receive it live, without polling.
    getSessionEventEmitter().publish(mapPrismaEvent(event));
  },
};
