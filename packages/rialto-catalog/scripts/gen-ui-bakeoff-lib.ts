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

export interface ProviderRequest {
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly maxOutputTokens: number;
}

export interface ProviderResponse {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface Pricing {
  readonly inPerM: number;
  readonly outPerM: number;
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly model: string;
  readonly pricing: Pricing;
  readonly call: (req: ProviderRequest) => Promise<ProviderResponse>;
}

export interface PromptResult {
  readonly provider: ProviderId;
  readonly prompt: string;
  readonly validFirstTry: boolean;
  readonly validAfterRepair: boolean;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly usd: number;
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
  anthropic: { inPerM: 0.1, outPerM: 0.5 }, // Claude Haiku 5.5
  openai: { inPerM: 0.1, outPerM: 0.5 }, // GPT-6 Luna
  gemini: { inPerM: 0.25, outPerM: 1.5 }, // Gemini 3.1 Flash-Lite
};

export function costUsd(
  tokens: { inputTokens: number; outputTokens: number },
  pricing: Pricing
): number {
  return (tokens.inputTokens * pricing.inPerM + tokens.outputTokens * pricing.outPerM) / 1_000_000;
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
  "the root element). Do not use `children` — the tree is assembled purely from " +
  "`parentKey` links.";

export const SYSTEM_PROMPT = `${catalog.prompt()}\n\n${JSON_OUTPUT_INSTRUCTIONS}`;

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
  const tree = flatToTree(elements as Parameters<typeof flatToTree>[0]);
  const result = catalog.validate(tree);
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
  return costUsd(
    { inputTokens: Math.ceil(chars / CHARS_PER_TOKEN_ESTIMATE), outputTokens: req.maxOutputTokens },
    provider.pricing
  );
}

async function guardedCall(provider: Provider, req: ProviderRequest, guard: SpendGuard) {
  guard.assertCanSpend(worstCaseUsd(provider, req));
  const res = await provider.call(req);
  const usd = costUsd(res, provider.pricing);
  guard.record(usd);
  return { res, usd };
}

function repairPrompt(error: string): string {
  return `The JSON failed validation:\n${error}\n\nReturn the corrected complete JSON object only.`;
}

async function runPrompt(
  provider: Provider,
  prompt: string,
  guard: SpendGuard
): Promise<PromptResult> {
  const base = { provider: provider.id, prompt };
  const first = await guardedCall(
    provider,
    {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    guard
  );
  const v1 = validateModelOutput(first.res.text);
  const tally = {
    inputTokens: first.res.inputTokens,
    outputTokens: first.res.outputTokens,
    usd: first.usd,
  };
  if (v1.ok) return { ...base, validFirstTry: true, validAfterRepair: true, ...tally };

  const repair = await guardedCall(
    provider,
    {
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: first.res.text },
        { role: "user", content: repairPrompt(v1.error) },
      ],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    guard
  );
  return {
    ...base,
    validFirstTry: false,
    validAfterRepair: validateModelOutput(repair.res.text).ok,
    inputTokens: tally.inputTokens + repair.res.inputTokens,
    outputTokens: tally.outputTokens + repair.res.outputTokens,
    usd: tally.usd + repair.usd,
  };
}

function errorResult(provider: Provider, prompt: string, err: unknown): PromptResult {
  return {
    provider: provider.id,
    prompt,
    validFirstTry: false,
    validAfterRepair: false,
    inputTokens: 0,
    outputTokens: 0,
    usd: 0,
    error: err instanceof Error ? err.message : String(err),
  };
}

export async function runBakeoff(opts: {
  providers: readonly Provider[];
  prompts: readonly string[];
  maxUsd: number;
}): Promise<BakeoffReport> {
  const guard = createSpendGuard(opts.maxUsd);
  const results: PromptResult[] = [];
  let abortReason: string | undefined;

  for (const provider of opts.providers) {
    let consecutiveErrors = 0;
    for (const prompt of opts.prompts) {
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
      try {
        const result = await runPrompt(provider, prompt, guard);
        results.push(result);
        consecutiveErrors = 0;
      } catch (err) {
        if (err instanceof SpendLimitError) {
          abortReason = err.message;
          break;
        }
        results.push(errorResult(provider, prompt, err));
        consecutiveErrors += 1;
      }
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
      return { text, inputTokens: Math.ceil(chars / 4), outputTokens: Math.ceil(text.length / 4) };
    },
  };
}

/* ── Reporting ───────────────────────────────── */

export interface ProviderSummary {
  readonly provider: ProviderId;
  readonly n: number;
  readonly errors: number;
  readonly validFirstTryPct: number;
  readonly validAfterRepairPct: number;
  readonly meanInputTokens: number;
  readonly meanOutputTokens: number;
  readonly totalUsd: number;
  readonly projectedUsdPer1k: number;
}

export function summarize(results: readonly PromptResult[]): ProviderSummary[] {
  const ids = [...new Set(results.map((r) => r.provider))];
  return ids.map((provider) => {
    const rows = results.filter((r) => r.provider === provider);
    const n = rows.length;
    const pct = (count: number) => (count / n) * 100;
    const mean = (pick: (r: PromptResult) => number) => rows.reduce((s, r) => s + pick(r), 0) / n;
    const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
    return {
      provider,
      n,
      errors: rows.filter((r) => r.error !== undefined).length,
      validFirstTryPct: pct(rows.filter((r) => r.validFirstTry).length),
      validAfterRepairPct: pct(rows.filter((r) => r.validAfterRepair).length),
      meanInputTokens: mean((r) => r.inputTokens),
      meanOutputTokens: mean((r) => r.outputTokens),
      totalUsd,
      projectedUsdPer1k: (totalUsd / n) * 1000,
    };
  });
}

export function formatTable(summaries: readonly ProviderSummary[]): string {
  const header =
    "| Provider | Valid 1st try | Valid after repair | Mean in tok | Mean out tok | Total $ | Projected $/1k gens | Errors |";
  const sep = "|---|---:|---:|---:|---:|---:|---:|---:|";
  const rows = summaries.map(
    (s) =>
      `| ${s.provider} | ${s.validFirstTryPct.toFixed(0)}% | ${s.validAfterRepairPct.toFixed(0)}% | ${s.meanInputTokens.toFixed(0)} | ${s.meanOutputTokens.toFixed(0)} | $${s.totalUsd.toFixed(4)} | $${s.projectedUsdPer1k.toFixed(2)} | ${s.errors}/${s.n} |`
  );
  return [header, sep, ...rows].join("\n");
}
