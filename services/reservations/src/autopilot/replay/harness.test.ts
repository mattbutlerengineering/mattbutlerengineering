import { describe, expect, it } from "vitest";
import { NIGHTS } from "./nights.js";
import { replayNight } from "./replay.js";
import { runHarness } from "./harness.js";
import { neverSuggests } from "./baseline-proposer.js";
import { PASS_BAR, passesBar, passesNightBar } from "./pass-bar.js";
import type { NightScore } from "./scorer.js";
import type { Proposer } from "./types.js";

const baseScore: NightScore = {
  nightId: "n",
  suggestions: 0,
  truePositives: 0,
  falsePositives: 0,
  harmful: 0,
  missed: 0,
  precision: 1,
  recall: 1,
  f1: 1,
};

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

  it("a night with no good moves must have zero suggestions, whatever the pool says", () => {
    expect(passesNightBar({ ...baseScore, suggestions: 1, falsePositives: 1 })).toBe(false);
    expect(passesNightBar({ ...baseScore, suggestions: 1, harmful: 1 })).toBe(false);
    expect(passesNightBar(baseScore)).toBe(true);
    // A night that has good moves is not held to the zero-suggestion rule.
    expect(
      passesNightBar({ ...baseScore, suggestions: 2, truePositives: 1, falsePositives: 1 })
    ).toBe(true);
  });

  it("a proposer that is noisy only on a quiet night fails the report", () => {
    const noisy: Proposer = {
      name: "noisy-on-quiet",
      propose: (input) => {
        const good = oracle.propose(input);
        if (input.nightId !== "oversized-party" || input.at !== 5) return good;
        // There is no correct move on this night, so any suggestion is noise.
        return [{ kind: "waitlist_offer", entryId: "w1", tableId: "T1" }];
      },
    };
    const report = runHarness(noisy);
    const quiet = report.nights.find((n) => n.nightId === "oversized-party")!;
    expect(quiet.suggestions).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
  });

  it("runHarness reports passed for the oracle", () => {
    expect(runHarness(oracle).passed).toBe(true);
  });
});

describe("replay", () => {
  it("moves a table to OCCUPIED when a reservation is seated there", () => {
    const night = NIGHTS.find((n) => n.id === "quiet-night")!;
    const frames = replayNight(night, neverSuggests);
    const seated = frames.find((f) => f.event.type === "reservation_seated")!;
    expect(seated.state.tables.find((t) => t.id === "T1")!.status).toBe("OCCUPIED");
  });

  it("stamps joinedAt on waitlist entries that join during the night", () => {
    const night = NIGHTS.find((n) => n.id === "early-turn-waitlist")!;
    const frames = replayNight(night, neverSuggests);
    const last = frames[frames.length - 1]!;
    expect(last.state.waitlist.find((w) => w.id === "w1")!.joinedAt).toBe(10);
  });
});

describe("corpus breadth", () => {
  it("has at least eight nights", () => {
    expect(NIGHTS.length).toBeGreaterThanOrEqual(8);
  });

  it("has a night where the only 6-top must go to the party of 6, not a party of 2", () => {
    const night = NIGHTS.find((n) => n.id === "scarce-big-table")!;
    expect(night.goodMoves.map((m) => m.suggestion)).toEqual([
      { kind: "waitlist_offer", entryId: "w3", tableId: "T1" },
      { kind: "waitlist_offer", entryId: "w1", tableId: "T2" },
    ]);
    const greedy: Proposer = {
      name: "greedy-small-first",
      propose: ({ at }) =>
        at === 13 ? [{ kind: "waitlist_offer", entryId: "w2", tableId: "T1" }] : [],
    };
    const report = runHarness(greedy, [night]);
    expect(report.aggregate.harmful).toBe(0);
    expect(report.aggregate.falsePositives).toBe(1);
  });

  it("has a night whose only correct move is the best-fit of two legal tables", () => {
    const night = NIGHTS.find((n) => n.id === "best-fit-choice")!;
    expect(night.goodMoves).toHaveLength(1);
    const wrong: Proposer = {
      name: "worst-fit",
      propose: ({ at }) =>
        at === 10 ? [{ kind: "waitlist_offer", entryId: "w1", tableId: "T1" }] : [],
    };
    const report = runHarness(wrong, [night]);
    expect(report.aggregate.harmful).toBe(0);
    expect(report.aggregate.falsePositives).toBe(1);
    expect(report.aggregate.recall).toBe(0);
  });

  it("has a night where a legal move made late is a false positive", () => {
    const night = NIGHTS.find((n) => n.id === "late-offer")!;
    const late: Proposer = {
      name: "late",
      propose: ({ at }) =>
        at === 50 ? [{ kind: "waitlist_offer", entryId: "w1", tableId: "T1" }] : [],
    };
    const report = runHarness(late, [night]);
    expect(report.aggregate.harmful).toBe(0);
    expect(report.aggregate.falsePositives).toBe(1);
    expect(report.aggregate.truePositives).toBe(0);
  });
});
