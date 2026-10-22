import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock("./database.js", () => ({ prisma: prismaMock }));

import {
  GEN_DAILY_CEILING_DEFAULT_USD,
  resolveGenDailyCeilingUsd,
  genCostMicroUsd,
  secondsUntilNextWindow,
  getGenSpendToday,
  recordGenSpend,
  trackGenSpend,
  isSpendTrackingDegraded,
  resetSpendTrackingForTests,
  failedGenCostMicroUsd,
  GEN_WRITE_FAILURE_LIMIT,
  GEN_DEGRADED_PROBE_MS,
} from "./gen-spend-ceiling.js";
import { GEN_MAX_OUTPUT_TOKENS } from "../routes/gen-stream.js";

beforeEach(() => {
  vi.clearAllMocks();
  resetSpendTrackingForTests();
});

describe("resolveGenDailyCeilingUsd", () => {
  it("uses the conservative default when unset", () => {
    expect(resolveGenDailyCeilingUsd(undefined)).toBe(GEN_DAILY_CEILING_DEFAULT_USD);
    expect(resolveGenDailyCeilingUsd("")).toBe(GEN_DAILY_CEILING_DEFAULT_USD);
  });

  it("falls back to the default (never opens the tap) on garbage or negatives", () => {
    for (const raw of ["abc", "-5", "NaN", "Infinity"]) {
      expect(resolveGenDailyCeilingUsd(raw)).toBe(GEN_DAILY_CEILING_DEFAULT_USD);
    }
  });

  it("honours an explicit override, including 0 as a kill switch", () => {
    expect(resolveGenDailyCeilingUsd("12.5")).toBe(12.5);
    expect(resolveGenDailyCeilingUsd("0")).toBe(0);
  });
});

describe("genCostMicroUsd", () => {
  it("prices fresh input at base, output at output rate", () => {
    // 1M in @ $0.10 + 1M out @ $0.50 = $0.60
    expect(genCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, {})).toBe(600_000);
  });

  it("prices cache reads at a tenth of base input, not at full rate", () => {
    const meta = { anthropic: { cacheReadInputTokens: 1_000_000, cacheCreationInputTokens: 0 } };
    // inputTokens includes the cached tokens: all 1M are cache reads = $0.01
    expect(genCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, meta)).toBe(10_000);
  });

  it("prices cache writes at 1.25x base input", () => {
    const meta = { anthropic: { cacheReadInputTokens: 0, cacheCreationInputTokens: 1_000_000 } };
    expect(genCostMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, meta)).toBe(125_000);
  });

  it("treats missing usage as zero", () => {
    expect(genCostMicroUsd({}, undefined)).toBe(0);
  });
});

describe("secondsUntilNextWindow", () => {
  it("counts down to the next UTC midnight", () => {
    expect(secondsUntilNextWindow(new Date("2026-10-22T23:59:00Z"))).toBe(60);
  });
});

describe("storage", () => {
  it("reads today's accumulated spend", async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ generations: 3, cost_micro_usd: 1_500_000n }]);
    await expect(getGenSpendToday(new Date("2026-10-22T10:00:00Z"))).resolves.toEqual({
      generations: 3,
      costMicroUsd: 1_500_000,
    });
  });

  it("reports zero when the window has no row yet", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);
    await expect(getGenSpendToday()).resolves.toEqual({ generations: 0, costMicroUsd: 0 });
  });

  it("records spend with one atomic upsert", async () => {
    prismaMock.$executeRaw.mockResolvedValue(1);
    await recordGenSpend(4200, new Date("2026-10-22T10:00:00Z"));
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings] = prismaMock.$executeRaw.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join("?")).toMatch(/ON CONFLICT/i);
  });
});

describe("write-failure tracking (the guard must not silently stop guarding)", () => {
  it("degrades after consecutive write failures and recovers on a success", async () => {
    prismaMock.$executeRaw.mockRejectedValue(new Error("read-only replica"));
    const log = { error: vi.fn() };
    for (let i = 0; i < GEN_WRITE_FAILURE_LIMIT; i++) {
      expect(isSpendTrackingDegraded()).toBe(false);
      await trackGenSpend(100, log as never);
    }
    expect(isSpendTrackingDegraded()).toBe(true);

    prismaMock.$executeRaw.mockResolvedValue(1);
    await trackGenSpend(100, log as never);
    expect(isSpendTrackingDegraded()).toBe(false);
  });
});

describe("degraded recovery (half-open probe)", () => {
  it("lets one probe request through after the cooldown, and heals on a good write", async () => {
    prismaMock.$executeRaw.mockRejectedValue(new Error("blip"));
    const log = { error: vi.fn() };
    for (let i = 0; i < GEN_WRITE_FAILURE_LIMIT; i++) await trackGenSpend(1, log as never);
    const t0 = Date.now();

    expect(isSpendTrackingDegraded(t0)).toBe(true);
    expect(isSpendTrackingDegraded(t0 + GEN_DEGRADED_PROBE_MS)).toBe(false); // the probe
    expect(isSpendTrackingDegraded(t0 + GEN_DEGRADED_PROBE_MS + 1)).toBe(true); // others still refused

    prismaMock.$executeRaw.mockResolvedValue(1);
    await trackGenSpend(1, log as never);
    expect(isSpendTrackingDegraded(t0 + GEN_DEGRADED_PROBE_MS + 2)).toBe(false);
  });
});

describe("failedGenCostMicroUsd", () => {
  it("charges the worst-case output cap for a generation that never reached onFinish", () => {
    expect(failedGenCostMicroUsd()).toBe(Math.round(GEN_MAX_OUTPUT_TOKENS * 0.5));
  });
});
