/**
 * Mock Claude client for cost-free agent testing.
 *
 * Supports two modes:
 * - replay: return pre-recorded fixture responses in sequence
 * - deterministic: generate predictable responses based on input
 *
 * Also supports error injection for testing error-handling paths.
 */

import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

// ── Types ────────────────────────────────────────────────────────────

export type MockMode = "replay" | "deterministic";

export interface MockTokenUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_creation_input_tokens: number;
  readonly cache_read_input_tokens: number;
}

export interface MockResultMessage {
  readonly type: "result";
  readonly subtype: "success" | "error_max_turns" | "error_during_turn";
  readonly uuid: string;
  readonly session_id: string;
  readonly duration_ms: number;
  readonly duration_api_ms: number;
  readonly is_error: boolean;
  readonly num_turns: number;
  readonly result: string;
  readonly stop_reason: string;
  readonly total_cost_usd: number;
  readonly usage: MockTokenUsage;
  readonly modelUsage: Record<string, unknown>;
  readonly permission_denials: unknown[];
  readonly errors?: readonly string[];
}

export interface MockClientOptions {
  /**
   * Mode of operation.
   * - "replay": returns messages from `fixtures` in order, cycling back if exhausted
   * - "deterministic": generates a minimal success result for every call
   */
  readonly mode?: MockMode;

  /**
   * Pre-recorded message sequences to replay. Each call to `query()` consumes
   * the next sequence. Sequences cycle once exhausted.
   */
  readonly fixtures?: readonly (readonly SDKMessage[])[];

  /**
   * When set, inject this error on the Nth call (1-based). Useful for testing
   * retry and error-handling paths.
   */
  readonly errorOnCall?: number;

  /**
   * Error to throw when `errorOnCall` is triggered.
   */
  readonly errorToInject?: Error;

  /**
   * Simulated latency in milliseconds per yielded message. Default: 0.
   */
  readonly simulatedLatencyMs?: number;

  /**
   * Token counts for deterministic mode. Defaults to 1000 input / 200 output.
   */
  readonly deterministicTokens?: Readonly<{ input: number; output: number }>;

  /**
   * Cost per call in deterministic mode. Default: 0.01.
   */
  readonly deterministicCostUsd?: number;
}

export interface MockCallRecord {
  readonly callIndex: number;
  readonly prompt: string;
  readonly model: string;
  readonly timestamp: string;
}

// ── Default deterministic result ─────────────────────────────────────

