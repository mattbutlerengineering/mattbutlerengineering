import { describe, it, expect } from "vitest";
import {
  estimateIssueTokens,
  PER_TIER_COST_PER_MTOK_USD,
  PER_TIER_DEFAULT_TOKENS,
  MIN_HIGH_CONFIDENCE_ROWS,
} from "../token-estimator.js";
import type { TelemetryRow } from "../token-estimator.js";
import type { IssueInput } from "../model-router.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<IssueInput> = {}): IssueInput {
  return {
    title: "add a small thing",
    labels: ["feature"],
    body: "",
    ...overrides,
  };
}

function makeRow(overrides: Partial<TelemetryRow> = {}): TelemetryRow {
  return {
    issue_number: 1,
    labels: ["feature", "ready"],
    model_tier: "sonnet",
    subagent_tokens: 100,
    cost_usd: null,
    ...overrides,
  };
}

/** Expected token×rate cost for a tier. */
function expectedCost(tokens: number, tier: "haiku" | "sonnet" | "opus"): number {
  return (tokens / 1_000_000) * PER_TIER_COST_PER_MTOK_USD[tier];
}

// A simple-scope feature issue routes to sonnet.
const SONNET_ISSUE = makeIssue({ title: "add a small thing", labels: ["feature"], body: "" });

describe("estimateIssueTokens", () => {
  describe("median bucketing (tier + label overlap)", () => {
    it("returns the median tokens of the bucket for an odd row count", () => {
      const history: TelemetryRow[] = [
        makeRow({ subagent_tokens: 100 }),
        makeRow({ subagent_tokens: 300 }),
        makeRow({ subagent_tokens: 200 }),
      ];

      const est = estimateIssueTokens(SONNET_ISSUE, history);

      expect(est.estimatedTokens).toBe(200);
      expect(est.confidence).toBe("high");
      expect(est.estimatedCostUsd).toBeCloseTo(expectedCost(200, "sonnet"), 10);
      expect(est.basis).toContain("sonnet");
    });

    it("returns the average of the two middle values for an even row count", () => {
      const history: TelemetryRow[] = [
        makeRow({ subagent_tokens: 100 }),
        makeRow({ subagent_tokens: 200 }),
        makeRow({ subagent_tokens: 300 }),
        makeRow({ subagent_tokens: 400 }),
      ];

      const est = estimateIssueTokens(SONNET_ISSUE, history);

      expect(est.estimatedTokens).toBe(250);
      expect(est.confidence).toBe("high");
    });

    it("requires at least MIN_HIGH_CONFIDENCE_ROWS matching rows for high confidence", () => {
      const history: TelemetryRow[] = Array.from({ length: MIN_HIGH_CONFIDENCE_ROWS }, (_, i) =>
        makeRow({ subagent_tokens: 100 * (i + 1) })
      );

      const est = estimateIssueTokens(SONNET_ISSUE, history);
      expect(est.confidence).toBe("high");
    });
  });

  describe("cost derivation", () => {
    it("derives cost from tokens × per-tier rate when cost_usd is null", () => {
      const history: TelemetryRow[] = [
        makeRow({ subagent_tokens: 100, cost_usd: null }),
        makeRow({ subagent_tokens: 200, cost_usd: null }),
        makeRow({ subagent_tokens: 300, cost_usd: null }),
      ];

      const est = estimateIssueTokens(SONNET_ISSUE, history);

      expect(est.estimatedTokens).toBe(200);
      expect(est.estimatedCostUsd).toBeCloseTo(expectedCost(200, "sonnet"), 10);
    });

    it("derives cost from the bucket's cost_usd median when present", () => {
      const history: TelemetryRow[] = [
        makeRow({ subagent_tokens: 100, cost_usd: 0.5 }),
        makeRow({ subagent_tokens: 200, cost_usd: 1.5 }),
        makeRow({ subagent_tokens: 300, cost_usd: 2.5 }),
      ];

      const est = estimateIssueTokens(SONNET_ISSUE, history);

      expect(est.estimatedCostUsd).toBe(1.5);
    });
  });

  describe("cold-start fallback chain", () => {
    it("falls back to per-tier global median (medium) when no label-matched bucket", () => {
      // Issue labels do not overlap any historical row's labels, but all rows
      // are the same tier the issue routes to (sonnet).
      const issue = makeIssue({ title: "add a small thing", labels: ["feature"], body: "" });
      const history: TelemetryRow[] = [
        makeRow({ labels: ["ci-fix"], subagent_tokens: 100 }),
        makeRow({ labels: ["ci-fix"], subagent_tokens: 200 }),
        makeRow({ labels: ["ci-fix"], subagent_tokens: 300 }),
      ];

      const est = estimateIssueTokens(issue, history);

      expect(est.estimatedTokens).toBe(200);
      expect(est.confidence).toBe("medium");
      expect(est.estimatedCostUsd).toBeCloseTo(expectedCost(200, "sonnet"), 10);
    });

    it("falls back to the per-tier default constant (low) with no matching tier history", () => {
      const history: TelemetryRow[] = [
        makeRow({ model_tier: "haiku", labels: ["chore"], subagent_tokens: 50 }),
      ];

      const est = estimateIssueTokens(SONNET_ISSUE, history);

      expect(est.estimatedTokens).toBe(PER_TIER_DEFAULT_TOKENS.sonnet);
      expect(est.confidence).toBe("low");
      expect(est.estimatedCostUsd).toBeCloseTo(
        expectedCost(PER_TIER_DEFAULT_TOKENS.sonnet, "sonnet"),
        10
      );
    });
  });

  describe("empty / thin / malformed history safety", () => {
    it("never throws on empty history and returns the per-tier default (low)", () => {
      const est = estimateIssueTokens(SONNET_ISSUE, []);

      expect(est.estimatedTokens).toBe(PER_TIER_DEFAULT_TOKENS.sonnet);
      expect(est.confidence).toBe("low");
      expect(est.basis.length).toBeGreaterThan(0);
    });

    it("tolerates rows missing subagent_tokens without throwing", () => {
      const history: TelemetryRow[] = [
        makeRow({ subagent_tokens: undefined as unknown as number }),
        makeRow({ subagent_tokens: 200 }),
        makeRow({ subagent_tokens: 400 }),
        makeRow({ subagent_tokens: 300 }),
      ];

      const est = estimateIssueTokens(SONNET_ISSUE, history);

      // The malformed row is filtered; median of [200, 300, 400] is 300.
      expect(est.estimatedTokens).toBe(300);
      expect(est.confidence).toBe("high");
    });
  });
});
