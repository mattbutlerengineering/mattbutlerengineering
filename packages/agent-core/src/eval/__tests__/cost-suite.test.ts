import { describe, it, expect } from "vitest";
import { COST_SUITE_DIR, resolveSuitePath } from "../cost-suite.js";

describe("cost suite resolver", () => {
  it("exports COST_SUITE_DIR pointing to the cost subdirectory", () => {
    expect(COST_SUITE_DIR).toBe("packages/agent-core/eval-suite/cost");
  });

  it("resolveSuitePath maps 'cost' to COST_SUITE_DIR", () => {
    expect(resolveSuitePath("cost")).toBe(COST_SUITE_DIR);
  });

  it("resolveSuitePath passes unknown names through unchanged", () => {
    expect(resolveSuitePath("packages/agent-core/eval-suite")).toBe(
      "packages/agent-core/eval-suite"
    );
  });
});
