/**
 * Pure logic for the generative-UI model bake-off (#6948): validation against
 * the real rialto catalog, scoring, cost, spend guard, and reporting. No
 * network and no env access here — providers are injected.
 */
import { flatToTree } from "@json-render/react";
import { catalog } from "../src/catalog.ts";

/* ── Types ───────────────────────────────────── */

export type ProviderId = "anthropic" | "openai" | "gemini";

export interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Thinking-effort arm; `default` sends nothing so the provider's own default runs. */
export type Effort = "default" | "low";

export interface ProviderRequest {
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly maxOutputTokens: number;
  /** Set only for a non-default arm. */
  readonly effort?: Exclude<Effort, "default">;
}

export interface ProviderResponse {
  readonly text: string;
  /** Total input including cached tokens. */
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Subset of `inputTokens` served from the prompt cache. */
  readonly cacheReadTokens?: number;
  /** Subset of `inputTokens` written to the prompt cache. */
  readonly cacheWriteTokens?: number;
}

export interface Pricing {
  readonly inPerM: number;
  readonly outPerM: number;
  /**
   * Cache-read input rate. Required, not optional: an absent rate used to fall
   * back to the base rate, which silently overpriced cached tokens (#7236). A
   * vendor with no discount must say so by declaring the base rate explicitly.
   */
  readonly cachedInPerM: number;
  /** Cache-write input rate; absent means base input rate. */
  readonly cacheWritePerM?: number;
  /** Names the pricing tier a row reflects; shown in the report. */
  readonly tier?: string;
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly model: string;
  readonly pricing: Pricing;
  /** Whether the wire format can take an effort arm. Absent means yes. */
  readonly supportsEffort?: boolean;
  readonly call: (req: ProviderRequest) => Promise<ProviderResponse>;
}

export interface PromptResult {
  readonly provider: ProviderId;
  readonly arm?: Effort;
  readonly tier?: string;
  readonly prompt: string;
  readonly validFirstTry: boolean;
  readonly validAfterRepair: boolean;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Cost as billed, cache reads at the cache-read rate. */
  readonly usd: number;
  /** Cold-start cost: all input at the base rate. */
  readonly uncachedUsd?: number;
  readonly error?: string;
}

export interface BakeoffReport {
  readonly results: readonly PromptResult[];
  readonly spentUsd: number;
  readonly maxUsd: number;
  readonly aborted: boolean;
  readonly abortReason?: string;
}

/* ── Pricing (USD per million tokens, vendor pages 2026-10-16, see #6948) ── */

export const PRICING: Readonly<Record<ProviderId, Pricing>> = {
  // Claude Haiku 5.5: cache read is a tenth of base input, a 5-minute write is 1.25x.
  anthropic: { inPerM: 0.1, outPerM: 0.5, cachedInPerM: 0.01, cacheWritePerM: 0.125 },
  // GPT-6 Luna (developers.openai.com/api/docs/pricing, 2026-10-22, short context <=272K):
  // cached input $0.01; a cache write is $0.125 (30 min) / $0.25 (12 h). The harness only
  // reads implicit-cache hits, so the write rate is recorded but never applied.
  openai: { inPerM: 0.1, outPerM: 0.5, cachedInPerM: 0.01, cacheWritePerM: 0.125 },
  // Gemini 3.1 Flash-Lite (ai.google.dev/gemini-api/docs/pricing, 2026-10-22, paid, text):
  // cached input $0.025. No per-write charge is published; explicit caches also bill storage
  // ($1.00/MTok-hour), which the harness does not use (implicit caching only).
  gemini: { inPerM: 0.25, outPerM: 1.5, cachedInPerM: 0.025, tier: "paid rates" },
};

/** The free tier (no billing account linked) cannot be charged: every rate is $0. */
export function geminiPricing(freeTier: boolean): Pricing {
  return freeTier ? { inPerM: 0, outPerM: 0, cachedInPerM: 0, tier: "free tier" } : PRICING.gemini;
}

interface Tokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function costUsd(tokens: Tokens, pricing: Pricing): number {
  const read = tokens.cacheReadTokens ?? 0;
  const write = tokens.cacheWriteTokens ?? 0;
  const plain = tokens.inputTokens - read - write;
  return (
    (plain * pricing.inPerM +
      read * pricing.cachedInPerM +
      write * (pricing.cacheWritePerM ?? pricing.inPerM) +
      tokens.outputTokens * pricing.outPerM) /
    1_000_000
  );
}

