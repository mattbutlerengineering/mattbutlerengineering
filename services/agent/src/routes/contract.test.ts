import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { AgentSessionSchema } from "@mbe/types";

// Mock all service dependencies
vi.mock("../services/session.js", () => ({
  sessionService: {
    getById: vi.fn(),
  },
}));

vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn().mockResolvedValue(undefined),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));

vi.mock("../services/database.js", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { sessionService } from "../services/session.js";

const mockSession = {
  id: "session-123",
  status: "PENDING",
  taskDescription: "Fix the login bug",
  branchName: "fix-login",
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  prUrl: null,
  prNumber: null,
  resultText: null,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  numTurns: 0,
  durationMs: 0,
  parentId: null,
  errors: [],
  startedAt: "2026-02-27T00:00:00.000Z",
  completedAt: null,
  createdAt: "2026-02-27T00:00:00.000Z",
  updatedAt: "2026-02-27T00:00:00.000Z",
};

describe("Agent Service API Contract", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("GET /v1/sessions/:id matches AgentSessionSchema", async () => {
    vi.mocked(sessionService.getById).mockResolvedValueOnce(mockSession as any);

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/session-123",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    
    // Validate against Zod schema from @mbe/types
    const result = AgentSessionSchema.safeParse(body.data);
    if (!result.success) {
      console.error("Zod Validation Error:", result.error.format());
    }
    expect(result.success).toBe(true);
  });
});
