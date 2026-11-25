import { describe, expect, it } from "vitest";
import { NIGHTS } from "./nights.js";
import { replayNight } from "./replay.js";
import { runHarness } from "./harness.js";
import { neverSuggests } from "./baseline-proposer.js";
import { PASS_BAR, passesBar } from "./pass-bar.js";
import type { Proposer } from "./types.js";

/** Test-only proposer that suggests the known-good move at the start of its window (a perfect oracle). */
const oracle: Proposer = {
  name: "oracle",
  propose: ({ at, nightId }) =>
    NIGHTS.find((n) => n.id === nightId)!
      .goodMoves.filter((m) => m.windowStart === at)
      .map((m) => m.suggestion),
};

/** Deliberately harmful: offers every waiting entry the first table, every event. */
const reckless: Proposer = {
  name: "reckless",
  propose: ({ state }) =>
    state.waitlist.map((w) => ({
      kind: "waitlist_offer",
      entryId: w.id,
      tableId: state.tables[0]!.id,
    })),
};

describe("night fixtures", () => {
  it("has at least 3 nights, including a night where no move is correct", () => {
    expect(NIGHTS.length).toBeGreaterThanOrEqual(3);
    expect(NIGHTS.some((n) => n.goodMoves.length === 0)).toBe(true);
    expect(NIGHTS.some((n) => n.goodMoves.some((m) => m.suggestion.kind === "reseat"))).toBe(true);
    expect(
      NIGHTS.some((n) => n.goodMoves.some((m) => m.suggestion.kind === "waitlist_offer"))
    ).toBe(true);
  });

  it.each(NIGHTS.map((n) => [n.id, n] as const))("%s replays deterministically", (_id, night) => {
    const a = replayNight(night, neverSuggests);
    const b = replayNight(night, neverSuggests);
    expect(a).toEqual(b);
    expect(a).toHaveLength(night.events.length);
  });

  it.each(NIGHTS.map((n) => [n.id, n] as const))(
    "%s: every known-good move is itself legal at its window start",
    (_id, night) => {
      const report = runHarness(
        {
          name: "g",
          propose: ({ at }) =>
            night.goodMoves.filter((m) => m.windowStart === at).map((m) => m.suggestion),
        },
        [night]
      );
      expect(report.aggregate.harmful).toBe(0);
      expect(report.aggregate.recall).toBe(1);
    }
  );
});

describe("harness", () => {
  it("defines a pass bar", () => {
    expect(PASS_BAR.minPrecision).toBeGreaterThan(0);
    expect(PASS_BAR.minRecall).toBeGreaterThan(0);
    expect(PASS_BAR.maxHarmful).toBe(0);
  });

  it("scores the baseline proposer (and it does not clear the bar)", () => {
    const report = runHarness(neverSuggests);
    expect(report.nights).toHaveLength(NIGHTS.length);
    expect(report.aggregate.suggestions).toBe(0);
    expect(report.aggregate.recall).toBe(0);
    expect(passesBar(report.aggregate)).toBe(false);
  });

  it("an oracle clears the bar", () => {
    expect(passesBar(runHarness(oracle).aggregate)).toBe(true);
  });

  it("a deliberately harmful proposer fails the bar", () => {
    const report = runHarness(reckless);
    expect(report.aggregate.harmful).toBeGreaterThan(0);
    expect(passesBar(report.aggregate)).toBe(false);
  });
});