/** Cold-start cost: the same tokens with nothing served from cache. */
function uncachedCostUsd(tokens: Tokens, pricing: Pricing): number {
  return costUsd({ inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens }, pricing);
}

/* ── System prompt: same catalog.prompt() the POST /api/gen/ui route uses ── */

// services/agent/src/routes/gen-ui.ts forces a render_component tool call whose
// input is a flat element list. The bake-off asks each provider for the same
// flat list as plain JSON text so one code path works across three vendors.
const JSON_OUTPUT_INSTRUCTIONS =
  "Ignore any instructions above about emitting JSONL patch text. Respond with " +
  'ONLY one JSON object of the form {"elements":[...]} and no prose or code fences. ' +
  "Each element needs a unique `key`, a `type`, `props`, and, for every element " +
  "except the root, a `parentKey` set to its parent's `key` (omit `parentKey` on " +
  "the root element). Do not give elements a `children` array of keys — the tree " +
  "is assembled purely from `parentKey` links. An element's own words go in its " +
  "text or label prop.";

const SYSTEM_PROMPT = `${catalog.prompt()}\n\n${JSON_OUTPUT_INSTRUCTIONS}`;

/* ── Validation ──────────────────────────────── */

export type Validation = { ok: true } | { ok: false; error: string };

const MAX_FEEDBACK_CHARS = 1500;

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return JSON.parse((fenced?.[1] ?? text).trim());
}

function formatIssues(error: {
  issues?: readonly { path: PropertyKey[]; message: string }[];
}): string {
  const lines = (error.issues ?? []).slice(0, 8).map((i) => {
    const msg = i.message.length > 200 ? `${i.message.slice(0, 200)}…` : i.message;
    return `${i.path.map(String).join(".") || "(root)"}: ${msg}`;
  });
  return lines.join("\n").slice(0, MAX_FEEDBACK_CHARS);
}

