import { describe, expect, it } from "vitest";
import type { Suggestion } from "./types.js";
import { scoreNight, aggregate } from "./scorer.js";
import { NIGHTS } from "./nights.js";
import { replayNight } from "./replay.js";

const night = NIGHTS.find((n) => n.id === "big-party-reseat")!;
const [reseat, offer] = night.goodMoves;

function run(pick: (_unused: number, at: number) => Suggestion[]) {
  const frames = replayNight(night, {
    name: "t",
    propose: ({ at }) => pick(0, at),
  });
  return scoreNight(night, frames);
}

describe("scoreNight", () => {
  it("perfect proposer: full precision and recall", () => {
    const frames = replayNight(night, {
      name: "oracle",
      propose: ({ at }) =>
        night.goodMoves.filter((m) => m.windowStart === at).map((m) => m.suggestion),
    });
    const s = scoreNight(night, frames);
    expect(s).toMatchObject({
      truePositives: 2,
      falsePositives: 0,
      harmful: 0,
      precision: 1,
      recall: 1,
      f1: 1,
    });
  });

  it("empty proposer: precision vacuously 1, recall 0", () => {
    const s = run(() => []);
    expect(s).toMatchObject({ truePositives: 0, precision: 1, recall: 0, f1: 0 });
  });

  it("flags a double-booking offer as harmful", () => {
    // At the moment T1 frees up, T2 is still planned for the arrived party.
    const s = run((_, at) =>
      at === reseat!.windowStart ? [{ kind: "waitlist_offer", entryId: "w1", tableId: "T2" }] : []
    );
    expect(s.harmful).toBe(1);
    expect(s.precision).toBe(0);
  });

  it("flags a suggestion onto an occupied table as harmful", () => {
    const s = run((_, at) =>
      at === reseat!.windowStart ? [{ kind: "reseat", reservationId: "r1", toTableId: "T3" }] : []
    );
    expect(s.harmful).toBe(1);
  });

  it("flags a party-size violation as harmful", () => {
    const s = run((_, at) =>
      at === offer!.windowStart ? [{ kind: "waitlist_offer", entryId: "w1", tableId: "T1" }] : []
    );
    expect(s.harmful).toBe(1);
  });

  it("noisy proposer: duplicates and wrong-but-legal moves are false positives", () => {
    const s = run((_, at) =>
      at === reseat!.windowStart ? [reseat!.suggestion, reseat!.suggestion] : []
    );
    expect(s.truePositives).toBe(1);
    expect(s.falsePositives).toBe(1);
    expect(s.precision).toBeCloseTo(0.5);
  });

  it("a suggestion outside its window is a false positive", () => {
    const s = run((_, at) => (at === 5 ? [reseat!.suggestion] : []));
    expect(s.truePositives).toBe(0);
    expect(s.harmful + s.falsePositives).toBe(1);
  });

  it("penalises any suggestion on a night where no move is correct", () => {
    const quiet = NIGHTS.find((n) => n.goodMoves.length === 0)!;
    const frames = replayNight(quiet, {
      name: "noisy",
      propose: ({ state }) => [
        { kind: "waitlist_offer", entryId: "nobody", tableId: state.tables[0]!.id },
      ],
    });
    const s = scoreNight(quiet, frames);
    expect(s.falsePositives + s.harmful).toBeGreaterThan(0);
    expect(s.precision).toBe(0);
  });
});

describe("aggregate", () => {
  it("sums counts across nights and derives the score", () => {
    const a = aggregate([
      {
        nightId: "a",
        truePositives: 1,
        falsePositives: 0,
        harmful: 0,
        missed: 0,
        suggestions: 1,
        precision: 1,
        recall: 1,
        f1: 1,
      },
      {
        nightId: "b",
        truePositives: 0,
        falsePositives: 1,
        harmful: 0,
        missed: 1,
        suggestions: 1,
        precision: 0,
        recall: 0,
        f1: 0,
      },
    ]);
    expect(a.truePositives).toBe(1);
    expect(a.falsePositives).toBe(1);
    expect(a.precision).toBeCloseTo(0.5);
    expect(a.recall).toBeCloseTo(0.5);
  });
});
