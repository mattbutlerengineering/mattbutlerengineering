/**
 * Authorization tests for POST /v1/orchestrate.
 *
 * The parent session created for an orchestration must be stamped with the
 * authenticated caller's userId — otherwise it is created ownerless and the
 * caller who started it is 404'd out of their own session by
 * requireSessionAccess's null-owner deny (see services/agent/src/routes/sessions.ts).
 *
 * Uses the same @mbe/auth/fastify mock pattern as sessions-authz.test.ts:
 * the real requireOwnershipOrAdmin + hasPermission run, only plugin wiring
 * and the active user are stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "@mbe/auth/fastify";

// Control which user is active in each test
let currentUser: AuthUser | undefined;

vi.mock("@mbe/auth/fastify", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    authPlugin: vi.fn(async () => {}),
    getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
    requireAuth: vi.fn(async (req: { user?: AuthUser }) => {
      req.user = currentUser;
    }),
  };
});

vi.mock("../services/session.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    sessionService: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
      addEvent: vi.fn(),
      listEvents: vi.fn(),
    },
  };
});

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});

vi.mock("@mbe/agent-core", () => ({
  runOrchestrator: vi.fn(),
  DEFAULT_ORCHESTRATOR_CONFIG: {
    apiBaseUrl: "http://localhost:3003",
    model: "claude-sonnet-4-6",
    sessionModel: "claude-sonnet-4-6",
    maxBudgetPerSession: 1.0,
    maxTurnsPerSession: 50,
    baseBranch: "main",
    maxConcurrentSessions: 3,
  },
}));

import { sessionService } from "../services/session.js";
import { runOrchestrator } from "@mbe/agent-core";
import { buildApp } from "../app.js";

function makeUser(id: string, permissions: string[] = []): AuthUser {
  return {
    id,
    email: `${id}@example.com`,
    raw: {
      sub: id,
      iss: "https://test.auth0.com/",
      aud: ["https://api.example.com"],
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      permissions,
    },
  };
}

const CALLER = makeUser("auth0|orchestrator-caller-1", []);

const baseParentSession = {
  id: "parent-session-1",
  status: "pending" as const,
  taskDescription: "[Orchestrator] Build a notification system",
  branchName: null,
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 200,
  maxBudgetUsd: 6.0,
  prUrl: null,
  prNumber: null,
  resultText: null,
  costUsd: null,
  inputTokens: null,
  outputTokens: null,
  numTurns: null,
  durationMs: null,
  parentId: null,
  errors: [],
  startedAt: null,
  completedAt: null,
  createdAt: "2026-02-27T00:00:00.000Z",
  updatedAt: "2026-02-27T00:00:00.000Z",
};

describe("POST /v1/orchestrate — authorization", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    currentUser = CALLER;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("stamps the authenticated caller's userId on the created parent session", async () => {
    const parentSession = { ...baseParentSession, userId: CALLER.id };
    vi.mocked(sessionService.create).mockResolvedValueOnce(parentSession);
    vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
    vi.mocked(sessionService.addEvent).mockResolvedValue({
      id: "event-1",
      sessionId: "parent-session-1",
      type: "orchestrator:start",
      data: {},
      createdAt: "2026-02-27T00:00:00.000Z",
    });
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: "succeeded",
      childSessionIds: [],
      summary: "Done",
      totalCostUsd: 0.05,
      durationMs: 5000,
    });

    await app.inject({
      method: "POST",
      url: "/v1/orchestrate",
      payload: { taskDescription: "Build a notification system" },
    });

    expect(sessionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: CALLER.id })
    );
  });

  it("lets the caller who started the orchestration read the parent session afterward", async () => {
    const parentSession = { ...baseParentSession, userId: CALLER.id };
    vi.mocked(sessionService.create).mockResolvedValueOnce(parentSession);
    vi.mocked(sessionService.updateStatus).mockResolvedValue(null);
    vi.mocked(sessionService.addEvent).mockResolvedValue({
      id: "event-1",
      sessionId: "parent-session-1",
      type: "orchestrator:start",
      data: {},
      createdAt: "2026-02-27T00:00:00.000Z",
    });
    vi.mocked(runOrchestrator).mockResolvedValueOnce({
      status: "succeeded",
      childSessionIds: [],
      summary: "Done",
      totalCostUsd: 0.05,
      durationMs: 5000,
    });

    const orchestrateResponse = await app.inject({
      method: "POST",
      url: "/v1/orchestrate",
      payload: { taskDescription: "Build a notification system" },
    });
    expect(orchestrateResponse.statusCode).toBe(200);

    // The session created above (with userId stamped) is what GET /:id would
    // load — no longer hidden from the caller who just created it.
    vi.mocked(sessionService.getById).mockResolvedValueOnce(parentSession);

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions/parent-session-1",
    });

    expect(getResponse.statusCode).toBe(200);
  });
});
