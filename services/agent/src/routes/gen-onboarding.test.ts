import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("ai", () => ({
  streamText: vi.fn(),
  tool: vi.fn((def: unknown) => def),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
  Output: { object: vi.fn() },
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ provider: "anthropic", modelId: "claude-haiku-4.5" })),
}));

vi.mock("../services/gen-spend-ceiling.js", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    getGenSpendToday: vi.fn(async () => ({ generations: 0, costMicroUsd: 0 })),
    recordGenSpend: vi.fn(async () => {}),
    trackGenSpend: vi.fn(async () => {}),
    failedGenCostMicroUsd: vi.fn(actual.failedGenCostMicroUsd as () => number),
    isSpendTrackingDegraded: vi.fn(() => false),
  };
});

vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: { prompt: vi.fn(() => "catalog prompt") },
}));

vi.mock("@mbe/auth/fastify", () => ({
  authPlugin: vi.fn(async () => {}),
  getAuthPluginOptionsFromEnv: vi.fn(() => ({})),
  requireAuth: vi.fn(async (req: { user?: { id: string } }) => {
    req.user = { id: "owner-1" };
  }),
  requireOwnershipOrAdmin: vi.fn(() => vi.fn(async () => {})),
}));

vi.mock("../services/session.js", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  sessionService: {},
}));
vi.mock("../services/session-executor.js", () => ({
  executeSession: vi.fn(),
  cancelSession: vi.fn(),
  getActiveSessionCount: vi.fn().mockReturnValue(0),
}));
vi.mock("../services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService();
});
vi.mock("../services/orchestrator.js", () => ({ orchestratorService: { decompose: vi.fn() } }));
vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn(),
  DEFAULT_SESSION_CONFIG: {},
  DEFAULT_FEEDBACK_LOOP_CONFIG: {},
  resolveBudget: vi.fn(),
  resolveModel: vi.fn(),
  routeModelWithReason: vi.fn(),
  createSanitizedStream: vi.fn((stream: unknown) => stream),
  GEN_BLOCKED_TOOLS: new Set<string>(),
  genIsBashCommandBlocked: vi.fn(() => null),
}));

import { streamText } from "ai";
import { buildApp } from "../app.js";
import { failedGenCostMicroUsd } from "../services/gen-spend-ceiling.js";
import {
  addOnboardingSpend,
  resetOnboardingSpendForTests,
} from "../services/gen-onboarding-ceiling.js";

async function* iter<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

const URL_ = "/api/gen/onboarding";
const body = {
  messages: [{ role: "user", content: "We're in Lisbon" }],
  step: "locationTime",
  draft: { ianaTimezone: "", currencyCode: "" },
};

function ndjson(payload: string): unknown[] {
  return payload
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as unknown);
}

