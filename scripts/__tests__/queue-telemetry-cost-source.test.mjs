import { describe, it, expect } from "vitest";
import {
  buildCostIndex,
  modelTierFor,
  lookupCost,
  loadCostIndex,
} from "../lib/queue-telemetry-cost-source.mjs";

// Rows copied from docs/factory/costs.jsonl (Conductor runs for #6367).
const factoryCosts = [
  {
    wo: "#6367",
    run_id: "conductor-b20261012-6367-spec-1",
    model: "claude-fable-5",
    tokens: 443606,
    cost: 3.2625029999999997,
    outcome: "agent-failed",
    at: "2026-10-12",
  },
  {
    wo: "#6367",
    run_id: "conductor-b20261013-6367-build-1",
    model: "claude-sonnet-5",
    tokens: 6746394,
    cost: 2.16853,
    outcome: "agent-failed",
    at: "2026-10-13",
  },
  {
    wo: "#6367",
    run_id: "conductor-b20261013-6367-verify-1",
    model: "claude-sonnet-5",
    tokens: 3293844,
    cost: 1.2920984,
    outcome: "completed",
    at: "2026-10-13",
  },
];

// Row shape from .claude/agent-spend/sessions.jsonl (SpendEntry).
const spendRow = {
  date: "2026-10-08",
  timestamp: "2026-10-08T00:36:56.826Z",
  costUsd: 0.5272442999999999,
  model: "claude-sonnet-5",
  adapter: "claude-cli",
  status: "succeeded",
  inputTokens: 22,
  outputTokens: 3032,
  numTurns: 11,
};

describe("buildCostIndex", () => {
  it("sums every Conductor run for an issue into one entry", () => {
    const index = buildCostIndex({ factoryCosts, spendSessions: [] });
    const expected = factoryCosts.reduce((s, r) => s + r.cost, 0);
    expect(index.size).toBe(1);
    expect(index.get(6367).costUsd).toBeCloseTo(expected, 10);
    expect(index.get(6367).models.sort()).toEqual(["claude-fable-5", "claude-sonnet-5"]);
  });

  it("ignores spend sessions without a numeric issueNumber", () => {
    const index = buildCostIndex({
      factoryCosts: [],
      spendSessions: [spendRow, { ...spendRow, issueNumber: "12" }],
    });
    expect(index.size).toBe(0);
  });

  it("adds attributed spend sessions onto the same issue", () => {
    const index = buildCostIndex({
      factoryCosts,
      spendSessions: [{ ...spendRow, issueNumber: 6367 }],
    });
    const expected = factoryCosts.reduce((s, r) => s + r.cost, 0) + spendRow.costUsd;
    expect(index.get(6367).costUsd).toBeCloseTo(expected, 10);
  });

  it("skips malformed rows instead of throwing", () => {
    const index = buildCostIndex({
      factoryCosts: [
        null,
        "x",
        { wo: "nope", cost: 1 },
        { wo: "#5", cost: "1" },
        { wo: "#7", cost: 2, model: "claude-sonnet-5" },
      ],
      spendSessions: [undefined, { issueNumber: 7, costUsd: NaN }],
    });
    expect([...index.keys()]).toEqual([7]);
    expect(index.get(7).costUsd).toBe(2);
  });

  it("never derives dollars from tokens", () => {
    const index = buildCostIndex({
      factoryCosts: [{ wo: "#9", model: "claude-sonnet-5", tokens: 1_000_000 }],
      spendSessions: [],
    });
    expect(index.has(9)).toBe(false);
  });

  it("tolerates missing inputs", () => {
    expect(buildCostIndex({}).size).toBe(0);
  });
});

describe("modelTierFor", () => {
  it("maps a family substring to its tier", () => {
    expect(modelTierFor(["claude-sonnet-5"])).toBe("sonnet");
    expect(modelTierFor(["claude-opus-5-5"])).toBe("opus");
    expect(modelTierFor(["claude-haiku-5-5"])).toBe("haiku");
  });

  it("returns null for a model outside the tier enum", () => {
    expect(modelTierFor(["claude-fable-5"])).toBeNull();
  });

  it("returns null for mixed tiers and empty input", () => {
    expect(modelTierFor(["claude-sonnet-5", "claude-opus-5"])).toBeNull();
    expect(modelTierFor(["claude-sonnet-5", "claude-fable-5"])).toBeNull();
    expect(modelTierFor([])).toBeNull();
  });

  it("accepts several models of one tier", () => {
    expect(modelTierFor(["claude-sonnet-5", "claude-sonnet-4"])).toBe("sonnet");
  });
});

describe("lookupCost", () => {
  it("returns cost and tier for an indexed issue", () => {
    const index = buildCostIndex({
      factoryCosts: [{ wo: "#7", cost: 2, model: "claude-sonnet-5" }],
    });
    expect(lookupCost(index, 7)).toEqual({ costUsd: 2, modelTier: "sonnet" });
  });

  it("flags an unmapped model with a null tier but keeps the cost", () => {
    const index = buildCostIndex({ factoryCosts });
    const r = lookupCost(index, 6367);
    expect(r.modelTier).toBeNull();
    expect(r.reason).toBe("unmapped-model");
    expect(typeof r.costUsd).toBe("number");
  });

  it("returns no-ledger-row and no number for an unindexed issue", () => {
    expect(lookupCost(new Map(), 1)).toEqual({
      costUsd: null,
      modelTier: null,
      reason: "no-ledger-row",
    });
  });
});

describe("loadCostIndex", () => {
  it("treats missing files as empty", () => {
    const readFile = () => {
      throw Object.assign(new Error("nope"), { code: "ENOENT" });
    };
    expect(loadCostIndex({ root: "/x", readFile }).size).toBe(0);
  });

  it("reads both ledgers and skips malformed lines", () => {
    const files = {
      "/r/docs/factory/costs.jsonl": `${JSON.stringify(factoryCosts[0])}\nnot json\n`,
      "/r/.claude/agent-spend/sessions.jsonl": `${JSON.stringify({ ...spendRow, issueNumber: 6367 })}\n`,
    };
    const readFile = (p) => {
      if (!(p in files)) throw Object.assign(new Error("nope"), { code: "ENOENT" });
      return files[p];
    };
    const index = loadCostIndex({ root: "/r", readFile });
    expect(index.get(6367).costUsd).toBeCloseTo(factoryCosts[0].cost + spendRow.costUsd, 10);
  });

  it("works against the real repo ledgers with defaults", () => {
    expect(loadCostIndex({}).get(6367)?.costUsd).toBeGreaterThan(0);
  });
});
