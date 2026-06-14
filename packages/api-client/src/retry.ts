const JITTER_FACTOR = 0.2;

export interface RetryOptions {
  /** Maximum number of additional attempts after the first failure. */
  maxRetries: number;
  /** Base delay in ms for attempt 0; doubles each subsequent attempt. */
  baseDelayMs: number;
  /**
   * Whether to apply ±20% jitter to prevent thundering herd.
   * Defaults to true.
   */
  jitter?: boolean;
  /**
   * Predicate to decide whether an error is retryable.
   * Defaults to always-retry (all errors are retried).
   */
  isRetryable?: (error: unknown) => boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, baseDelayMs: number, jitter: boolean): number {
  const base = baseDelayMs * Math.pow(2, attempt);
  if (!jitter) return base;
  const jitterAmount = base * JITTER_FACTOR * (2 * Math.random() - 1);
  return base + jitterAmount;
}

/**
 * Retry an async function with exponential backoff.
 *
 * Calls `fn()` up to `maxRetries + 1` times total. Between each attempt it
 * sleeps for `baseDelayMs * 2^attempt` (with optional ±20% jitter). If
 * `isRetryable` is provided, only errors passing the predicate are retried;
 * all others propagate immediately.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxRetries, baseDelayMs, jitter = true, isRetryable = () => true } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && isRetryable(error)) {
        await sleep(backoffMs(attempt, baseDelayMs, jitter));
        continue;
      }

      throw error;
    }
  }

  // Unreachable — loop always throws or returns, but TypeScript needs this.
  throw lastError;
}
