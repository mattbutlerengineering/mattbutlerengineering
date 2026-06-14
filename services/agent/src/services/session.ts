import type { Prisma, Session, SessionEvent, SessionStatus } from "../generated/prisma/index.js";
import type { AgentSession, AgentSessionEvent, Pagination } from "@mbe/types";
import { paginate, toPaginationMeta } from "@mbe/database";
import { prisma } from "./database.js";
import { getSessionEventEmitter } from "./session-event-emitter.js";

function isPrismaNotFound(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

function mapPrismaSession(session: Session): AgentSession {
  return {
    id: session.id,
    status: session.status.toLowerCase() as AgentSession["status"],
    taskDescription: session.taskDescription,
    userId: session.userId,
    branchName: session.branchName,
    baseBranch: session.baseBranch,
    model: session.model,
    maxTurns: session.maxTurns,
    maxBudgetUsd: session.maxBudgetUsd,
    prUrl: session.prUrl,
    prNumber: session.prNumber,
    resultText: session.resultText,
    costUsd: session.costUsd,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    numTurns: session.numTurns,
    durationMs: session.durationMs,
    parentId: session.parentId,
    errors: (session.errors as string[]) ?? [],
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function mapPrismaEvent(event: SessionEvent): AgentSessionEvent {
  return {
    id: event.id,
    sessionId: event.sessionId,
    type: event.type,
    data: (event.data as Record<string, unknown>) ?? {},
    createdAt: event.createdAt.toISOString(),
  };
}

interface ListOptions {
  readonly page: number;
  readonly limit: number;
  readonly status?: SessionStatus;
}

export const sessionService = {
  async list(options: ListOptions): Promise<{ data: AgentSession[]; pagination: Pagination }> {
    const { page, limit, status } = options;
    const where: Prisma.SessionWhereInput = status ? { status } : {};

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        ...paginate({ page, limit }),
        orderBy: { createdAt: "desc" },
      }),
      prisma.session.count({ where }),
    ]);

    return {
      data: sessions.map(mapPrismaSession),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<AgentSession | null> {
    const session = await prisma.session.findUnique({ where: { id } });
    return session ? mapPrismaSession(session) : null;
  },

  async create(data: {
    taskDescription: string;
    userId?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    baseBranch?: string;
    createPr?: boolean;
    parentId?: string;
  }): Promise<AgentSession> {
    const session = await prisma.session.create({
      data: {
        taskDescription: data.taskDescription,
        ...(data.userId !== undefined && { userId: data.userId }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.maxTurns !== undefined && { maxTurns: data.maxTurns }),
        ...(data.maxBudgetUsd !== undefined && { maxBudgetUsd: data.maxBudgetUsd }),
        ...(data.baseBranch !== undefined && { baseBranch: data.baseBranch }),
        ...(data.createPr !== undefined && { createPr: data.createPr }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
      },
    });
    return mapPrismaSession(session);
  },

  async updateStatus(
    id: string,
    status: SessionStatus,
    result?: {
      branchName?: string;
      prUrl?: string;
      prNumber?: number;
      resultText?: string;
      costUsd?: number;
      inputTokens?: number;
      outputTokens?: number;
      numTurns?: number;
      durationMs?: number;
      errors?: string[];
      sdkSessionId?: string;
    }
  ): Promise<AgentSession | null> {
    try {
      const now = new Date();
      const session = await prisma.session.update({
        where: { id },
        data: {
          status,
          ...(status === "RUNNING" && { startedAt: now }),
          ...(["SUCCEEDED", "FAILED", "CANCELLED"].includes(status) && {
            completedAt: now,
          }),
          ...(result?.branchName !== undefined && { branchName: result.branchName }),
          ...(result?.prUrl !== undefined && { prUrl: result.prUrl }),
          ...(result?.prNumber !== undefined && { prNumber: result.prNumber }),
          ...(result?.resultText !== undefined && { resultText: result.resultText }),
          ...(result?.costUsd !== undefined && { costUsd: result.costUsd }),
          ...(result?.inputTokens !== undefined && { inputTokens: result.inputTokens }),
          ...(result?.outputTokens !== undefined && { outputTokens: result.outputTokens }),
          ...(result?.numTurns !== undefined && { numTurns: result.numTurns }),
          ...(result?.durationMs !== undefined && { durationMs: result.durationMs }),
          ...(result?.errors !== undefined && { errors: result.errors }),
          ...(result?.sdkSessionId !== undefined && { sdkSessionId: result.sdkSessionId }),
        },
      });
      return mapPrismaSession(session);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.session.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },

  async findStaleSessions(thresholdMs: number): Promise<string[]> {
    const thresholdSeconds = Math.floor(thresholdMs / 1000);
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id
        FROM sessions s
       WHERE s.status = 'RUNNING'
         AND COALESCE(
               (SELECT MAX(e.created_at) FROM session_events e WHERE e.session_id = s.id),
               s.updated_at
             ) < NOW() - INTERVAL '1 second' * ${thresholdSeconds}
       ORDER BY s.updated_at ASC
    `;
    return rows.map((r) => r.id);
  },

  async findByStatus(status: SessionStatus): Promise<AgentSession[]> {
    const sessions = await prisma.session.findMany({
      where: { status },
      orderBy: { updatedAt: "asc" },
    });
    return sessions.map(mapPrismaSession);
  },

  async getLastEvent(sessionId: string): Promise<AgentSessionEvent | null> {
    const event = await prisma.sessionEvent.findFirst({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });
    return event ? mapPrismaEvent(event) : null;
  },

  async addEvent(
    sessionId: string,
    type: string,
    data: Record<string, unknown> = {}
  ): Promise<AgentSessionEvent> {
    const event = await prisma.sessionEvent.create({
      data: { sessionId, type, data: data as Prisma.InputJsonValue },
    });
    const mapped = mapPrismaEvent(event);
    // Publish on the seam so SSE subscribers receive it live, without polling.
    getSessionEventEmitter().publish(mapped);
    return mapped;
  },

  async listEvents(sessionId: string, afterId?: string): Promise<AgentSessionEvent[]> {
    const where: Prisma.SessionEventWhereInput = { sessionId };

    if (afterId) {
      const cursor = await prisma.sessionEvent.findUnique({
        where: { id: afterId },
        select: { createdAt: true },
      });
      if (cursor) {
        where.createdAt = { gt: cursor.createdAt };
      }
    }

    const events = await prisma.sessionEvent.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return events.map(mapPrismaEvent);
  },
};
