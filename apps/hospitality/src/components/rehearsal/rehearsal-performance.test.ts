import { describe, it, expect } from "vitest";
import { mulberry32 } from "./prng";
import { rehearsalStateAt } from "./rehearsal-state";
import { buildRehearsalView } from "./rehearsal-view-model";
import { simulateService, type RehearsalTable } from "./simulate-service";

/**
 * Compute budget (architecture.md "Performance budget" item 1, the merge gate, SC-12): an 80-table
 * room must simulate in at most 50 ms and answer "what is true at minute m" in at most 5 ms
 * median and 20 ms p95. Local reference is about 1 ms; the bounds carry about 4x CI-runner slack.
 * The Playwright half (render at 240x) reports, never fails, in e2e/dress-rehearsal.spec.ts.
 */
const OPEN = 17 * 60;
const CLOSE = 23 * 60;
const SEEDS = 20;
const SAMPLES = 1000;
const SIMULATE_BUDGET_MS = 50;
const MEDIAN_BUDGET_MS = 5;
const P95_BUDGET_MS = 20;

const ROOM: readonly RehearsalTable[] = Array.from({ length: 80 }, (_, i) => {
  const capacity = i % 4 === 0 ? 6 : i % 4 === 1 ? 2 : 4;
  return {
    id: `table-${i}`,
    name: `Table ${i}`,
    capacity,
    minCovers: capacity === 2 ? 1 : 2,
    maxCovers: capacity,
  };
});

const now = () => performance.now();
const percentile = (sorted: readonly number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] as number;

describe("rehearsal compute budget on 80 tables (SC-12)", () => {
  it(`simulates a night in at most ${SIMULATE_BUDGET_MS} ms for each of ${SEEDS} seeds`, () => {
    // Warm the JIT once so the first call is not what the budget measures.
    simulateService({
      tables: ROOM,
      openMinute: OPEN,
      closeMinute: CLOSE,
      profile: "friday",
      seed: 0,
    });
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const start = now();
      const events = simulateService({
        tables: ROOM,
        openMinute: OPEN,
        closeMinute: CLOSE,
        profile: "friday",
        seed,
      });
      const took = now() - start;
      expect(events.length).toBeGreaterThan(500);
      expect(took, `seed ${seed}`).toBeLessThanOrEqual(SIMULATE_BUDGET_MS);
    }
  });

  it(`answers a minute in at most ${MEDIAN_BUDGET_MS} ms median and ${P95_BUDGET_MS} ms p95`, () => {
    const events = simulateService({
      tables: ROOM,
      openMinute: OPEN,
      closeMinute: CLOSE,
      profile: "friday",
      seed: 7,
    });
    const tableIds = ROOM.map((table) => table.id);
    const anchor = new Date("2026-10-19T20:00:00Z");
    const random = mulberry32(99);
    const durations: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const minute = OPEN + random() * (CLOSE - OPEN);
      const start = now();
      const state = rehearsalStateAt(events, minute, CLOSE);
      buildRehearsalView({
        state,
        seed: 7,
        tableIds,
        now: anchor,
        timeZone: "America/Los_Angeles",
        partyName: (size) => `Party of ${size}`,
      });
      durations.push(now() - start);
    }
    const sorted = [...durations].sort((a, b) => a - b);
    expect(percentile(sorted, 0.5)).toBeLessThanOrEqual(MEDIAN_BUDGET_MS);
    expect(percentile(sorted, 0.95)).toBeLessThanOrEqual(P95_BUDGET_MS);
  });
});
