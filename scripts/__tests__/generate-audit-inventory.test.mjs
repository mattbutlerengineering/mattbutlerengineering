import { describe, it, expect } from "vitest";
import { SURFACE_REGISTRY as coreRegistry } from "@mbe/agent-core";
import { SURFACE_REGISTRY } from "../generate-audit-inventory.mjs";

// #3043: this script used to hand-maintain its own copy of SURFACE_REGISTRY,
// duplicating packages/agent-core/src/audit-surface-registry.ts with no
// compile-time signal on drift. This test guards that the script derives
// its surfaces from the agent-core registry instead of re-declaring them.
describe("generate-audit-inventory surface registry (single source of truth, #3043)", () => {
  it("re-exports the agent-core surface registry", () => {
    expect(Array.isArray(coreRegistry)).toBe(true);
    expect(coreRegistry.length).toBeGreaterThan(0);
    expect(SURFACE_REGISTRY).toBe(coreRegistry);
  });
});
