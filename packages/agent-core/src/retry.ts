/**
 * Exponential backoff retry wrapper for idempotent operations.
 *
 * Retries on transient errors (network timeouts, rate limits, git push failures)
 * with configurable backoff and jitter.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  readonly baseDelayMs: number;
  /** Maximum delay in milliseconds (default: 30000) */
  readonly maxDelayMs: number;
  /** Predicate to determine if an error is retryable (default: isTransientError) */
  readonly isRetryable: (error: unknown) => boolean;
}

export interface RetryResult<T> {
  readonly value: T;
  readonly attempts: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  isRetryable: isTransientError,
};

// ── Error classification ────────────────────────────────────────────

const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ENETUNREACH/i,
  /EPIPE/i,
  /socket hang up/i,
  /network\s+error/i,
  /rate\s*limit/i,
  /429/,
  /502/,
  /503/,
  /504/,
  /Could not resolve host/i,
  /Connection timed out/i,
  /fetch failed/i,
  /unable to access/i,
  /Could not read from remote/i,
];

/**
 * Determine whether an error is transient and safe to retry.
 * Matches network errors, rate limits, and temporary server errors.
 */
export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message));
}

// ── Context window exhaustion detection ─────────────────────────────

const CONTEXT_WINDOW_PATTERNS: readonly RegExp[] = [
  /context\s*(?:window|length)\s*(?:exceeded|exhausted|limit)/i,
  /maximum\s*context\s*length/i,
  /token\s*limit\s*(?:exceeded|reached)/i,
  /max_tokens_exceeded/i,
  /prompt\s*is\s*too\s*long/i,
  /input\s*too\s*long/i,
  /context_length_exceeded/i,
];

/**
 * Detect whether an error indicates context window exhaustion.
 * These errors are NOT retryable since repeating the same request
 * will hit the same limit.
 */
export function isContextWindowExhausted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CONTEXT_WINDOW_PATTERNS.some((pattern) => pattern.test(message));
}

// ── Delay calculation ───────────────────────────────────────────────

/**
 * Calculate delay with exponential backoff and jitter.
 * Uses full jitter strategy: delay = random(0, min(maxDelay, base * 2^attempt))
 */
export function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(maxDelayMs, exponentialDelay);
  // Full jitter: random value between 50% and 100% of capped delay
  return cappedDelay * (0.5 + Math.random() * 0.5);
}

// ── Retry wrapper ───────────────────────────────────────────────────

/**
 * Execute an async function with exponential backoff retry.
 *
 * Only retries when the error matches the retryable predicate.
 * Context window exhaustion errors are never retried and throw
 * a descriptive ContextWindowExhaustedError.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  configOverrides: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...configOverrides };

  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;

      // Context window errors are never retryable
      if (isContextWindowExhausted(error)) {
        throw new ContextWindowExhaustedError(
          error instanceof Error ? error.message : String(error)
        );
      }

      // If not retryable or out of retries, throw immediately
      if (!config.isRetryable(error) || attempt >= config.maxRetries) {
        throw error;
      }

      // Wait before retrying
      const delay = calculateDelay(attempt, config.baseDelayMs, config.maxDelayMs);
      await sleep(delay);
    }
  }

  // Unreachable, but TypeScript needs it
  throw lastError;
}

// ── Context window exhaustion error ─────────────────────────────────

export class ContextWindowExhaustedError extends Error {
  readonly name = "ContextWindowExhaustedError" as const;

  constructor(originalMessage: string) {
    super(
      `Context window exhausted: ${originalMessage}. ` +
        "The session has consumed all available context. " +
        "Consider breaking the task into smaller sub-tasks."
    );
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
