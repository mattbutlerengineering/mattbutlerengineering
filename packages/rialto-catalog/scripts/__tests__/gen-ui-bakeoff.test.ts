import { describe, it, expect, vi } from "vitest";
import {
  PRICING,
  SpendLimitError,
  costUsd,
  createSpendGuard,
  createStubProvider,
  formatTable,
  runBakeoff,
  summarize,
  validateModelOutput,
  geminiPricing,
  type Provider,
  type PromptResult,
} from "../gen-ui-bakeoff-lib.ts";
import { createProvider } from "../gen-ui-bakeoff-providers.ts";

const VALID = JSON.stringify({
  elements: [
    { key: "root", type: "Stack", props: {} },
    { key: "t", parentKey: "root", type: "Text", props: { children: "Hi" } },
  ],
});
const PROMPTS = ["p0", "p1", "p2", "p3", "p4", "p5"];

describe("validateModelOutput", () => {
  it("accepts a valid flat element list", () => {
    expect(validateModelOutput(VALID)).toEqual({ ok: true });
  });

  it("accepts output wrapped in a markdown json fence", () => {
    expect(validateModelOutput("```json\n" + VALID + "\n```").ok).toBe(true);
  });

  it("rejects non-JSON text", () => {
    const r = validateModelOutput("here is your UI!");
    expect(r.ok).toBe(false);
  });

  it("rejects unknown component types with a feedback message", () => {
    const bad = JSON.stringify({ elements: [{ key: "root", type: "Bogus", props: {} }] });
    const r = validateModelOutput(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it("rejects an empty element list", () => {
    expect(validateModelOutput('{"elements":[]}').ok).toBe(false);
  });

  it("rejects malformed elements instead of throwing", () => {
    expect(validateModelOutput('{"elements":[null]}').ok).toBe(false);
  });
});

describe("costUsd", () => {
  it("prices tokens per million", () => {
    expect(
      costUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, PRICING.gemini)
    ).toBeCloseTo(1.75);
    expect(costUsd({ inputTokens: 4000, outputTokens: 1500 }, PRICING.anthropic)).toBeCloseTo(
      0.00115
    );
  });
});

describe("createSpendGuard", () => {
  it("allows spend within the cap and tracks it", () => {
    const guard = createSpendGuard(1);
    guard.assertCanSpend(0.5);
    guard.record(0.5);
    expect(guard.spent()).toBe(0.5);
  });

  it("throws before a call whose worst case would exceed the cap", () => {
    const guard = createSpendGuard(1);
    guard.record(0.9);
    expect(() => guard.assertCanSpend(0.2)).toThrow(SpendLimitError);
  });
});

describe("runBakeoff with stub provider", () => {
  const stub = createStubProvider({ id: "anthropic", prompts: PROMPTS });

  it("scores valid, repaired, and invalid outputs", async () => {
    const report = await runBakeoff({ providers: [stub], prompts: PROMPTS, maxUsd: 1 });
    const kinds = report.results.map((r) => [r.validFirstTry, r.validAfterRepair]);
    expect(kinds).toEqual([
      [true, true],
      [false, true],
      [false, false],
      [true, true],
      [false, true],
      [false, false],
    ]);
    expect(report.aborted).toBe(false);
  });

  it("only repairs once", async () => {
    const call = vi.fn(stub.call);
    await runBakeoff({ providers: [{ ...stub, call }], prompts: ["p2"], maxUsd: 1 });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("aborts when the spend cap would be exceeded", async () => {
    const report = await runBakeoff({ providers: [stub], prompts: PROMPTS, maxUsd: 0 });
    expect(report.aborted).toBe(true);
    expect(report.results).toHaveLength(0);
  });

  it("records provider errors as failures without throwing", async () => {
    const failing: Provider = {
      ...stub,
      call: async () => {
        throw new Error("HTTP 500");
      },
    };
    const report = await runBakeoff({ providers: [failing], prompts: ["a", "b"], maxUsd: 1 });
    expect(report.results[0]).toMatchObject({
      validFirstTry: false,
      validAfterRepair: false,
      error: "HTTP 500",
    });
  });

  it("keeps the paid first call's cost when the repair call fails", async () => {
    let n = 0;
    const flaky: Provider = {
      ...stub,
      call: async () => {
        n += 1;
        if (n === 1) return { text: "not json", inputTokens: 1000, outputTokens: 100 };
        throw new Error("HTTP 500");
      },
    };
    const report = await runBakeoff({ providers: [flaky], prompts: ["a"], maxUsd: 1 });
    expect(report.results[0]).toMatchObject({
      error: "HTTP 500",
      inputTokens: 1000,
      outputTokens: 100,
    });
    expect(report.results[0]?.usd).toBeCloseTo(report.spentUsd);
    expect(report.spentUsd).toBeGreaterThan(0);
  });

  it("stops hitting a provider after three consecutive errors", async () => {
    const call = vi.fn(async () => {
      throw new Error("HTTP 401");
    });
    const report = await runBakeoff({
      providers: [{ ...stub, call }],
      prompts: PROMPTS,
      maxUsd: 1,
    });
    expect(call).toHaveBeenCalledTimes(3);
    expect(report.results).toHaveLength(3);
  });
});

describe("summarize + formatTable", () => {
  const results: PromptResult[] = [
    {
      provider: "anthropic",
      prompt: "a",
      validFirstTry: true,
      validAfterRepair: true,
      inputTokens: 1000,
      outputTokens: 500,
      usd: 0.001,
    },
    {
      provider: "anthropic",
      prompt: "b",
      validFirstTry: false,
      validAfterRepair: true,
      inputTokens: 3000,
      outputTokens: 1500,
      usd: 0.003,
    },
    {
      provider: "anthropic",
      prompt: "c",
      validFirstTry: false,
      validAfterRepair: false,
      inputTokens: 2000,
      outputTokens: 1000,
      usd: 0.002,
    },
    {
      provider: "anthropic",
      prompt: "d",
      validFirstTry: true,
      validAfterRepair: true,
      inputTokens: 2000,
      outputTokens: 1000,
      usd: 0.002,
    },
  ];

  it("computes rates, means, totals and per-1k projection", () => {
    const s = summarize(results)[0]!;
    expect(s).toMatchObject({
      provider: "anthropic",
      n: 4,
      validFirstTryPct: 50,
      validAfterRepairPct: 75,
      meanInputTokens: 2000,
      meanOutputTokens: 1000,
    });
    expect(s.totalUsd).toBeCloseTo(0.008);
    expect(s.projectedUsdPer1k).toBeCloseTo(2);
  });

  it("renders a markdown table", () => {
    const table = formatTable(summarize(results));
    expect(table).toContain("| Provider | Effort | Valid 1st try | Valid after repair |");
    expect(table).toContain("| anthropic ");
    expect(table).toContain("50%");
  });
});

describe("providers (fake fetch)", () => {
  const req = {
    system: "sys",
    messages: [{ role: "user" as const, content: "hi" }],
    maxOutputTokens: 100,
  };

  it("parses an Anthropic response and sends the key only as a header", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        content: [{ type: "text", text: "out" }],
        usage: { input_tokens: 7, output_tokens: 3 },
      })
    );
    const p = createProvider("anthropic", "sk-secret", fetchImpl as unknown as typeof fetch);
    expect(await p.call(req)).toMatchObject({ text: "out", inputTokens: 7, outputTokens: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("anthropic.com");
    expect(String(init.body)).not.toContain("sk-secret");
  });

  it("parses an OpenAI response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: "out" } }],
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      })
    );
    const p = createProvider("openai", "k", fetchImpl as unknown as typeof fetch);
    expect(await p.call(req)).toMatchObject({ text: "out", inputTokens: 9, outputTokens: 4 });
  });

  it("parses a Gemini response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: "out" }] } }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5 },
      })
    );
    const p = createProvider("gemini", "k", fetchImpl as unknown as typeof fetch);
    expect(await p.call(req)).toMatchObject({ text: "out", inputTokens: 11, outputTokens: 5 });
  });

  it("counts Gemini thinking tokens as output tokens", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: "out" }] } }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5, thoughtsTokenCount: 20 },
      })
    );
    const p = createProvider("gemini", "k", fetchImpl as unknown as typeof fetch);
    expect((await p.call(req)).outputTokens).toBe(25);
  });

  it("redacts the API key from HTTP error messages", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad key sk-secret", { status: 401 }));
    const p = createProvider("openai", "sk-secret", fetchImpl as unknown as typeof fetch);
    await expect(p.call(req)).rejects.toThrow(/HTTP 401/);
    await expect(p.call(req)).rejects.not.toThrow(/sk-secret/);
  });
});

