import { describe, expect, it } from "vitest";
import { harmReason } from "./replay/rules.js";
import { runHarness } from "./replay/harness.js";
import { NIGHTS } from "./replay/nights.js";
import { PASS_BAR } from "./replay/pass-bar.js";
import { replayNight } from "./replay/replay.js";
import type { NightState, NightTable, NightWaitlistEntry } from "./replay/types.js";
import {
  MAX_PROPOSALS,
  PROPOSAL_LATENCY_BUDGET_MS,
  createProposalEngine,
  proposeMoves,
} from "./proposal-engine.js";

function table(id: string, capacity: number, status: NightTable["status"] = "AVAILABLE") {
  return { id, capacity, minCovers: 1, maxCovers: capacity, isActive: true, status };
}

function waiter(id: string, partySize: number, joinedAt: number, label?: string) {
  const entry: NightWaitlistEntry = { id, partySize, status: "waiting", joinedAt };
  return label === undefined ? entry : { ...entry, label };
}

describe("autopilot proposal engine on the night-replay harness", () => {
  it("clears the pass bar", () => {
    const report = runHarness(createProposalEngine());
    expect(report.aggregate.precision).toBeGreaterThanOrEqual(PASS_BAR.minPrecision);
    expect(report.aggregate.recall).toBeGreaterThanOrEqual(PASS_BAR.minRecall);
    expect(report.aggregate.harmful).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("is silent on every night where no move is correct", () => {
    const report = runHarness(createProposalEngine());
    for (const night of NIGHTS.filter((n) => n.goodMoves.length === 0)) {
      expect(report.nights.find((s) => s.nightId === night.id)!.suggestions).toBe(0);
    }
  });

  it("never proposes a harmful move on any night, and at most three per step with a reason", () => {
    const proposer = createProposalEngine();
    for (const night of NIGHTS) {
      for (const frame of replayNight(night, proposer)) {
        expect(frame.suggestions.length).toBeLessThanOrEqual(MAX_PROPOSALS);
        for (const s of frame.suggestions) {
          expect(harmReason(frame.state, s)).toBeNull();
          expect((s as { reason?: string }).reason ?? "").not.toBe("");
        }
      }
    }
  });

  it("is deterministic across runs", () => {
    const a = replayNight(NIGHTS[0]!, createProposalEngine());
    const b = replayNight(NIGHTS[0]!, createProposalEngine());
    expect(a).toEqual(b);
  });
});

describe("proposeMoves", () => {
  it("offers the longest-waiting party the best-fit table and says why", () => {
    const state: NightState = {
      tables: [table("T1", 6), table("T2", 2), table("T3", 4)],
      reservations: [],
      waitlist: [waiter("w2", 2, 20), waiter("w1", 2, 5, "the Garcias")],
    };
    const out = proposeMoves(state, 30);
    expect(out[0]).toMatchObject({ kind: "waitlist_offer", entryId: "w1", tableId: "T2" });
    expect(out[0]!.reason).toBe(
      "Seat the Garcias (2) at T2 — T2 is free and the best fit; they've waited 25 min"
    );
    expect(out[1]).toMatchObject({ kind: "waitlist_offer", entryId: "w2", tableId: "T3" });
  });

  it("holds the only 6-top for the party of 6 instead of giving it to a party of 2", () => {
    const state: NightState = {
      tables: [table("T1", 6), table("T2", 4)],
      reservations: [],
      waitlist: [waiter("w1", 4, 0), waiter("w2", 2, 1), waiter("w3", 6, 2, "the Garcias")],
    };
    const out = proposeMoves(state, 10);
    expect(
      out.map((p) => (p.kind === "waitlist_offer" ? `${p.entryId}>${p.tableId}` : ""))
    ).toEqual(["w1>T2", "w3>T1"]);
    expect(out.find((p) => p.kind === "waitlist_offer" && p.entryId === "w3")!.reason).toBe(
      "Seat the Garcias (6) at T1 — T1 is held back so larger waiting parties can all be seated; they've waited 8 min"
    );
  });

  it("seats the 5 and 6 on the 5-top and 6-top rather than the 2 on the 5-top (11 covers, not 7)", () => {
    const state: NightState = {
      tables: [table("Ta", 5), table("Tb", 6)],
      reservations: [],
      waitlist: [waiter("w1", 2, 0), waiter("w2", 5, 1), waiter("w3", 6, 2)],
    };
    const out = proposeMoves(state, 10);
    expect(
      out.map((p) => (p.kind === "waitlist_offer" ? `${p.entryId}>${p.tableId}` : ""))
    ).toEqual(["w2>Ta", "w3>Tb"]);
  });

  it("still gives a big table to a smaller party when no larger party needs it", () => {
    const state: NightState = {
      tables: [table("T1", 6)],
      reservations: [],
      waitlist: [waiter("w1", 2, 0), waiter("w2", 3, 1)],
    };
    expect(proposeMoves(state, 10)[0]).toMatchObject({ entryId: "w1", tableId: "T1" });
  });

  it("caps proposals at three", () => {
    const state: NightState = {
      tables: [table("T1", 2), table("T2", 2), table("T3", 2), table("T4", 2), table("T5", 2)],
      reservations: [],
      waitlist: [1, 2, 3, 4, 5].map((n) => waiter(`w${n}`, 2, n)),
    };
    expect(proposeMoves(state, 30)).toHaveLength(MAX_PROPOSALS);
  });

  it("never offers a table held for a booked reservation", () => {
    const state: NightState = {
      tables: [table("T1", 2)],
      reservations: [{ id: "r1", partySize: 2, tableId: "T1", phase: "booked" }],
      waitlist: [waiter("w1", 2, 0)],
    };
    expect(proposeMoves(state, 10)).toEqual([]);
  });

  it("reseats a small party to a small table to free a big one for a waiting big party", () => {
    const state: NightState = {
      tables: [table("T1", 2), table("T2", 6)],
      reservations: [
        { id: "r1", partySize: 2, tableId: "T2", phase: "arrived", label: "the Lees" },
      ],
      waitlist: [waiter("w1", 6, 0, "the Garcias")],
    };
    const out = proposeMoves(state, 12);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "reseat", reservationId: "r1", toTableId: "T1" });
    expect(out[0]!.reason).toBe(
      "Move the Lees (2) to T1 — frees T2 for the Garcias (6), waiting 12 min"
    );
  });

  it("does not reseat when nobody is waiting for the freed table", () => {
    const state: NightState = {
      tables: [table("T1", 2), table("T2", 6)],
      reservations: [{ id: "r1", partySize: 2, tableId: "T2", phase: "arrived" }],
      waitlist: [],
    };
    expect(proposeMoves(state, 12)).toEqual([]);
  });

  it("does not move a party that is already seated", () => {
    const state: NightState = {
      tables: [table("T1", 2), table("T2", 6, "OCCUPIED")],
      reservations: [{ id: "r1", partySize: 2, tableId: "T2", phase: "seated" }],
      waitlist: [waiter("w1", 6, 0)],
    };
    expect(proposeMoves(state, 12)).toEqual([]);
  });
});

