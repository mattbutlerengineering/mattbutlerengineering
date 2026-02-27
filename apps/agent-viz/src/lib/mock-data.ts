import type { Session, SessionEvent } from "../types";

let eventCounter = 0;

function makeId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeEventId(): string {
  eventCounter += 1;
  return `evt-${eventCounter}`;
}

// ── Static mock sessions ────────────────────────────────────────────

const parentId = "orch-001";
const childIds = ["sess-001", "sess-002", "sess-003"];

const baseSession: Omit<Session, "id" | "taskDescription" | "status" | "parentId"> = {
  branchName: null,
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  prUrl: null,
  prNumber: null,
  resultText: null,
  costUsd: null,
  inputTokens: null,
  outputTokens: null,
  numTurns: null,
  durationMs: null,
  errors: [],
  startedAt: null,
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const MOCK_SESSIONS: readonly Session[] = [
  {
    ...baseSession,
    id: parentId,
    taskDescription: "Add logging to services/users",
    status: "running",
    parentId: null,
  },
  {
    ...baseSession,
    id: childIds[0],
    taskDescription: "Add request logging middleware",
    status: "succeeded",
    parentId,
    branchName: "agent/add-request-logging",
    prUrl: "https://github.com/org/repo/pull/42",
    prNumber: 42,
    costUsd: 0.32,
    durationMs: 45000,
    numTurns: 12,
  },
  {
    ...baseSession,
    id: childIds[1],
    taskDescription: "Add error logging to route handlers",
    status: "running",
    parentId,
    costUsd: 0.18,
  },
  {
    ...baseSession,
    id: childIds[2],
    taskDescription: "Add structured log format with correlation IDs",
    status: "pending",
    parentId,
  },
];

// ── Event sequence generator ────────────────────────────────────────

interface MockEventTemplate {
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly delayMs: number;
}

const CHILD_EVENT_SEQUENCE: readonly MockEventTemplate[] = [
  {
    type: "session:start",
    data: { message: "Session execution started" },
    delayMs: 0,
  },
  {
    type: "session:assistant",
    data: { textPreview: "Let me analyze the codebase to understand the current logging setup..." },
    delayMs: 800,
  },
  {
    type: "session:tool_use",
    data: { toolName: "Glob", toolInput: { pattern: "**/*.ts" } },
    delayMs: 1500,
  },
  {
    type: "session:tool_use",
    data: { toolName: "Read", toolInput: { file_path: "src/app.ts" } },
    delayMs: 2200,
  },
  {
    type: "session:assistant",
    data: { textPreview: "I can see the Fastify app setup. I'll add a request logging plugin..." },
    delayMs: 3000,
  },
  {
    type: "session:tool_use",
    data: { toolName: "Edit", toolInput: { file_path: "src/app.ts" } },
    delayMs: 3800,
  },
  {
    type: "session:tool_use",
    data: { toolName: "Write", toolInput: { file_path: "src/plugins/logger.ts" } },
    delayMs: 4500,
  },
  {
    type: "session:tool_use",
    data: { toolName: "Bash", toolInput: { command: "pnpm test" } },
    delayMs: 5500,
  },
  {
    type: "session:assistant",
    data: { textPreview: "All tests pass. Creating a PR with the logging changes." },
    delayMs: 7000,
  },
  {
    type: "session:complete",
    data: { status: "SUCCEEDED", costUsd: 0.42, prUrl: "https://github.com/org/repo/pull/43" },
    delayMs: 8000,
  },
];

export function createMockEventStream(
  sessionId: string,
  onEvent: (event: SessionEvent) => void
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const template of CHILD_EVENT_SEQUENCE) {
    const timer = setTimeout(() => {
      onEvent({
        id: makeEventId(),
        sessionId,
        type: template.type,
        data: { ...template.data },
        createdAt: new Date().toISOString(),
      });
    }, template.delayMs);
    timers.push(timer);
  }

  return () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  };
}

export { makeId };
