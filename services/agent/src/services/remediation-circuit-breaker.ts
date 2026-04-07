/**
 * In-memory circuit breaker for remediation webhooks.
 *
 * Prevents alert storms from spawning unlimited agent sessions.
 * Resets on process restart (acceptable — remediation is fire-and-forget).
 */

const FAILURE_THRESHOLD = 3;
const RESET_AFTER_MS = 30 * 60 * 1000; // 30 minutes

interface CircuitState {
  consecutiveFailures: number;
  lastFailureAt: number | null;
  isOpen: boolean;
  openedAt: number | null;
}

const state: CircuitState = {
  consecutiveFailures: 0,
  lastFailureAt: null,
  isOpen: false,
  openedAt: null,
};

export interface CircuitCheckResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export function checkCircuitBreaker(): CircuitCheckResult {
  if (!state.isOpen) {
    return { allowed: true };
  }

  const elapsed = Date.now() - (state.openedAt ?? 0);
  if (elapsed > RESET_AFTER_MS) {
    // Half-open: allow one attempt to see if things recovered
    state.isOpen = false;
    state.consecutiveFailures = 0;
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Circuit open — ${state.consecutiveFailures} consecutive remediation failures. Resets in ${Math.ceil((RESET_AFTER_MS - elapsed) / 60_000)} min.`,
  };
}

export function recordRemediationOutcome(succeeded: boolean): void {
  if (succeeded) {
    state.consecutiveFailures = 0;
    state.isOpen = false;
    state.openedAt = null;
  } else {
    state.consecutiveFailures++;
    state.lastFailureAt = Date.now();
    if (state.consecutiveFailures >= FAILURE_THRESHOLD) {
      state.isOpen = true;
      state.openedAt = Date.now();
    }
  }
}
