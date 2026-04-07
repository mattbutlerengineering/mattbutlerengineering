/**
 * Tests for the circuit breaker module.
 *
 * Run: npx vitest run infrastructure/worker/circuit-breaker.test.js
 */

import { describe, it, expect, vi } from "vitest";
import {
  FAILURE_THRESHOLD,
  OPEN_DURATION_SECONDS,
  defaultState,
  getCircuitState,
  saveCircuitState,
  shouldAllowRequest,
  recordSuccess,
  recordFailure,
} from "./circuit-breaker.js";

// ── Helpers ──────────────────────────────────────────────────────────

function createMockKv(data = null) {
  return {
    get: vi.fn(async () => data),
    put: vi.fn(async () => {}),
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Circuit Breaker", () => {
  describe("defaultState", () => {
    it("returns a frozen closed state", () => {
      const state = defaultState();
      expect(state.state).toBe("closed");
      expect(state.failures).toBe(0);
      expect(state.lastFailure).toBeNull();
      expect(state.openedAt).toBeNull();
      expect(Object.isFrozen(state)).toBe(true);
    });
  });

  describe("getCircuitState", () => {
    it("returns default state when KV has no data", async () => {
      const kv = createMockKv(null);
      const state = await getCircuitState(kv);
      expect(state.state).toBe("closed");
      expect(state.failures).toBe(0);
    });

    it("returns stored state from KV", async () => {
      const stored = { state: "open", failures: 3, lastFailure: 1000, openedAt: 1000 };
      const kv = createMockKv(stored);
      const state = await getCircuitState(kv);
      expect(state.state).toBe("open");
      expect(state.failures).toBe(3);
      expect(Object.isFrozen(state)).toBe(true);
    });

    it("returns default state on KV error", async () => {
      const kv = { get: vi.fn(async () => { throw new Error("KV down"); }) };
      const state = await getCircuitState(kv);
      expect(state.state).toBe("closed");
    });
  });

  describe("saveCircuitState", () => {
    it("saves state with longer TTL when open", async () => {
      const kv = createMockKv();
      const openState = { state: "open", failures: 3, lastFailure: 1000, openedAt: 1000 };
      await saveCircuitState(kv, openState);
      expect(kv.put).toHaveBeenCalledWith(
        "circuit-breaker:api",
        JSON.stringify(openState),
        { expirationTtl: OPEN_DURATION_SECONDS + 10 }
      );
    });

    it("saves state with standard TTL when closed", async () => {
      const kv = createMockKv();
      await saveCircuitState(kv, defaultState());
      expect(kv.put).toHaveBeenCalledWith(
        "circuit-breaker:api",
        expect.any(String),
        { expirationTtl: 120 }
      );
    });
  });

  describe("shouldAllowRequest", () => {
    it("allows requests when circuit is closed", () => {
      const result = shouldAllowRequest(defaultState(), Date.now());
      expect(result.allowed).toBe(true);
      expect(result.updatedState).toBeNull();
    });

    it("blocks requests when circuit is open and within timeout", () => {
      const now = Date.now();
      const openState = Object.freeze({
        state: "open",
        failures: 3,
        lastFailure: now,
        openedAt: now,
      });
      const result = shouldAllowRequest(openState, now + 1000); // 1s later
      expect(result.allowed).toBe(false);
      expect(result.updatedState).toBeNull();
    });

    it("transitions to half_open after timeout expires", () => {
      const openedAt = Date.now();
      const openState = Object.freeze({
        state: "open",
        failures: 3,
        lastFailure: openedAt,
        openedAt,
      });
      const afterTimeout = openedAt + OPEN_DURATION_SECONDS * 1000;
      const result = shouldAllowRequest(openState, afterTimeout);
      expect(result.allowed).toBe(true);
      expect(result.updatedState).not.toBeNull();
      expect(result.updatedState.state).toBe("half_open");
    });

    it("allows probe request in half_open state", () => {
      const halfOpen = Object.freeze({
        state: "half_open",
        failures: 3,
        lastFailure: Date.now(),
        openedAt: Date.now(),
      });
      const result = shouldAllowRequest(halfOpen, Date.now());
      expect(result.allowed).toBe(true);
    });
  });

  describe("recordSuccess", () => {
    it("returns same state when already closed with no failures", () => {
      const state = defaultState();
      const result = recordSuccess(state);
      expect(result).toBe(state); // Same reference — no change
    });

    it("resets to closed state from half_open", () => {
      const halfOpen = Object.freeze({
        state: "half_open",
        failures: 3,
        lastFailure: 1000,
        openedAt: 1000,
      });
      const result = recordSuccess(halfOpen);
      expect(result.state).toBe("closed");
      expect(result.failures).toBe(0);
    });

    it("resets to closed state from closed with failures", () => {
      const degraded = Object.freeze({
        state: "closed",
        failures: 2,
        lastFailure: 1000,
        openedAt: null,
      });
      const result = recordSuccess(degraded);
      expect(result.state).toBe("closed");
      expect(result.failures).toBe(0);
    });
  });

  describe("recordFailure", () => {
    it("increments failure count in closed state", () => {
      const now = Date.now();
      const result = recordFailure(defaultState(), now);
      expect(result.state).toBe("closed");
      expect(result.failures).toBe(1);
      expect(result.lastFailure).toBe(now);
    });

    it("opens circuit after reaching failure threshold", () => {
      const now = Date.now();
      const twoFailures = Object.freeze({
        state: "closed",
        failures: 2,
        lastFailure: now - 1000,
        openedAt: null,
      });
      const result = recordFailure(twoFailures, now);
      expect(result.state).toBe("open");
      expect(result.failures).toBe(3);
      expect(result.openedAt).toBe(now);
    });

    it("opens circuit immediately from half_open on failure", () => {
      const now = Date.now();
      const halfOpen = Object.freeze({
        state: "half_open",
        failures: 3,
        lastFailure: now - 30000,
        openedAt: now - 30000,
      });
      const result = recordFailure(halfOpen, now);
      expect(result.state).toBe("open");
      expect(result.openedAt).toBe(now);
    });

    it("returns frozen state objects", () => {
      const result = recordFailure(defaultState(), Date.now());
      expect(Object.isFrozen(result)).toBe(true);
    });
  });
});