function buildDeterministicResult(
  callIndex: number,
  tokens: Readonly<{ input: number; output: number }>,
  costUsd: number
): MockResultMessage {
  return {
    type: "result",
    subtype: "success",
    uuid: `mock-uuid-${callIndex}`,
    session_id: `mock-session-${callIndex}`,
    duration_ms: 1000,
    duration_api_ms: 900,
    is_error: false,
    num_turns: 3,
    result: `Mock task completed successfully (call ${callIndex})`,
    stop_reason: "end_turn",
    total_cost_usd: costUsd,
    usage: {
      input_tokens: tokens.input,
      output_tokens: tokens.output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
  };
}

// ── Mock client factory ───────────────────────────────────────────────

export interface MockClaudeClient {
  /**
   * Drop-in replacement for the `query` function from `@anthropic-ai/claude-agent-sdk`.
   * Returns an async generator that yields SDKMessages.
   */
  readonly query: (options: {
    prompt: string;
    model?: string;
    [key: string]: unknown;
  }) => AsyncGenerator<SDKMessage | SDKResultMessage>;

  /**
   * History of all calls made to `query`.
   */
  readonly calls: readonly MockCallRecord[];

  /**
   * Reset call history and fixture cursor.
   */
  readonly reset: () => void;

  /**
   * Total simulated cost across all calls.
   */
  readonly totalCostUsd: () => number;

  /**
   * Total simulated token usage across all calls.
   */
  readonly totalTokenUsage: () => Readonly<{ input: number; output: number }>;
}

/**
 * Creates a minimal async generator that yields each message in order.
 *
 * Drop-in replacement for the inline `mockQueryGenerator` helper that
 * agent-core test files used to define locally. Use with vitest's
 * `mockReturnValue`:
 *
 * ```typescript
 * vi.mocked(query).mockReturnValue(
 *   createMockQueryStream([mockResult]) as ReturnType<typeof query>
 * );
 * ```
 */
export async function* createMockQueryStream(
  messages: unknown[]
): AsyncGenerator<SDKMessage | SDKResultMessage> {
  for (const msg of messages) {
    yield msg as SDKMessage | SDKResultMessage;
  }
}

export function createMockClaudeClient(options: MockClientOptions = {}): MockClaudeClient {
  const {
    mode = "deterministic",
    fixtures = [],
    errorOnCall,
    errorToInject = new Error("Injected mock error"),
    simulatedLatencyMs = 0,
    deterministicTokens = { input: 1000, output: 200 },
    deterministicCostUsd = 0.01,
  } = options;

  let callCount = 0;
  let fixtureIndex = 0;
  const callHistory: MockCallRecord[] = [];
  const costHistory: number[] = [];
  const tokenHistory: Array<Readonly<{ input: number; output: number }>> = [];

  async function* query(queryOptions: {
    prompt: string;
    model?: string;
    [key: string]: unknown;
  }): AsyncGenerator<SDKMessage | SDKResultMessage> {
    callCount += 1;
    const currentCall = callCount;

    callHistory.push({
      callIndex: currentCall,
      prompt: queryOptions.prompt,
      model: queryOptions.model ?? "unknown",
      timestamp: new Date().toISOString(),
    });

    // Inject error if configured
    if (errorOnCall !== undefined && currentCall === errorOnCall) {
      throw errorToInject;
    }

    if (simulatedLatencyMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, simulatedLatencyMs));
    }

    if (mode === "replay" && fixtures.length > 0) {
      // Cycle through fixtures
      const sequence = fixtures[fixtureIndex % fixtures.length];
      fixtureIndex += 1;

      for (const message of sequence) {
        if (simulatedLatencyMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, simulatedLatencyMs));
        }
        yield message;
      }

      // Track cost from result message if present
      const resultMsg = sequence.find((m): m is SDKResultMessage => m.type === "result");
      const cost = (resultMsg as SDKResultMessage | undefined)?.total_cost_usd ?? 0;
      const inputTokens = (resultMsg as SDKResultMessage | undefined)?.usage?.input_tokens ?? 0;
      const outputTokens = (resultMsg as SDKResultMessage | undefined)?.usage?.output_tokens ?? 0;
      costHistory.push(cost);
      tokenHistory.push({ input: inputTokens, output: outputTokens });
    } else {
      // Deterministic mode: yield a single success result
      const result = buildDeterministicResult(
        currentCall,
        deterministicTokens,
        deterministicCostUsd
      );
      costHistory.push(deterministicCostUsd);
      tokenHistory.push({ input: deterministicTokens.input, output: deterministicTokens.output });
      yield result as unknown as SDKMessage;
    }
  }

  function reset(): void {
    callCount = 0;
    fixtureIndex = 0;
    callHistory.length = 0;
    costHistory.length = 0;
    tokenHistory.length = 0;
  }

  function totalCostUsd(): number {
    return costHistory.reduce((sum, c) => sum + c, 0);
  }

  function totalTokenUsage(): Readonly<{ input: number; output: number }> {
    return tokenHistory.reduce(
      (acc, t) => ({ input: acc.input + t.input, output: acc.output + t.output }),
      { input: 0, output: 0 }
    );
  }

  return {
    query,
    get calls(): readonly MockCallRecord[] {
      return [...callHistory];
    },
    reset,
    totalCostUsd,
    totalTokenUsage,
  };
}
