import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { ApiError } from "@mbe/types";
import { sessionService } from "../services/session.js";
import { executeSession } from "../services/session-executor.js";

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

function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

// ── Constants ────────────────────────────────────────────────────────

const AGENT_LABEL = "agent";
const AGENT_COMMAND_PATTERN = /^\/agent\s+(.+)/i;
const MAX_CI_RETRIES = 3;
const AGENT_BRANCH_PREFIX = "agent/";

// ── Routes ───────────────────────────────────────────────────────────

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /v1/webhooks/github — Handle GitHub webhook events
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
    },
    async (request, reply) => {
      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (!secret) {
        fastify.log.warn("GITHUB_WEBHOOK_SECRET not configured — rejecting webhook");
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Webhook secret not configured",
          statusCode: 401,
        });
      }

      // Verify signature
      const signature = request.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = JSON.stringify(request.body);

      if (!verifySignature(rawBody, signature, secret)) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid webhook signature",
          statusCode: 401,
        });
      }

      const eventType = request.headers["x-github-event"] as string | undefined;

      switch (eventType) {
        case "issues":
          await handleIssueEvent(fastify, request.body as GitHubIssueEvent);
          break;

        case "issue_comment":
          await handleIssueCommentEvent(fastify, request.body as GitHubIssueCommentEvent);
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
  fastify: { log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void } },
  event: GitHubIssueEvent
): Promise<void> {
  // Only handle "labeled" action with the agent label
  if (event.action !== "labeled") return;
  if (event.label?.name !== AGENT_LABEL) return;

  const taskDescription =
    `Issue #${event.issue.number}: ${event.issue.title}\n\n` +
    `${event.issue.body ?? "No description provided."}\n\n` +
    `Source: ${event.issue.html_url}`;

  fastify.log.info(
    { issueNumber: event.issue.number },
    "Creating session from issue label"
  );

  const session = await sessionService.create({
    taskDescription,
    baseBranch: event.repository.default_branch,
  });

  executeSession(session).catch((err) => {
    fastify.log.error({ sessionId: session.id, err }, "Webhook-triggered session failed");
  });
}

async function handleIssueCommentEvent(
  fastify: { log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void } },
  event: GitHubIssueCommentEvent
): Promise<void> {
  if (event.action !== "created") return;

  // Only handle PR comments (issues with a pull_request field)
  if (!event.issue.pull_request) return;

  const match = event.comment.body.match(AGENT_COMMAND_PATTERN);
  if (!match) return;

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
    taskDescription,
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
    (s) =>
      s.branchName === branch &&
      s.taskDescription.includes("[CI Retry")
  );

  if (retries.length >= MAX_CI_RETRIES) {
    fastify.log.info(
      { branch, retries: retries.length },
      "Max CI retries reached — skipping"
    );
    return;
  }

  const taskDescription =
    `[CI Retry ${retries.length + 1}/${MAX_CI_RETRIES}] ` +
    `Fix CI failure on branch ${branch}.\n\n` +
    `Check run "${event.check_run.name}" failed at commit ${event.check_run.head_sha}.\n` +
    `Review the CI output and fix the failing tests or build errors.`;

  fastify.log.info(
    { branch, attempt: retries.length + 1 },
    "Creating CI retry session"
  );

  const session = await sessionService.create({
    taskDescription,
    baseBranch: event.repository.default_branch,
  });

  executeSession(session).catch((err) => {
    fastify.log.error({ sessionId: session.id, err }, "CI retry session failed");
  });
}
