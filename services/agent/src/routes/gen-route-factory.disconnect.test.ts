import { describe, it, expect, vi, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";
import { z } from "zod";

// A client that disconnects mid-generation must not crash the process (the
// keepalive pulse enqueueing on a cancelled stream) or keep the model running.

vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn((n: number) => ({ type: "stepCount", count: n })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ provider: "anthropic", modelId: "claude-haiku-4.5" })),
}));

vi.mock("../services/database.js", () => ({ prisma: {} }));

vi.mock("../services/gen-spend-ceiling.js", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    getGenSpendToday: vi.fn(async () => ({ generations: 0, costMicroUsd: 0 })),
    trackGenSpend: vi.fn(async () => {}),
    isSpendTrackingDegraded: vi.fn(() => false),
    getGenDailyCeilingUsd: vi.fn(() => 2),
  };
});

vi.mock("../services/gen-spec-cache.js", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    getCachedSpec: vi.fn(async () => null),
    putCachedSpec: vi.fn(async () => {}),
  };
});

vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: { prompt: vi.fn(() => "mock system prompt") },
}));

vi.mock("@mbe/auth/fastify", () => ({
  requireAuth: vi.fn(async (req: { user?: { id: string } }) => {
    req.user = { id: "test-user" };
  }),
}));

vi.mock("@mbe/agent-core", () => ({
  createSanitizedStream: vi.fn((stream: unknown) => stream),
  GEN_BLOCKED_TOOLS: new Set<string>(),
  genIsBashCommandBlocked: vi.fn(() => null),
}));

import { streamText } from "ai";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createGenRoute } from "./gen-route-factory.js";
import { failedGenCostMicroUsd, trackGenSpend } from "../services/gen-spend-ceiling.js";
import { putCachedSpec } from "../services/gen-spec-cache.js";

const ROUTE_PATH = "/test/gen-disconnect";

const ChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

/** Mimics ai@7: one element, then the stream ends (with an abort part) once the signal fires. */
function abortableRun(seen: { signal?: AbortSignal }) {
  vi.mocked(streamText).mockImplementationOnce(((options: { abortSignal?: AbortSignal }) => {
    seen.signal = options.abortSignal;
    async function* fullStream() {
      yield {
        type: "tool-call",
        toolCallId: "t1",
        toolName: "render_component",
        input: { elements: [{ key: "a", type: "Text" }] },
      };
      await new Promise<void>((resolve) => {
        if (!options.abortSignal) return; // never aborts: the run hangs, as before the fix
        if (options.abortSignal.aborted) resolve();
        options.abortSignal.addEventListener("abort", () => resolve());
      });
      yield { type: "abort" };
    }
    return { fullStream: fullStream() };
  }) as never);
}

describe("createGenRoute — client disconnect mid-generation", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
    vi.clearAllMocks();
  });

  it("aborts the model call, stops the keepalive pulse and charges the run once", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    app = Fastify({ logger: false, forceCloseConnections: true });
    await app.register(rateLimit, { global: false });
    await app.register(
      createGenRoute({
        path: ROUTE_PATH,
        costLogLabel: "test-disconnect cost log",
        rateLimit: { max: 50, timeWindow: "1 hour" },
        schema: ChatSchema,
        streamFormat: "ndjson",
        maxSteps: 1,
        cache: true,
        getTools: async () => ({}),
      })
    );
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;

    const seen: { signal?: AbortSignal } = {};
    abortableRun(seen);

    const client = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}${ROUTE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "a big form" }] }),
      signal: client.signal,
    });
    const reader = res.body!.getReader();
    let body = "";
    while (!body.includes('"element"')) {
      const { value } = await reader.read();
      body += new TextDecoder().decode(value);
    }
    client.abort();

    await vi.waitFor(() => expect(seen.signal?.aborted).toBe(true), { timeout: 2000 });
    // The pulse used to fire into the closed controller and throw from setInterval.
    expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);

    await vi.waitFor(() => expect(trackGenSpend).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(trackGenSpend).toHaveBeenCalledWith(failedGenCostMicroUsd(), expect.anything());
    // A partial, aborted run is never served from cache.
    expect(putCachedSpec).not.toHaveBeenCalled();
  });
});
