/**
 * In-memory circuit breaker for remediation webhooks.
 *
 * Prevents alert storms from spawning unlimited agent sessions.
 * Resets on process restart (acceptable — remediation is fire-and-forget).
 *
 * State is owned by a `createCircuitBreaker()` factory instance rather than a
 * module-level singleton, so multiple breakers can coexist and tests get a
 * clean instance each without side-channelling a reset through the API.
 */

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_RESET_AFTER_MS = 30 * 60 * 1000; // 30 minutes

interface CircuitState {
  consecutiveFailures: number;
  lastFailureAt: number | null;
  isOpen: boolean;
  openedAt: number | null;
}

export interface CircuitCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface CircuitBreaker {
  check(): CircuitCheckResult;
  recordOutcome(succeeded: boolean): void;
}

export function createCircuitBreaker(opts?: {
  failureThreshold?: number;
  resetAfterMs?: number;
}): CircuitBreaker {
  const failureThreshold = opts?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const resetAfterMs = opts?.resetAfterMs ?? DEFAULT_RESET_AFTER_MS;

  const state: CircuitState = {
    consecutiveFailures: 0,
    lastFailureAt: null,
    isOpen: false,
    openedAt: null,
  };

  return {
    check(): CircuitCheckResult {
      if (!state.isOpen) {
        return { allowed: true };
      }

      const elapsed = Date.now() - (state.openedAt ?? 0);
      if (elapsed > resetAfterMs) {
        // Half-open: allow one attempt to see if things recovered
        state.isOpen = false;
        state.consecutiveFailures = 0;
        return { allowed: true };
      }

      return {
        allowed: false,
        reason: `Circuit open — ${state.consecutiveFailures} consecutive remediation failures. Resets in ${Math.ceil((resetAfterMs - elapsed) / 60_000)} min.`,
      };
    },

    recordOutcome(succeeded: boolean): void {
      if (succeeded) {
        state.consecutiveFailures = 0;
        state.isOpen = false;
        state.openedAt = null;
      } else {
        state.consecutiveFailures++;
        state.lastFailureAt = Date.now();
        if (state.consecutiveFailures >= failureThreshold) {
          state.isOpen = true;
          state.openedAt = Date.now();
        }
      }
    },
  };
}

/**
 * Default production instance + back-compat free functions.
 *
 * Existing callers (`routes/remediation.ts`) use these. They delegate to a
 * single shared breaker, preserving the original behaviour. Once those callers
 * inject a `CircuitBreaker` instance, this default and the two shims can go.
 */
const defaultBreaker = createCircuitBreaker();

export function checkCircuitBreaker(): CircuitCheckResult {
  return defaultBreaker.check();
}

export function recordRemediationOutcome(succeeded: boolean): void {
  defaultBreaker.recordOutcome(succeeded);
}
