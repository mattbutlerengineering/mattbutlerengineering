import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * Creates a minimal async generator that yields each message in order.
 *
 * Use with vitest's `mockReturnValue`:
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