export function validateModelOutput(text: string): Validation {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    return { ok: false, error: "Output was not valid JSON." };
  }
  const elements = Array.isArray(parsed)
    ? parsed
    : (parsed as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements) || elements.length === 0) {
    return { ok: false, error: 'Expected {"elements":[...]} with at least one element.' };
  }
  let result: ReturnType<typeof catalog.validate>;
  try {
    result = catalog.validate(flatToTree(elements as Parameters<typeof flatToTree>[0]));
  } catch (err) {
    // Malformed elements (e.g. null entries) are an invalid spec, not a provider error.
    return {
      ok: false,
      error: `Malformed elements: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (result.success) return { ok: true };
  return {
    ok: false,
    error: formatIssues(result.error ?? {}) || "Spec failed catalog validation.",
  };
}

/* ── Spend guard ─────────────────────────────── */

export class SpendLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendLimitError";
  }
}

export function createSpendGuard(maxUsd: number) {
  let spent = 0;
  return {
    spent: () => spent,
    record: (usd: number) => {
      spent += usd;
    },
    assertCanSpend: (worstCaseUsd: number) => {
      if (spent + worstCaseUsd > maxUsd) {
        throw new SpendLimitError(
          `Spend guard: $${spent.toFixed(4)} spent + $${worstCaseUsd.toFixed(4)} worst case would exceed --max-usd $${maxUsd.toFixed(2)}`
        );
      }
    },
  };
}

type SpendGuard = ReturnType<typeof createSpendGuard>;

/* ── Running ─────────────────────────────────── */

const MAX_OUTPUT_TOKENS = 2048;
const MAX_CONSECUTIVE_ERRORS = 3;
// Deliberately pessimistic (3 chars/token) so the guard errs toward aborting.
const CHARS_PER_TOKEN_ESTIMATE = 3;

function worstCaseUsd(provider: Provider, req: ProviderRequest): number {
  const chars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
  // Worst case prices every input token at the dearest input rate (a cache write).
  const inRate = Math.max(provider.pricing.inPerM, provider.pricing.cacheWritePerM ?? 0);
  return (
    (Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE) * inRate +
      req.maxOutputTokens * provider.pricing.outPerM) /
    1_000_000
  );
}

async function guardedCall(provider: Provider, req: ProviderRequest, guard: SpendGuard) {
  guard.assertCanSpend(worstCaseUsd(provider, req));
  const res = await provider.call(req);
  const usd = costUsd(res, provider.pricing);
  guard.record(usd);
  return { res, usd, uncachedUsd: uncachedCostUsd(res, provider.pricing) };
}

function repairPrompt(error: string): string {
  return `The JSON failed validation:\n${error}\n\nReturn the corrected complete JSON object only.`;
}

async function runPrompt(
  provider: Provider,
  prompt: string,
  guard: SpendGuard,
  arm: Effort
): Promise<PromptResult> {
  const base = { provider: provider.id, arm, tier: provider.pricing.tier, prompt };
  const effort = arm === "default" ? {} : { effort: arm };
  const first = await guardedCall(
    provider,
    {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...effort,
    },
    guard
  );
  const v1 = validateModelOutput(first.res.text);
  const tally = {
    inputTokens: first.res.inputTokens,
    outputTokens: first.res.outputTokens,
    usd: first.usd,
    uncachedUsd: first.uncachedUsd,
  };
  if (v1.ok) return { ...base, validFirstTry: true, validAfterRepair: true, ...tally };

  let repair: Awaited<ReturnType<typeof guardedCall>>;
  try {
    repair = await guardedCall(
      provider,
      {
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: first.res.text },
          { role: "user", content: repairPrompt(v1.error) },
        ],
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        ...effort,
      },
      guard
    );
  } catch (err) {
    if (err instanceof SpendLimitError) throw err;
    // The first call was paid for; keep its cost in the row.
    return { ...errorResult(provider, prompt, err, arm), ...tally };
  }
  return {
    ...base,
    validFirstTry: false,
    validAfterRepair: validateModelOutput(repair.res.text).ok,
    inputTokens: tally.inputTokens + repair.res.inputTokens,
    outputTokens: tally.outputTokens + repair.res.outputTokens,
    usd: tally.usd + repair.usd,
    uncachedUsd: tally.uncachedUsd + repair.uncachedUsd,
  };
}

function errorResult(
  provider: Provider,
  prompt: string,
  err: unknown,
  arm: Effort = "default"
): PromptResult {
  return {
    provider: provider.id,
    arm,
    tier: provider.pricing.tier,
    prompt,
    validFirstTry: false,
    validAfterRepair: false,
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
    uncachedUsd: 0,
    error: err instanceof Error ? err.message : String(err),
  };
}

export async function runBakeoff(opts: {
  providers: readonly Provider[];
  prompts: readonly string[];
  maxUsd: number;
  /** One arm per effort, per provider that supports one. Defaults to the provider default only. */
  efforts?: readonly Effort[];
}): Promise<BakeoffReport> {
  const guard = createSpendGuard(opts.maxUsd);
  const results: PromptResult[] = [];
  let abortReason: string | undefined;

  for (const provider of opts.providers) {
    const arms = (opts.efforts ?? ["default"]).filter(
      (e) => e === "default" || provider.supportsEffort !== false
    );
    for (const arm of arms) {
      let consecutiveErrors = 0;
      for (const prompt of opts.prompts) {
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
        try {
          results.push(await runPrompt(provider, prompt, guard, arm));
          consecutiveErrors = 0;
        } catch (err) {
          if (err instanceof SpendLimitError) {
            abortReason = err.message;
            break;
          }
          results.push(errorResult(provider, prompt, err, arm));
          consecutiveErrors += 1;
        }
      }
      if (abortReason) break;
    }
    if (abortReason) break;
  }
  return {
    results,
    spentUsd: guard.spent(),
    maxUsd: opts.maxUsd,
    aborted: abortReason !== undefined,
    ...(abortReason ? { abortReason } : {}),
  };
}

/* ── Stub provider (dry-run / tests) ─────────── */

const STUB_VALID = JSON.stringify({
  elements: [
    { key: "root", type: "Stack", props: {} },
    { key: "title", parentKey: "root", type: "Text", props: { children: "Hello" } },
  ],
});
const STUB_INVALID = JSON.stringify({
  elements: [{ key: "root", type: "NotInCatalog", props: {} }],
});

/**
 * Canned outputs by prompt index mod 3: valid; invalid then valid on repair;
 * invalid even after repair.
 */
export function createStubProvider(opts: {
  id: ProviderId;
  prompts: readonly string[];
  label?: string;
  model?: string;
}): Provider {
  return {
    id: opts.id,
    label: opts.label ?? `${opts.id} (stub)`,
    model: opts.model ?? "stub",
    pricing: PRICING[opts.id],
    call: async (req) => {
      const index = opts.prompts.indexOf(req.messages[0]?.content ?? "");
      const isRepair = req.messages.length > 1;
      const kind = index % 3;
      const text = kind === 0 || (kind === 1 && isRepair) ? STUB_VALID : STUB_INVALID;
      const chars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
      return {
        text,
        inputTokens: Math.ceil(chars / 4),
        outputTokens: Math.ceil(text.length / 4),
        // The shared catalog prompt is what a warm cache serves.
        cacheReadTokens: Math.min(Math.ceil(req.system.length / 4), Math.ceil(chars / 4)),
      };
    },
  };
}

/* ── Reporting ───────────────────────────────── */

export interface ProviderSummary {
  readonly provider: ProviderId;
  readonly arm: Effort;
  readonly tier?: string;
  readonly n: number;
  readonly errors: number;
  readonly validFirstTryPct: number;
  readonly validAfterRepairPct: number;
  readonly meanInputTokens: number;
  readonly meanOutputTokens: number;
  readonly totalUsd: number;
  readonly uncachedUsd: number;
  readonly projectedUsdPer1k: number;
  readonly uncachedProjectedUsdPer1k: number;
}

export function summarize(results: readonly PromptResult[]): ProviderSummary[] {
  const keys = [...new Set(results.map((r) => `${r.provider}|${r.arm ?? "default"}`))];
  return keys.map((key) => {
    const [provider, arm] = key.split("|") as [ProviderId, Effort];
    const rows = results.filter((r) => r.provider === provider && (r.arm ?? "default") === arm);
    const n = rows.length;
    const pct = (count: number) => (count / n) * 100;
    const mean = (pick: (r: PromptResult) => number) => rows.reduce((s, r) => s + pick(r), 0) / n;
    const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
    const uncachedUsd = rows.reduce((s, r) => s + (r.uncachedUsd ?? r.usd), 0);
    return {
      provider,
      arm,
      ...(rows[0]?.tier ? { tier: rows[0].tier } : {}),
      n,
      errors: rows.filter((r) => r.error !== undefined).length,
      validFirstTryPct: pct(rows.filter((r) => r.validFirstTry).length),
      validAfterRepairPct: pct(rows.filter((r) => r.validAfterRepair).length),
      meanInputTokens: mean((r) => r.inputTokens),
      meanOutputTokens: mean((r) => r.outputTokens),
      totalUsd,
      uncachedUsd,
      projectedUsdPer1k: (totalUsd / n) * 1000,
      uncachedProjectedUsdPer1k: (uncachedUsd / n) * 1000,
    };
  });
}

export function formatTable(summaries: readonly ProviderSummary[]): string {
  const header =
    "| Provider | Effort | Valid 1st try | Valid after repair | Mean in tok | Mean out tok | Cached $ | Uncached $ | Cached $/1k gens | Uncached $/1k gens | Errors |";
  const sep = "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const rows = summaries.map((s) => {
    const free = s.tier === "free tier";
    const usd = (v: number, digits: number) => (free ? "$0 (free tier)" : `$${v.toFixed(digits)}`);
    const name = s.tier ? `${s.provider} (${s.tier})` : s.provider;
    return `| ${name} | ${s.arm} | ${s.validFirstTryPct.toFixed(0)}% | ${s.validAfterRepairPct.toFixed(0)}% | ${s.meanInputTokens.toFixed(0)} | ${s.meanOutputTokens.toFixed(0)} | ${usd(s.totalUsd, 4)} | ${usd(s.uncachedUsd, 4)} | ${usd(s.projectedUsdPer1k, 2)} | ${usd(s.uncachedProjectedUsdPer1k, 2)} | ${s.errors}/${s.n} |`;
  });
  return [header, sep, ...rows].join("\n");
}