describe("POST /api/gen/onboarding", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetOnboardingSpendForTests();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 401 without auth", async () => {
    const { requireAuth } = await import("@mbe/auth/fastify");
    vi.mocked(requireAuth).mockImplementationOnce(async (_req, reply) => {
      reply.code(401).send({
        type: "https://mattbutlerengineering.com/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Authentication required",
      });
    });
    const res = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(res.statusCode).toBe(401);
  });

  it("does not require a venueId", async () => {
    vi.mocked(streamText).mockReturnValueOnce({ fullStream: iter([]) } as never);
    const res = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(res.statusCode).not.toBe(400);
  });

  it.each([
    ["an unknown step", { ...body, step: "launch" }],
    ["no step", { messages: body.messages, draft: {} }],
    ["too many messages", { ...body, messages: Array(20).fill(body.messages[0]) }],
    ["an overlong message", { ...body, messages: [{ role: "user", content: "x".repeat(5000) }] }],
    ["a bad time zone", { ...body, timeZone: "Mars/Olympus" }],
    ["a non-string draft value", { ...body, draft: { ianaTimezone: { a: 1 } } }],
  ])("returns 400 for %s", async (_name, payload) => {
    const res = await app.inject({ method: "POST", url: URL_, payload });
    expect(res.statusCode).toBe(400);
  });

  it("offers only propose_onboarding_patch and a step-aware prompt carrying the draft", async () => {
    vi.mocked(streamText).mockReturnValueOnce({ fullStream: iter([]) } as never);
    await app.inject({
      method: "POST",
      url: URL_,
      payload: { ...body, draft: { ianaTimezone: "Europe/Paris", currencyCode: "" } },
    });
    const call = vi.mocked(streamText).mock.calls[0]![0] as {
      tools: Record<string, unknown>;
      instructions: unknown;
    };
    expect(Object.keys(call.tools)).toEqual(["propose_onboarding_patch"]);
    const prompt = JSON.stringify(call.instructions);
    expect(prompt).toContain("locationTime");
    expect(prompt).toContain("Europe/Paris");
    expect(prompt.length).toBeLessThan(3000);
  });

  it("streams the validated patch as an onboarding_patch line", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: iter([
        {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "propose_onboarding_patch",
          input: { step: "locationTime", data: { ianaTimezone: "Europe/Lisbon" } },
        },
        {
          type: "tool-result",
          toolCallId: "t1",
          toolName: "propose_onboarding_patch",
          output: {
            ok: true,
            patch: { step: "locationTime", data: { ianaTimezone: "Europe/Lisbon" } },
          },
        },
        { type: "text-delta", text: "Got it. Which currency?" },
      ]),
    } as never);
    const res = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(res.statusCode).toBe(200);
    expect(ndjson(res.body)).toContainEqual({
      type: "onboarding_patch",
      patch: { step: "locationTime", data: { ianaTimezone: "Europe/Lisbon" } },
    });
  });

  it("does not stream a patch the tool rejected", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: iter([
        {
          type: "tool-result",
          toolCallId: "t1",
          toolName: "propose_onboarding_patch",
          output: { ok: false, error: "bad" },
        },
        { type: "text-delta", text: "Which city?" },
      ]),
    } as never);
    const res = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(ndjson(res.body).some((l) => (l as { type: string }).type === "onboarding_patch")).toBe(
      false
    );
  });

  it("answers with a form-fallback line, no model call, once the ceiling is hit", async () => {
    addOnboardingSpend("owner-1", 60_000);
    const res = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(res.statusCode).toBe(200);
    expect(ndjson(res.body)).toEqual([
      { type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 },
    ]);
    expect(streamText).not.toHaveBeenCalled();
  });

  it("honours GEN_ONBOARDING_CEILING_USD", async () => {
    vi.stubEnv("GEN_ONBOARDING_CEILING_USD", "0.5");
    addOnboardingSpend("owner-1", 60_000);
    vi.mocked(streamText).mockReturnValueOnce({ fullStream: iter([]) } as never);
    await app.inject({ method: "POST", url: URL_, payload: body });
    expect(streamText).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("keeps draft keys outside the step's fields out of the system prompt", async () => {
    vi.mocked(streamText).mockReturnValueOnce({ fullStream: iter([]) } as never);
    await app.inject({
      method: "POST",
      url: URL_,
      payload: {
        ...body,
        draft: { ianaTimezone: "Europe/Paris", ignoreAllRules: "INJECTED-TEXT", maxPartySize: "9" },
      },
    });
    const call = vi.mocked(streamText).mock.calls[0]![0] as { instructions: unknown };
    const prompt = JSON.stringify(call.instructions);
    expect(prompt).toContain("Europe/Paris");
    expect(prompt).not.toContain("INJECTED-TEXT");
    expect(prompt).not.toContain("ignoreAllRules");
    expect(prompt).not.toContain("maxPartySize");
  });

  it("feeds a finished run's cost into the ceiling, so the next request gets the form fallback", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: iter([{ type: "text-delta", text: "Which city?" }]),
    } as never);
    const first = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(first.statusCode).toBe(200);

    const options = vi.mocked(streamText).mock.calls[0]![0] as unknown as {
      onFinish: (payload: unknown) => Promise<void>;
    };
    // 1M input + 1M output tokens is far past 50_000 micro-USD at any model's price.
    await options.onFinish({
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      providerMetadata: {},
      finishReason: "stop",
    });

    const second = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(ndjson(second.body)).toEqual([
      { type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 },
    ]);
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("charges the worst case for an errored run, so the next request gets the form fallback", async () => {
    // First call is the preflight reservation (tiny); the second is the failed-run charge.
    vi.mocked(failedGenCostMicroUsd).mockReturnValueOnce(1).mockReturnValueOnce(60_000);
    vi.mocked(streamText).mockReturnValueOnce({
      fullStream: iter([{ type: "error", error: new Error("upstream down") }]),
    } as never);
    await app.inject({ method: "POST", url: URL_, payload: body });

    const second = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(ndjson(second.body)).toEqual([
      { type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 },
    ]);
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it("reserves a worst-case turn at preflight, so parallel requests cannot all pass", async () => {
    vi.mocked(failedGenCostMicroUsd).mockReturnValue(30_000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    async function* held() {
      await gate;
      yield { type: "text-delta", text: "ok" };
    }
    vi.mocked(streamText).mockReturnValue({ fullStream: held() } as never);
    // Two requests in flight (30k + 30k reserved >= 50k): a third is refused.
    const inFlight = [
      app.inject({ method: "POST", url: URL_, payload: body }),
      app.inject({ method: "POST", url: URL_, payload: body }),
    ];
    await vi.waitFor(() => expect(streamText).toHaveBeenCalledTimes(2));
    vi.mocked(streamText).mockReset();
    const third = await app.inject({ method: "POST", url: URL_, payload: body });
    expect(ndjson(third.body)).toEqual([
      { type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 },
    ]);
    expect(streamText).not.toHaveBeenCalled();
    release();
    await Promise.all(inFlight);
    vi.mocked(failedGenCostMicroUsd).mockReset();
  });
});
