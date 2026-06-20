import { describe, it, expect } from "vitest";
import { createSessionConcurrency } from "./session-concurrency.js";

describe("session-concurrency", () => {
  it("admits up to the injected limit", () => {
    const gate = createSessionConcurrency(2);

    expect(gate.canStart()).toBe(true);
    expect(gate.acquire("a")).toBe(true);
    expect(gate.acquire("b")).toBe(true);
    expect(gate.activeCount()).toBe(2);
  });

  it("rejects once at capacity", () => {
    const gate = createSessionConcurrency(2);

    gate.acquire("a");
    gate.acquire("b");

    expect(gate.canStart()).toBe(false);
    expect(gate.acquire("c")).toBe(false);
    expect(gate.activeCount()).toBe(2);
  });

  it("re-admits after a release frees a slot", () => {
    const gate = createSessionConcurrency(2);

    gate.acquire("a");
    gate.acquire("b");
    expect(gate.acquire("c")).toBe(false);

    gate.release("a");

    expect(gate.canStart()).toBe(true);
    expect(gate.acquire("c")).toBe(true);
    expect(gate.activeCount()).toBe(2);
  });

  it("exposes the configured limit for messaging", () => {
    const gate = createSessionConcurrency(7);
    expect(gate.limit).toBe(7);
  });

  it("acquire is idempotent for an already-held id (no double-count)", () => {
    const gate = createSessionConcurrency(2);

    expect(gate.acquire("a")).toBe(true);
    // Re-acquiring the same id must not consume a second slot.
    expect(gate.acquire("a")).toBe(true);
    expect(gate.activeCount()).toBe(1);
  });

  it("release of an unknown id is a no-op", () => {
    const gate = createSessionConcurrency(2);
    gate.acquire("a");

    gate.release("never-acquired");

    expect(gate.activeCount()).toBe(1);
  });

  it("monitor-cancels-then-route-admits goes through the same atomic count (no over-subscription)", () => {
    // Single shared gate is the only owner of the count. The monitor frees a
    // slot via release(); the route then admits via the same gate's acquire().
    // Both paths read+mutate one count, so a freed slot can be re-used exactly
    // once — never double-spent.
    const gate = createSessionConcurrency(2);

    gate.acquire("running-1");
    gate.acquire("running-2");
    expect(gate.canStart()).toBe(false);

    // Liveness monitor cancels a stale session — releases its slot.
    gate.release("running-1");

    // Exactly one slot is now free: the first admit wins, the second is rejected.
    expect(gate.acquire("incoming-1")).toBe(true);
    expect(gate.acquire("incoming-2")).toBe(false);
    expect(gate.activeCount()).toBe(2);
  });
});
