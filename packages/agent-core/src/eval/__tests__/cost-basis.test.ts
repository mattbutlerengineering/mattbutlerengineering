import { describe, it, expect } from "vitest";
import { costBasisForAdapter, isWithinBudget } from "../cost-basis.js";
import type { TaskBudget } from "../types.js";

const budget: TaskBudget = { maxTurns: 20, maxCostUsd: 0.5 };

describe("costBasisForAdapter", () => {
  it("treats the SDK adapter, opencode, and the auto cascade as billed money", () => {
    // `auto`'s first cascade member is the billed SDK adapter; its gemini
    // fallback reports $0, so the cost arm passes vacuously there anyway.
    expect(costBasisForAdapter("claude")).toBe("billed");
    expect(costBasisForAdapter("opencode")).toBe("billed");
    expect(costBasisForAdapter("auto")).toBe("billed");
  });

  it("treats claude-cli as API-equivalent — a real figure the CLI reports, not billed under a subscription", () => {
    expect(costBasisForAdapter("claude-cli")).toBe("api-equivalent");
  });

  it("treats gemini as having no cost figure at all (its JSON never carries USD)", () => {
    expect(costBasisForAdapter("gemini")).toBe("none");
  });
});

describe("isWithinBudget", () => {
  it("fails a billed run that is over the cost arm (bit-identical to the pre-existing inline check)", () => {
    expect(isWithinBudget({ costUsd: 1.37, numTurns: 5 }, budget, "billed")).toBe(false);
  });

  it("passes a billed run that is within both arms", () => {
    expect(isWithinBudget({ costUsd: 0.2, numTurns: 5 }, budget, "billed")).toBe(true);
  });

  it("fails a billed run that is over the turns arm even at $0", () => {
    expect(isWithinBudget({ costUsd: 0, numTurns: 21 }, budget, "billed")).toBe(false);
  });

  it("passes an api-equivalent run that is over cost but within turns — the cost arm does not apply", () => {
    // The brief's measured shape: one turn on this repo reports ~$1.37 of
    // API-equivalent cost (cached CLAUDE.md/rules context) against a $0.50
    // budget. Under a subscription no dollars are billed, so only turns bound.
    expect(isWithinBudget({ costUsd: 1.37, numTurns: 5 }, budget, "api-equivalent")).toBe(true);
  });

  it("still fails an api-equivalent run that is over the turns arm", () => {
    expect(isWithinBudget({ costUsd: 1.37, numTurns: 21 }, budget, "api-equivalent")).toBe(false);
  });

  it("treats `none` like api-equivalent — turns arm only", () => {
    expect(isWithinBudget({ costUsd: 1.37, numTurns: 5 }, budget, "none")).toBe(true);
    expect(isWithinBudget({ costUsd: 0, numTurns: 21 }, budget, "none")).toBe(false);
  });

  it("accepts the boundary values on both arms", () => {
    expect(isWithinBudget({ costUsd: 0.5, numTurns: 20 }, budget, "billed")).toBe(true);
  });
});
