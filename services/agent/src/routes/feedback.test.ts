import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

let currentUserId: string | undefined = "user-1";

vi.mock("@mbe/auth/fastify", () => ({
  requireAuth: vi.fn(
    async (
      req: { user?: { id: string } },
      reply: { code: (n: number) => { send: (b: unknown) => unknown } }
    ) => {
      if (!currentUserId) {
        return reply.code(401).send({
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          detail: "Sign in.",
        });
      }
      req.user = { id: currentUserId };
    }
  ),
}));

import { feedbackRoutes, type FeedbackRouteOptions } from "./feedback.js";

const VALID_BODY = {
  type: "bug",
  message: "The timeline freezes when I drag a booking onto a closed table.",
  context: {
    app: "hospitality",
    route: "/timeline",
    viewport: "1280x800",
    version: "abc1234",
  },
};

async function build(options: FeedbackRouteOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: true, max: 1000, timeWindow: "1 minute" });
  await app.register(feedbackRoutes, options);
  await app.ready();
  return app;
}

describe("POST /api/gen/feedback", () => {
  let app: FastifyInstance;
  const createIssue = vi.fn();

  beforeEach(() => {
    currentUserId = "user-1";
    createIssue.mockReset();
    createIssue.mockResolvedValue({
      number: 321,
      url: "https://github.com/o/r/issues/321",
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("files an issue and answers the standard envelope", async () => {
    app = await build({ createIssue, isConfigured: () => true });
    const res = await app.inject({ method: "POST", url: "/api/gen/feedback", payload: VALID_BODY });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      success: true,
      data: { issueNumber: 321, url: "https://github.com/o/r/issues/321" },
      error: null,
    });
    const input = createIssue.mock.calls[0]![0] as {
      title: string;
      body: string;
      labels: string[];
    };
    expect(input.title).toBe(
      "[Feedback] bug: The timeline freezes when I drag a booking onto a closed tab"
    );
    expect(input.labels).toEqual(["feedback", "needs-triage"]);
    expect(input.labels).not.toContain("ready");
    expect(input.body).toContain("hospitality");
    expect(input.body).toContain("/timeline");
    expect(input.body).toContain("user-1");
  });

  it("never writes the reporter email into the issue", async () => {
    app = await build({ createIssue, isConfigured: () => true });
    await app.inject({
      method: "POST",
      url: "/api/gen/feedback",
      payload: { ...VALID_BODY, email: "reporter@example.com" },
    });

    const input = createIssue.mock.calls[0]![0] as { title: string; body: string };
    expect(input.title).not.toContain("reporter@example.com");
    expect(input.body).not.toContain("reporter@example.com");
  });

  it("neutralizes mentions and closing keywords in the message", async () => {
    app = await build({ createIssue, isConfigured: () => true });
    await app.inject({
      method: "POST",
      url: "/api/gen/feedback",
      payload: {
        ...VALID_BODY,
        message: "ping @mattbutlerengineering and closes #12 ``` break out",
      },
    });

    const input = createIssue.mock.calls[0]![0] as { title: string; body: string };
    expect(input.body).not.toMatch(/@mattbutler/);
    expect(input.body).not.toMatch(/#12/);
    expect(input.body).toContain("````\n");
  });

  it("rejects a too-short message with a friendly 400", async () => {
    app = await build({ createIssue, isConfigured: () => true });
    const res = await app.inject({
      method: "POST",
      url: "/api/gen/feedback",
      payload: { ...VALID_BODY, message: "short" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toMatch(/at least 10/);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("rejects an over-length message with a friendly 400", async () => {
    app = await build({ createIssue, isConfigured: () => true });
    const res = await app.inject({
      method: "POST",
      url: "/api/gen/feedback",
      payload: { ...VALID_BODY, message: "x".repeat(2001) },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toMatch(/2000/);
  });

  it("rejects an unknown type", async () => {
    app = await build({ createIssue, isConfigured: () => true });
    const res = await app.inject({
      method: "POST",
      url: "/api/gen/feedback",
      payload: { ...VALID_BODY, type: "rant" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("answers 401 without a signed-in user", async () => {
    currentUserId = undefined;
    app = await build({ createIssue, isConfigured: () => true });
    const res = await app.inject({ method: "POST", url: "/api/gen/feedback", payload: VALID_BODY });

    expect(res.statusCode).toBe(401);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when no GitHub token is configured", async () => {
    app = await build({ createIssue, isConfigured: () => false });
    const res = await app.inject({ method: "POST", url: "/api/gen/feedback", payload: VALID_BODY });

    expect(res.statusCode).toBe(503);
    expect(res.json().detail).toBe("Feedback is not available right now.");
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("answers a retryable 502 when GitHub fails, without leaking the cause", async () => {
    createIssue.mockRejectedValue(new Error("Bad credentials ghp_secret"));
    app = await build({ createIssue, isConfigured: () => true });
    const res = await app.inject({ method: "POST", url: "/api/gen/feedback", payload: VALID_BODY });

    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain("ghp_secret");
  });

  it("limits each user to 5 submissions per hour", async () => {
    app = await build({ createIssue, isConfigured: () => true });
    const send = () =>
      app.inject({ method: "POST", url: "/api/gen/feedback", payload: VALID_BODY });

    for (let i = 0; i < 5; i++) expect((await send()).statusCode).toBe(201);
    const sixth = await send();
    expect(sixth.statusCode).toBe(429);
    expect(sixth.headers["retry-after"]).toBeDefined();

    currentUserId = "user-2";
    expect((await send()).statusCode).toBe(201);
  });
});

describe("GET /api/gen/feedback/status", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("reports availability from the token check", async () => {
    currentUserId = "user-1";
    app = await build({ createIssue: vi.fn(), isConfigured: () => false });
    const res = await app.inject({ method: "GET", url: "/api/gen/feedback/status" });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ available: false });
  });
});
