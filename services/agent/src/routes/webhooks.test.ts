import { createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

// Mock all service dependencies
vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    addEvent: vi.fn(),
    listEvents: vi.fn(),
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

vi.stubGlobal("fetch", vi.fn());

const mockFetch = vi.mocked(fetch);

import { sessionService } from "../services/session.js";
import { executeSession } from "../services/session-executor.js";
import { buildApp } from "../app.js";

const WEBHOOK_SECRET = "test-webhook-secret";

const mockSession = {
  id: "session-from-webhook",
  status: "pending" as const,
  taskDescription: "Test task",
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
  parentId: null,
  errors: [],
  startedAt: null,
  completedAt: null,
  createdAt: "2026-02-27T00:00:00.000Z",
  updatedAt: "2026-02-27T00:00:00.000Z",
};

function signPayload(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

describe("Webhook Routes", () => {
  let app: FastifyInstance;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.GITHUB_TOKEN = "test-github-token";
    app = await buildApp({ logger: false });
    await app.ready();
    vi.mocked(sessionService.create).mockResolvedValue(mockSession);
  });

  afterEach(async () => {
    process.env = originalEnv;
    await app.close();
    vi.clearAllMocks();
  });

  describe("POST /v1/webhooks/github", () => {
    it("returns 401 when signature is missing", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/github",
        payload: { action: "labeled" },
        headers: {
          "x-github-event": "issues",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 when signature is invalid", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/github",
        payload: { action: "labeled" },
        headers: {
          "x-github-event": "issues",
          "x-hub-signature-256": "sha256=invalid",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 when secret is not configured", async () => {
      delete process.env.GITHUB_WEBHOOK_SECRET;

      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/github",
        payload: { action: "labeled" },
        headers: {
          "x-github-event": "issues",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    describe("issue labeled event", () => {
      const issuePayload = {
        action: "labeled",
        label: { name: "agent" },
        issue: {
          number: 42,
          title: "Fix the login bug",
          body: "The login page throws a 500 error",
          html_url: "https://github.com/org/repo/issues/42",
          labels: [{ name: "agent" }, { name: "bug" }],
        },
        repository: {
          full_name: "org/repo",
          default_branch: "main",
        },
        sender: { login: "collaborator", type: "User" },
      };

      it("creates a session when issue is labeled 'agent'", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ permission: "write" }),
        } as Response);

        const payloadStr = JSON.stringify(issuePayload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        const response = await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload: issuePayload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ received: true });

        expect(vi.mocked(sessionService.create)).toHaveBeenCalledWith(
          expect.objectContaining({
            taskDescription: expect.stringContaining("Fix the login bug"),
            baseBranch: "main",
          })
        );

        expect(vi.mocked(executeSession)).toHaveBeenCalledWith(mockSession);
      });

      it("ignores non-agent labels", async () => {
        const payload = { ...issuePayload, label: { name: "bug" } };
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("ignores non-labeled actions", async () => {
        const payload = { ...issuePayload, action: "opened" };
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });
    });

    describe("SSRF protection in collaborator permission check", () => {
      const makeIssuePayload = (repo: string, sender: string) => ({
        action: "labeled",
        label: { name: "agent" },
        issue: {
          number: 99,
          title: "SSRF test issue",
          body: "Test body",
          html_url: `https://github.com/${repo}/issues/99`,
          labels: [{ name: "agent" }],
        },
        repository: {
          full_name: repo,
          default_branch: "main",
        },
        sender: { login: sender, type: "User" },
      });

      it("rejects repository with path traversal (../../evil.com)", async () => {
        const payload = makeIssuePayload("../../evil.com", "alice");
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        // Permission check should fail (returns false), so no session created
        expect(mockFetch).not.toHaveBeenCalled();
        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("rejects repository with query string injection (evil.com/foo?)", async () => {
        const payload = makeIssuePayload("evil.com/foo?", "alice");
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        expect(mockFetch).not.toHaveBeenCalled();
        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("rejects username with path traversal (../evil)", async () => {
        const payload = makeIssuePayload("org/repo", "../evil");
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        expect(mockFetch).not.toHaveBeenCalled();
        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("rejects repository with URL scheme injection", async () => {
        const payload = makeIssuePayload("http://evil.com/x", "alice");
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        expect(mockFetch).not.toHaveBeenCalled();
        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("rejects username with encoded characters (%2F)", async () => {
        const payload = makeIssuePayload("org/repo", "alice%2F..%2Fevil");
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        expect(mockFetch).not.toHaveBeenCalled();
        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("allows valid repository and username with hyphens and dots", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ permission: "write" }),
        } as Response);

        const payload = makeIssuePayload("my-org.corp/my-repo.js", "alice-bob.dev");
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issues",
            "x-hub-signature-256": signature,
          },
        });

        // Valid inputs should reach the GitHub API
        expect(mockFetch).toHaveBeenCalledWith(
          "https://api.github.com/repos/my-org.corp/my-repo.js/collaborators/alice-bob.dev/permission",
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: expect.stringContaining("Bearer"),
            }),
          })
        );
      });
    });

    describe("PR comment event", () => {
      const commentPayload = {
        action: "created",
        comment: {
          body: "/agent fix the failing test",
          html_url: "https://github.com/org/repo/pull/10#issuecomment-1",
          user: { login: "alice" },
        },
        issue: {
          number: 10,
          title: "Add user auth",
          html_url: "https://github.com/org/repo/pull/10",
          pull_request: { url: "https://api.github.com/repos/org/repo/pulls/10" },
        },
        repository: {
          full_name: "org/repo",
          default_branch: "main",
        },
        sender: { login: "alice", type: "User" },
      };

      it("creates a session from /agent command in PR comment", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ permission: "write" }),
        } as Response);

        const payloadStr = JSON.stringify(commentPayload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        const response = await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload: commentPayload,
          headers: {
            "x-github-event": "issue_comment",
            "x-hub-signature-256": signature,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(sessionService.create)).toHaveBeenCalledWith(
          expect.objectContaining({
            taskDescription: expect.stringContaining("fix the failing test"),
          })
        );
      });

      it("ignores comments without /agent command", async () => {
        const payload = {
          ...commentPayload,
          comment: { ...commentPayload.comment, body: "LGTM!" },
        };
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issue_comment",
            "x-hub-signature-256": signature,
          },
        });

        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("ignores comments on regular issues (not PRs)", async () => {
        const payload = {
          ...commentPayload,
          issue: { ...commentPayload.issue, pull_request: undefined },
        };
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload,
          headers: {
            "x-github-event": "issue_comment",
            "x-hub-signature-256": signature,
          },
        });

        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });
    });

    describe("check run event (CI retry)", () => {
      const checkRunPayload = {
        action: "completed",
        check_run: {
          conclusion: "failure",
          name: "test",
          head_sha: "abc123",
          check_suite: {
            head_branch: "agent/fix-login-bug",
          },
        },
        repository: {
          full_name: "org/repo",
          default_branch: "main",
        },
      };

      it("creates a retry session for failed CI on agent branch", async () => {
        vi.mocked(sessionService.list).mockResolvedValueOnce({
          data: [],
          pagination: {
            page: 1,
            limit: 100,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        });

        const payloadStr = JSON.stringify(checkRunPayload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        const response = await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload: checkRunPayload,
          headers: {
            "x-github-event": "check_run",
            "x-hub-signature-256": signature,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(vi.mocked(sessionService.create)).toHaveBeenCalledWith(
          expect.objectContaining({
            taskDescription: expect.stringContaining("[CI Retry 1/3]"),
          })
        );
      });

      it("skips retry when max retries reached", async () => {
        const retries = Array.from({ length: 3 }, (_, i) => ({
          ...mockSession,
          id: `retry-${i}`,
          branchName: "agent/fix-login-bug",
          taskDescription: `[CI Retry ${i + 1}/3] Fix CI failure`,
        }));

        vi.mocked(sessionService.list).mockResolvedValueOnce({
          data: retries,
          pagination: {
            page: 1,
            limit: 100,
            total: 3,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        });

        const payloadStr = JSON.stringify(checkRunPayload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload: checkRunPayload,
          headers: {
            "x-github-event": "check_run",
            "x-hub-signature-256": signature,
          },
        });

        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("ignores non-agent branches", async () => {
        const payload = {
          ...checkRunPayload,
          check_run: {
            ...checkRunPayload.check_run,
            check_suite: { head_branch: "feature/something" },
          },
        };
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload: payload,
          headers: {
            "x-github-event": "check_run",
            "x-hub-signature-256": signature,
          },
        });

        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });

      it("ignores successful check runs", async () => {
        const payload = {
          ...checkRunPayload,
          check_run: {
            ...checkRunPayload.check_run,
            conclusion: "success",
          },
        };
        const payloadStr = JSON.stringify(payload);
        const signature = signPayload(payloadStr, WEBHOOK_SECRET);

        await app.inject({
          method: "POST",
          url: "/v1/webhooks/github",
          payload: payload,
          headers: {
            "x-github-event": "check_run",
            "x-hub-signature-256": signature,
          },
        });

        expect(vi.mocked(sessionService.create)).not.toHaveBeenCalled();
      });
    });

    it("returns 200 for unhandled event types", async () => {
      const payload = { action: "created" };
      const payloadStr = JSON.stringify(payload);
      const signature = signPayload(payloadStr, WEBHOOK_SECRET);

      const response = await app.inject({
        method: "POST",
        url: "/v1/webhooks/github",
        payload,
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256": signature,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ received: true });
    });
  });
});
