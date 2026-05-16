import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyPluginAsync } from "fastify";
import { type ApiError, createProblemDetails } from "@mbe/types";
import { extractIssueIntent } from "@mbe/agent-core";
import { sessionService } from "../services/session.js";
import { executeSession } from "../services/session-executor.js";

const GITHUB_API_BASE = "https://api.github.com";
const REQUIRED_PERMISSION = "write";

interface CollaboratorPermission {
  permission: string;
  role_name: string;
}

// ── Types for GitHub webhook payloads ────────────────────────────────

interface GitHubIssueEvent {
  action: string;
  label?: { name: string };
  issue: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    labels: Array<{ name: string }>;
  };
  repository: {
    full_name: string;
    default_branch: string;
  };
  sender: { login: string; type: string };
}

interface GitHubIssueCommentEvent {
  action: string;
  comment: {
    body: string;
    html_url: string;
    user: { login: string };
  };
  issue: {
    number: number;
    title: string;
    html_url: string;
    pull_request?: { url: string };
  };
  repository: {
    full_name: string;
    default_branch: string;
  };
  sender: { login: string; type: string };
}

interface GitHubCheckRunEvent {
  action: string;
  check_run: {
    conclusion: string | null;
    name: string;
    head_sha: string;
    check_suite: {
      head_branch: string | null;
    };
  };
  repository: {
    full_name: string;
    default_branch: string;
  };
}

// ── Signature verification ───────────────────────────────────────────

function verifySignature(payload: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── Constants ────────────────────────────────────────────────────────

const GITHUB_REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

const AGENT_LABEL = "agent";
const AGENT_COMMAND_PATTERN = /^\/agent\s+(.+)/i;
const MAX_CI_RETRIES = 3;
const AGENT_BRANCH_PREFIX = "agent/";

async function checkCollaboratorPermission(
  username: string,
  repository: string,
  githubToken: string
): Promise<boolean> {
  if (!GITHUB_REPO_RE.test(repository) || !GITHUB_USERNAME_RE.test(username)) {
    return false;
  }

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${repository}/collaborators/${username}/permission`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "mattbutlerengineering-agent-service",
        },
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as CollaboratorPermission;
    const permissionLevel = data.permission || data.role_name;

    const permissionHierarchy: Record<string, number> = {
      admin: 4,
      maintain: 3,
      write: 2,
      read: 1,
      none: 0,
    };

    const userLevel = permissionHierarchy[permissionLevel] ?? 0;
    const requiredLevel = permissionHierarchy[REQUIRED_PERMISSION] ?? 2;

    return userLevel >= requiredLevel;
  } catch {
    return false;
  }
}

// ── Routes ───────────────────────────────────────────────────────────

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Capture raw request body before Fastify parses JSON.
  // GitHub signs the original bytes; re-serializing via JSON.stringify
  // can produce a different byte sequence and break HMAC verification.
  fastify.addHook("preParsing", async (request, _reply, payload) => {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    }
    const rawBody = Buffer.concat(chunks);
    (request as unknown as Record<string, unknown>).rawBody = rawBody;
    return Readable.from(rawBody);
  });

  // POST /v1/webhooks/github — Handle GitHub webhook events
  // github[js/missing-rate-limiting] — restrictive limit for high-impact webhook
  fastify.post<{
    Body: unknown;
    Reply: { received: true } | ApiError;
  }>(
    "/github",
    {
      schema: {
        summary: "GitHub webhook receiver",
        operationId: "handleGitHubWebhook",
        description:
          "Handles GitHub webhook events to automatically trigger agent sessions. " +
          "Supports: issue labeled 'agent', PR comments with '/agent', and CI failure retries.",
        tags: ["Webhooks"],
        response: {
          200: {
            type: "object",
            properties: { received: { type: "boolean" } },
          },
          401: { $ref: "AgentError#" },
        },
      },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!secret) {
        fastify.log.warn("GITHUB_WEBHOOK_SECRET not configured — rejecting webhook");
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "Webhook secret not configured"));
      }

      // Verify signature against the original raw bytes (not re-serialized JSON)
      const signature = request.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = (request as unknown as Record<string, unknown>).rawBody as Buffer;

      if (!verifySignature(rawBody, signature, secret)) {
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "Invalid webhook signature"));
      }

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        fastify.log.warn("GITHUB_TOKEN not configured — cannot verify collaborator permissions");
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "GitHub token not configured"));
      }

      const eventType = request.headers["x-github-event"] as string | undefined;

      switch (eventType) {
        case "issues":
          await handleIssueEvent(fastify, request.body as GitHubIssueEvent, githubToken);
          break;

        case "issue_comment":
          await handleIssueCommentEvent(
            fastify,
            request.body as GitHubIssueCommentEvent,
            githubToken
          );
          break;

        case "check_run":
          await handleCheckRunEvent(fastify, request.body as GitHubCheckRunEvent);
          break;

        default:
          fastify.log.debug({ eventType }, "Ignoring unhandled GitHub event");
      }

      return { received: true };
    }
  );
};

// ── Event handlers ───────────────────────────────────────────────────

async function handleIssueEvent(
  fastify: {
    log: {
      info: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    };
  },
  event: GitHubIssueEvent,
  githubToken: string
): Promise<void> {
  // Only handle "labeled" action with the agent label
  if (event.action !== "labeled") return;
  if (event.label?.name !== AGENT_LABEL) return;

  const hasPermission = await checkCollaboratorPermission(
    event.sender.login,
    event.repository.full_name,
    githubToken
  );

  if (!hasPermission) {
    fastify.log.warn(
      { user: event.sender.login, issue: event.issue.number },
      "Unauthorized user attempted to trigger agent session"
    );
    return;
  }

  // Attempt structured intent extraction via Haiku
  const intent = await extractIssueIntent(
    event.issue.title,
    event.issue.body ?? "",
    event.issue.number
  );

  let taskDescription: string;
  if (intent) {
    taskDescription = intent.taskDescription;
    fastify.log.info(
      { issueNumber: event.issue.number, scope: intent.estimatedScope },
      "Issue intent extracted"
    );
  } else {
    // Fall back to raw concatenation if extraction fails
    taskDescription =
      `Issue #${event.issue.number}: ${event.issue.title}\n\n` +
      `${event.issue.body ?? "No description provided."}\n\n` +
      `Source: ${event.issue.html_url}`;
    fastify.log.warn(
      { issueNumber: event.issue.number },
      "Intent extraction failed — using raw issue text"
    );
  }

  const session = await sessionService.create({
    taskDescription: `<task>\n${taskDescription}\n</task>`,
    baseBranch: event.repository.default_branch,
  });

  executeSession(session).catch((err) => {
    fastify.log.error({ sessionId: session.id, err }, "Webhook-triggered session failed");
  });
}