describe("createProposalEngine", () => {
  it("does not repeat a proposal it already made while it stays valid", () => {
    const engine = createProposalEngine();
    const state: NightState = {
      tables: [table("T1", 2)],
      reservations: [],
      waitlist: [waiter("w1", 2, 0)],
    };
    const event = { at: 1, type: "waitlist_joined", entry: state.waitlist[0]! } as const;
    const first = engine.propose({ nightId: "n", at: 1, event, state });
    const second = engine.propose({ nightId: "n", at: 2, event: { ...event, at: 2 }, state });
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });
});

describe("latency", () => {
  /** A busy 40-table floor with 30 reservations and a 10-party waitlist. */
  function busyFloor(): NightState {
    const tables = Array.from({ length: 40 }, (_, i) =>
      table(`T${i}`, [2, 4, 6][i % 3]!, i % 4 === 0 ? "AVAILABLE" : "OCCUPIED")
    );
    const reservations = Array.from({ length: 30 }, (_, i) => ({
      id: `r${i}`,
      partySize: [2, 4][i % 2]!,
      tableId: `T${i + 5}`,
      phase: (["booked", "arrived", "seated"] as const)[i % 3]!,
    }));
    return {
      tables,
      reservations,
      waitlist: Array.from({ length: 10 }, (_, i) => waiter(`w${i}`, 2 + (i % 5), i)),
    };
  }

  it(`p95 stays under ${PROPOSAL_LATENCY_BUDGET_MS} ms on a 40-table / 30-reservation snapshot`, () => {
    const state = busyFloor();
    const samples: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const start = performance.now();
      proposeMoves(state, 60);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)]!;
    expect(p95).toBeLessThan(PROPOSAL_LATENCY_BUDGET_MS);
  });
});
