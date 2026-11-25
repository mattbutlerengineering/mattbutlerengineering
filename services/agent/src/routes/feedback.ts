/// <reference types="@fastify/rate-limit" />
import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { requireAuth } from "@mbe/auth/fastify";
import { createProblemDetails } from "@mbe/types";
import {
  buildFeedbackIssue,
  createFeedbackIssue,
  feedbackBodySchema,
  isFeedbackConfigured,
  type FeedbackIssueInput,
  type FeedbackIssueResult,
} from "../services/feedback-issue.js";

/**
 * Mounted under the gen prefix because that prefix already routes to agent-api
 * at the DigitalOcean ingress; a bare feedback path would land on
 * reservations-api (the api catch-all).
 */
const API_PREFIX = "/api";
const FEEDBACK_PATH = `${API_PREFIX}/gen/feedback`;
const FEEDBACK_RATE_LIMIT = { max: 5, timeWindow: "1 hour" } as const;
const UNAVAILABLE_DETAIL = "Feedback is not available right now.";

export interface FeedbackRouteOptions {
  /** Test seam: files the issue. Defaults to the GitHub REST transport. */
  readonly createIssue?: (input: FeedbackIssueInput) => Promise<FeedbackIssueResult>;
  /** Test seam: whether the feedback token is present. */
  readonly isConfigured?: () => boolean;
}

export const feedbackRoutes: FastifyPluginAsync<FeedbackRouteOptions> = async (
  fastify,
  options
) => {
  const createIssue = options.createIssue ?? ((input) => createFeedbackIssue(input));
  const isConfigured = options.isConfigured ?? (() => isFeedbackConfigured());

  // Per-user cap by hand after requireAuth: a route-level config.rateLimit would
  // run before request.user exists and key on the IP (gotchas-fastify.md).
  const userLimiter = fastify.createRateLimit({
    max: FEEDBACK_RATE_LIMIT.max,
    timeWindow: FEEDBACK_RATE_LIMIT.timeWindow,
    keyGenerator: (request: FastifyRequest) => request.user?.id ?? request.ip,
  });

  const enforceUserLimit: preHandlerAsyncHookHandler = async (request, reply) => {
    const limit = await userLimiter(request);
    if (limit.isAllowed || !limit.isExceeded) return;

    reply.header("Retry-After", limit.ttlInSeconds);
    return reply
      .code(429)
      .send(
        createProblemDetails(
          429,
          "Too Many Requests",
          "You have sent a lot of feedback recently. Please try again later."
        )
      );
  };

  fastify.get(`${FEEDBACK_PATH}/status`, { preHandler: [requireAuth] }, async () => ({
    success: true,
    data: { available: isConfigured() },
    error: null,
  }));

  fastify.post(
    FEEDBACK_PATH,
    { preHandler: [requireAuth, enforceUserLimit] },
    async (request, reply) => {
      if (!isConfigured()) {
        return reply
          .code(503)
          .send(createProblemDetails(503, "Service Unavailable", UNAVAILABLE_DETAIL));
      }

      const parsed = feedbackBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const detail = parsed.error.issues.map((issue) => issue.message).join(" ");
        return reply.code(400).send(createProblemDetails(400, "Bad Request", detail));
      }

      const userId = request.user?.id;
      if (!userId) {
        return reply
          .code(401)
          .send(createProblemDetails(401, "Unauthorized", "Please sign in again."));
      }

      try {
        const issue = await createIssue(buildFeedbackIssue(parsed.data, userId));
        // The reporter email goes only to the private server log, never the public issue.
        request.log.info(
          { issueNumber: issue.number, userId, replyTo: parsed.data.email },
          "feedback issue filed"
        );
        return reply.code(201).send({
          success: true,
          data: { issueNumber: issue.number, url: issue.url },
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, "feedback issue creation failed");
        return reply
          .code(502)
          .send(
            createProblemDetails(
              502,
              "Bad Gateway",
              "We couldn't send your feedback. Please try again."
            )
          );
      }
    }
  );
};