async function handleIssueCommentEvent(
  fastify: {
    log: {
      info: (...args: unknown[]) => void;
      warn: (...args: unknown[]) => void;
      error: (...args: unknown[]) => void;
    };
  },
  event: GitHubIssueCommentEvent,
  githubToken: string
): Promise<void> {
  if (event.action !== "created") return;

  // Only handle PR comments (issues with a pull_request field)
  if (!event.issue.pull_request) return;

  const match = event.comment.body.match(AGENT_COMMAND_PATTERN);
  if (!match) return;

  const hasPermission = await checkCollaboratorPermission(
    event.comment.user.login,
    event.repository.full_name,
    githubToken
  );

  if (!hasPermission) {
    fastify.log.warn(
      { user: event.comment.user.login, pr: event.issue.number },
      "Unauthorized user attempted to trigger agent session via comment"
    );
    return;
  }

  const taskInstruction = match[1]!.trim();

  const taskDescription =
    `PR #${event.issue.number}: ${event.issue.title}\n\n` +
    `Instruction from @${event.comment.user.login}: ${taskInstruction}\n\n` +
    `Source: ${event.comment.html_url}`;

  fastify.log.info(
    { prNumber: event.issue.number, user: event.comment.user.login },
    "Creating session from PR comment"
  );

  const session = await sessionService.create({
    taskDescription: `<task>\n${taskDescription}\n</task>`,
    baseBranch: event.repository.default_branch,
  });

  executeSession(session).catch((err) => {
    fastify.log.error({ sessionId: session.id, err }, "PR comment-triggered session failed");
  });
}

async function handleCheckRunEvent(
  fastify: { log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void } },
  event: GitHubCheckRunEvent
): Promise<void> {
  if (event.action !== "completed") return;
  if (event.check_run.conclusion !== "failure") return;

  // Only retry on agent-created branches
  const branch = event.check_run.check_suite.head_branch;
  if (!branch || !branch.startsWith(AGENT_BRANCH_PREFIX)) return;

  // Check how many retry sessions already exist for this branch
  const existing = await sessionService.list({ page: 1, limit: 100 });
  const retries = existing.data.filter(
    (s) => s.branchName === branch && s.taskDescription.includes("[CI Retry")
  );

  if (retries.length >= MAX_CI_RETRIES) {
    fastify.log.info({ branch, retries: retries.length }, "Max CI retries reached — skipping");
    return;
  }

  const taskDescription =
    `[CI Retry ${retries.length + 1}/${MAX_CI_RETRIES}] ` +
    `Fix CI failure on branch ${branch}.\n\n` +
    `Check run "${event.check_run.name}" failed at commit ${event.check_run.head_sha}.\n` +
    `Review the CI output and fix the failing tests or build errors.`;

  fastify.log.info({ branch, attempt: retries.length + 1 }, "Creating CI retry session");

  const session = await sessionService.create({
    taskDescription: `<task>\n${taskDescription}\n</task>`,
    baseBranch: event.repository.default_branch,
  });

  executeSession(session).catch((err) => {
    fastify.log.error({ sessionId: session.id, err }, "CI retry session failed");
  });
}
