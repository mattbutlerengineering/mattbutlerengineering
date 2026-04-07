/**
 * Circuit breaker for API proxy requests.
 *
 * Uses KV to track failure counts and circuit state with TTL.
 * States: CLOSED (normal), OPEN (blocking), HALF_OPEN (testing recovery).
 *
 * Immutable pattern: all state transitions return new state objects,
 * never mutating existing ones.
 */

const CIRCUIT_BREAKER_KEY = "circuit-breaker:api";
const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_SECONDS = 30;

/**
 * Default (closed) circuit state.
 * @returns {Readonly<{state: string, failures: number, lastFailure: null, openedAt: null}>}
 */
function defaultState() {
  return Object.freeze({
    state: "closed",
    failures: 0,
    lastFailure: null,
    openedAt: null,
  });
}

/**
 * Read circuit breaker state from KV.
 * Returns default closed state if nothing stored.
 */
async function getCircuitState(kv) {
  try {
    const stored = await kv.get(CIRCUIT_BREAKER_KEY, "json");
    return stored ? Object.freeze(stored) : defaultState();
  } catch {
    return defaultState();
  }
}

/**
 * Persist circuit breaker state to KV with TTL.
 * Open circuits expire after OPEN_DURATION_SECONDS so they auto-close
 * even if no half-open probe runs.
 */
async function saveCircuitState(kv, circuitState) {
  const ttl = circuitState.state === "open" ? OPEN_DURATION_SECONDS + 10 : 120;
  await kv.put(CIRCUIT_BREAKER_KEY, JSON.stringify(circuitState), {
    expirationTtl: ttl,
  });
}

/**
 * Determine whether the circuit should allow a request through.
 *
 * - CLOSED: always allow
 * - OPEN: block unless OPEN_DURATION_SECONDS have elapsed (transition to HALF_OPEN)
 * - HALF_OPEN: allow exactly one probe request
 *
 * Returns { allowed: boolean, currentState: object, updatedState: object | null }
 * updatedState is non-null only when a state transition happened.
 */
function shouldAllowRequest(circuitState, nowMs) {
  if (circuitState.state === "closed") {
    return { allowed: true, currentState: circuitState, updatedState: null };
  }

  if (circuitState.state === "open") {
    const elapsed = nowMs - circuitState.openedAt;
    if (elapsed >= OPEN_DURATION_SECONDS * 1000) {
      // Transition to half-open: allow one probe
      const halfOpen = Object.freeze({
        ...circuitState,
        state: "half_open",
      });
      return { allowed: true, currentState: circuitState, updatedState: halfOpen };
    }
    return { allowed: false, currentState: circuitState, updatedState: null };
  }

  // half_open: allow one probe
  if (circuitState.state === "half_open") {
    return { allowed: true, currentState: circuitState, updatedState: null };
  }

  // Unknown state — fail open (allow)
  return { allowed: true, currentState: circuitState, updatedState: null };
}

/**
 * Record a successful request. Resets the circuit to closed.
 * Returns the new state.
 */
function recordSuccess(circuitState) {
  if (circuitState.state === "closed" && circuitState.failures === 0) {
    return circuitState; // No change needed
  }
  return Object.freeze(defaultState());
}

/**
 * Record a failed request. Increments failure count and potentially opens the circuit.
 * Returns the new state.
 */
function recordFailure(circuitState, nowMs) {
  const newFailures = circuitState.failures + 1;

  if (circuitState.state === "half_open" || newFailures >= FAILURE_THRESHOLD) {
    return Object.freeze({
      state: "open",
      failures: newFailures,
      lastFailure: nowMs,
      openedAt: nowMs,
    });
  }

  return Object.freeze({
    ...circuitState,
    failures: newFailures,
    lastFailure: nowMs,
  });
}

export {
  CIRCUIT_BREAKER_KEY,
  FAILURE_THRESHOLD,
  OPEN_DURATION_SECONDS,
  defaultState,
  getCircuitState,
  saveCircuitState,
  shouldAllowRequest,
  recordSuccess,
  recordFailure,
};