describe("production configuration (#7233)", () => {
  const req = {
    system: "sys",
    messages: [{ role: "user" as const, content: "hi" }],
    maxOutputTokens: 100,
  };
  const bodyOf = (fetchImpl: ReturnType<typeof vi.fn>) =>
    JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));

  it("sends cache_control on the Anthropic system prompt", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ content: [], usage: {} }));
    await createProvider("anthropic", "k", fetchImpl as unknown as typeof fetch).call(req);
    expect(bodyOf(fetchImpl).system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("sends the effort only when an arm asks for it", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ content: [], usage: {} }));
    const p = createProvider("anthropic", "k", fetchImpl as unknown as typeof fetch);
    await p.call(req);
    await p.call({ ...req, effort: "low" });
    const bodies = fetchImpl.mock.calls.map(
      (c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)) as object
    );
    expect(bodies[0]).not.toHaveProperty("output_config");
    expect(bodies[1]).toMatchObject({ output_config: { effort: "low" } });
  });

  it("reads Anthropic cache usage and counts it inside total input", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        content: [],
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 7000,
          cache_creation_input_tokens: 50,
          output_tokens: 3,
        },
      })
    );
    const res = await createProvider("anthropic", "k", fetchImpl as unknown as typeof fetch).call(
      req
    );
    expect(res).toMatchObject({
      inputTokens: 7150,
      cacheReadTokens: 7000,
      cacheWriteTokens: 50,
      outputTokens: 3,
    });
  });

  it("prices cache reads at the cache-read rate, uncached at base", () => {
    const tokens = { inputTokens: 7100, outputTokens: 0, cacheReadTokens: 7000 };
    const cached = costUsd(tokens, PRICING.anthropic);
    expect(cached).toBeCloseTo((100 * 0.1 + 7000 * 0.01) / 1_000_000);
    expect(costUsd({ ...tokens, cacheReadTokens: 0 }, PRICING.anthropic)).toBeCloseTo(
      (7100 * 0.1) / 1_000_000
    );
  });

  it("declares a cached-input rate below base for every provider, so cached tokens are never billed at base", () => {
    for (const [id, pricing] of Object.entries(PRICING)) {
      expect(pricing.cachedInPerM, id).toBeTypeOf("number");
      expect(pricing.cachedInPerM, id).toBeLessThan(pricing.inPerM);
      const tokens = { inputTokens: 7100, outputTokens: 0, cacheReadTokens: 7000 };
      expect(costUsd(tokens, pricing), id).toBeLessThan(
        costUsd({ ...tokens, cacheReadTokens: 0 }, pricing)
      );
    }
  });

  it("prices OpenAI and Gemini cache reads at their verified vendor rates", () => {
    expect(PRICING.openai.cachedInPerM).toBe(0.01);
    expect(PRICING.gemini.cachedInPerM).toBe(0.025);
  });

  it("prices cached tokens at $0 on the Gemini free tier", () => {
    expect(geminiPricing(true).cachedInPerM).toBe(0);
  });

  it("runs an arm per effort and reports cached and uncached cost separately", async () => {
    const stub = createStubProvider({ id: "anthropic", prompts: PROMPTS });
    const seen: (string | undefined)[] = [];
    const call = vi.fn(async (r: Parameters<Provider["call"]>[0]) => {
      seen.push(r.effort);
      return stub.call(r);
    });
    const report = await runBakeoff({
      providers: [{ ...stub, call }],
      prompts: ["p0"],
      maxUsd: 1,
      efforts: ["default", "low"],
    });
    expect(seen).toEqual([undefined, "low"]);
    expect(report.results.map((r) => r.arm)).toEqual(["default", "low"]);
    const [def, low] = summarize(report.results);
    expect(def?.arm).toBe("default");
    expect(low?.arm).toBe("low");
    expect(def!.uncachedUsd).toBeGreaterThan(def!.totalUsd);
    const table = formatTable(summarize(report.results));
    expect(table).toContain("Cached $");
    expect(table).toContain("Uncached $");
  });

  it("skips effort arms for a provider that cannot take one", async () => {
    const stub = createStubProvider({ id: "anthropic", prompts: PROMPTS });
    const report = await runBakeoff({
      providers: [{ ...stub, supportsEffort: false }],
      prompts: ["p0"],
      maxUsd: 1,
      efforts: ["default", "low"],
    });
    expect(report.results).toHaveLength(1);
  });

  it("guards every arm: the cap aborts before the arm that would exceed it", async () => {
    const stub = createStubProvider({ id: "anthropic", prompts: PROMPTS });
    const call = vi.fn(stub.call);
    const oneCall = 0.0008;
    const report = await runBakeoff({
      providers: [{ ...stub, call }],
      prompts: ["p0", "p0"],
      maxUsd: oneCall * 2,
      efforts: ["default", "low"],
    });
    expect(report.aborted).toBe(true);
    expect(call.mock.calls.length).toBeLessThan(4);
  });

  it("reports a free-tier Gemini run as $0 and names the tier", async () => {
    const free = geminiPricing(true);
    expect(free.tier).toBe("free tier");
    const stub = createStubProvider({ id: "gemini", prompts: PROMPTS });
    const report = await runBakeoff({
      providers: [{ ...stub, pricing: free }],
      prompts: ["p0"],
      maxUsd: 0,
    });
    expect(report.aborted).toBe(false);
    expect(report.spentUsd).toBe(0);
    const table = formatTable(summarize(report.results));
    expect(table).toContain("gemini (free tier)");
    expect(table).toContain("$0 (free tier)");
  });

  it("labels default Gemini pricing as paid rates", async () => {
    const stub = createStubProvider({ id: "gemini", prompts: PROMPTS });
    const report = await runBakeoff({ providers: [stub], prompts: ["p0"], maxUsd: 1 });
    expect(formatTable(summarize(report.results))).toContain("gemini (paid rates)");
  });
});
