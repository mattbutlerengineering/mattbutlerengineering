/**
 * The part that decides whether the client half is an enumeration or a guess.
 *
 * A driver that quietly stops driving something produces a smaller inventory,
 * a greener guard, and no signal at all — the same shape as the defects this
 * whole run exists to catch. These are the assertions that make that
 * impossible, each one exercised rather than described.
 */
import { describe, it, expect, beforeAll } from "vitest";

import type { DepositTransition } from "@mbe/api-client";

import {
  driveClient,
  rosterMethodNames,
  EXEMPT_METHODS,
  DEPOSIT_TRANSITION_ARGS,
} from "./client-inventory.js";
import type { ClientInventory, Invocation } from "./client-inventory.js";
import { PLACEHOLDER } from "./types.js";

let inventory: ClientInventory;

beforeAll(async () => {
  inventory = await driveClient();
});

/**
 * The oracle this design rejects, implemented here so the rejection is a
 * measurement and not an opinion: "did the set of distinct paths grow?".
 */
function methodsThatGrewNoSet(invocations: readonly Invocation[], pairs: ClientInventory["pairs"]) {
  const firstProducerOf = new Set(pairs.map((pair) => pair.producedBy[0]));
  return invocations
    .filter((invocation) => !invocation.exempt && !firstProducerOf.has(invocation.clientMethod))
    .map((invocation) => invocation.clientMethod);
}

describe("every roster method is driven or exempt", () => {
  it("leaves no method unaccounted for", () => {
    const attempted = new Set(inventory.invocations.map((i) => i.clientMethod));
    const unaccounted = rosterMethodNames().filter((name) => !attempted.has(name));

    expect(unaccounted, "a new client method was added but never driven").toEqual([]);
  });

  it("drives nothing that is not on the roster", () => {
    const known = new Set(rosterMethodNames());
    const strays = [...new Set(inventory.invocations.map((i) => i.clientMethod))].filter(
      (name) => !known.has(name)
    );

    expect(strays).toEqual([]);
  });
});

describe("per-invocation request counting", () => {
  it("fails any non-exempt method that issued nothing in its own invocation", () => {
    const silent = inventory.invocations
      .filter((invocation) => !invocation.exempt && invocation.requestCount === 0)
      .map((invocation) => invocation.clientMethod);

    expect(silent, "a client method stopped issuing a request").toEqual([]);
  });

  it("counts per invocation, so the three path-reusing aliases are not false positives", () => {
    // floor-plans.ts:39-41 (get -> getById), :65-67 (activate -> setActive)
    // and reservations.ts:145-157 (cancelWithReason -> the same PATCH as
    // update) each emit a path an earlier method already emitted. They issue a
    // real request and must count as one.
    for (const alias of [
      "floorPlans.get",
      "floorPlans.activate",
      "reservations.cancelWithReason",
    ]) {
      const invocation = inventory.invocations.find((i) => i.clientMethod === alias);
      expect(invocation, `${alias} was never driven`).toBeDefined();
      expect(invocation?.requestCount, `${alias} issued no request`).toBeGreaterThan(0);
    }
  });

  it("shows the set-growth oracle really would flag those three", () => {
    // Not a hypothetical: the naive check is run here and its output asserted,
    // so "count per invocation, not set growth" is a measurement. If this ever
    // returns [] the trap has gone away and this test should go with it.
    const falsePositives = methodsThatGrewNoSet(inventory.invocations, inventory.pairs);

    expect(falsePositives).toEqual(
      expect.arrayContaining([
        "floorPlans.get",
        "floorPlans.activate",
        "reservations.cancelWithReason",
      ])
    );
  });
});

describe("the exempt list", () => {
  it("gives a reason for every entry", () => {
    for (const [method, reason] of Object.entries(EXEMPT_METHODS)) {
      expect(reason.length, `${method} has no reason`).toBeGreaterThan(10);
    }
  });

  it("exempts only methods that actually exist", () => {
    // A stale exempt entry is a place for a real method to hide: it would be
    // silently skipped by the zero-request check above.
    const known = new Set(rosterMethodNames());
    const stale = Object.keys(EXEMPT_METHODS).filter((name) => !known.has(name));

    expect(stale).toEqual([]);
  });

  it("exempts only methods that really issue nothing", () => {
    for (const method of Object.keys(EXEMPT_METHODS)) {
      const invocation = inventory.invocations.find((i) => i.clientMethod === method);
      expect(invocation?.requestCount, `${method} is exempt but issued a request`).toBe(0);
    }
  });
});

describe("the deposit transition map", () => {
  it("puts all three transition paths in the inventory", () => {
    const paths = inventory.pairs.map((pair) => `${pair.method} ${pair.path}`);

    for (const action of Object.keys(DEPOSIT_TRANSITION_ARGS)) {
      expect(paths).toContain(`POST /api/v1/deposits/${PLACEHOLDER}/${action}`);
    }
    expect(Object.keys(DEPOSIT_TRANSITION_ARGS)).toHaveLength(3);
  });

  it("is exhaustive at compile time, which is where vitest cannot help", () => {
    // @ts-expect-error — `forfeit` is missing, and a Record keyed by the union
    // rejects that. This line IS the demonstration: if adding a fourth
    // DepositTransition member ever stopped being a compile error, the
    // directive would become unused and `tsc --noEmit` would fail on it
    // ("Unused '@ts-expect-error' directive"). So the gate cannot rot into
    // prose, and it is checked on every CI run, not just the one that wrote it.
    const incomplete: Record<DepositTransition, readonly unknown[]> = {
      capture: [PLACEHOLDER, "capture"],
      refund: [PLACEHOLDER, "refund"],
    };

    expect(Object.keys(incomplete)).toHaveLength(2);
  });
});
