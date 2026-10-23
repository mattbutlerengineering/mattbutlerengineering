/**
 * Plain-`fetch` provider adapters for the bake-off (#6948). No SDK dependency:
 * the repo's `ai` package lives only in services/agent, and three REST calls are
 * smaller than a new dependency edge. API keys are passed in by the caller
 * (read from env in the CLI), sent only in headers, and redacted from errors.
 */
import {
  PRICING,
  type Pricing,
  type Provider,
  type ProviderId,
  type ProviderRequest,
  type ProviderResponse,
} from "./gen-ui-bakeoff-lib.ts";

type FetchLike = typeof fetch;

export const DEFAULT_MODELS: Readonly<Record<ProviderId, string>> = {
  anthropic: "claude-haiku-5-5",
  openai: "gpt-6-luna",
  gemini: "gemini-3.1-flash-lite",
};

export const ENV_KEYS: Readonly<Record<ProviderId, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const LABELS: Readonly<Record<ProviderId, string>> = {
  anthropic: "Claude Haiku 5.5",
  openai: "GPT-6 Luna",
  gemini: "Gemini 3.1 Flash-Lite",
};

interface Wire {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

function anthropicWire(key: string, model: string, req: ProviderRequest): Wire {
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: {
      model,
      max_tokens: req.maxOutputTokens,
      // Same ephemeral cache breakpoint gen-runner.ts sets on the system message.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
      ...(req.effort ? { output_config: { effort: req.effort } } : {}),
    },
  };
}

function openaiWire(key: string, model: string, req: ProviderRequest): Wire {
  return {
    url: "https://api.openai.com/v1/chat/completions",
    headers: { authorization: `Bearer ${key}` },
    body: {
      model,
      max_completion_tokens: req.maxOutputTokens,
      response_format: { type: "json_object" },
      ...(req.effort ? { reasoning_effort: req.effort } : {}),
      messages: [{ role: "system", content: req.system }, ...req.messages],
    },
  };
}

function geminiWire(key: string, model: string, req: ProviderRequest): Wire {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { "x-goog-api-key": key },
    body: {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        maxOutputTokens: req.maxOutputTokens,
        responseMimeType: "application/json",
        ...(req.effort ? { thinkingConfig: { thinkingLevel: req.effort } } : {}),
      },
    },
  };
}

type Parsed = ProviderResponse;
// Vendor responses are untrusted JSON: describe only the fields we read, all optional.
interface AnthropicJson {
  content?: { type?: string; text?: string }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}
interface OpenAiJson {
  choices?: { message?: { content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}
interface GeminiJson {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

const PARSERS: { readonly [K in ProviderId]: (json: unknown) => Parsed } = {
  anthropic: (raw) => {
    const j = raw as AnthropicJson;
    // Anthropic reports `input_tokens` as the uncached remainder only.
    const read = j.usage?.cache_read_input_tokens ?? 0;
    const write = j.usage?.cache_creation_input_tokens ?? 0;
    return {
      text: (j.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join(""),
      inputTokens: (j.usage?.input_tokens ?? 0) + read + write,
      outputTokens: j.usage?.output_tokens ?? 0,
      cacheReadTokens: read,
      cacheWriteTokens: write,
    };
  },
  openai: (raw) => {
    const j = raw as OpenAiJson;
    return {
      text: j.choices?.[0]?.message?.content ?? "",
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
      cacheReadTokens: j.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };
  },
  gemini: (raw) => {
    const j = raw as GeminiJson;
    return {
      text: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
      inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
      cacheReadTokens: j.usageMetadata?.cachedContentTokenCount ?? 0,
      // Thinking tokens are reported separately but billed at the output rate.
      outputTokens:
        (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0),
    };
  },
};

const WIRES = { anthropic: anthropicWire, openai: openaiWire, gemini: geminiWire } as const;

// Free-tier per-minute quotas (Gemini: ~10-15 RPM) 429 mid-run; a bounded retry
// lets one invocation finish instead of losing whole arms. 429 only — any other
// status still fails fast on the first response.
const MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 120_000;

type SleepLike = (ms: number) => Promise<void>;
const realSleep: SleepLike = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelayMs(res: Response): number {
  const header = Number(res.headers.get("retry-after"));
  if (!Number.isFinite(header) || header <= 0) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(header * 1000, MAX_RETRY_DELAY_MS);
}

export function createProvider(
  id: ProviderId,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  model: string = DEFAULT_MODELS[id],
  pricing: Pricing = PRICING[id],
  sleep: SleepLike = realSleep
): Provider {
  const redact = (s: string) => s.split(apiKey).join("[redacted]");
  return {
    id,
    label: LABELS[id],
    model,
    pricing,
    call: async (req) => {
      const wire = WIRES[id](apiKey, model, req);
      let res: Response;
      for (let attempt = 1; ; attempt += 1) {
        res = await fetchImpl(wire.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...wire.headers },
          body: JSON.stringify(wire.body),
        });
        if (res.status !== 429 || attempt >= MAX_ATTEMPTS) break;
        await sleep(retryDelayMs(res));
      }
      if (!res.ok) {
        const detail = redact((await res.text()).slice(0, 300));
        throw new Error(`HTTP ${res.status} from ${id}: ${detail}`);
      }
      const parse = PARSERS[id];
      return parse(await res.json());
    },
  };
}
