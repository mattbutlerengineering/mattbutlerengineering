import { describe, expect, it } from "vitest";
import { harmReason } from "./replay/rules.js";
import { buildLiveSnapshot, type LiveSnapshotInput } from "./live-snapshot.js";
import { proposeMoves } from "./proposal-engine.js";

const NOW = "2026-11-24T19:00:00.000Z";

function input(overrides: Partial<LiveSnapshotInput> = {}): LiveSnapshotInput {
  return {
    now: NOW,
    tables: [
      {
        id: "T1",
        name: "Table 1",
        capacity: 2,
        minCovers: 1,
        maxCovers: 2,
        isActive: true,
        status: "AVAILABLE",
      },
      {
        id: "T2",
        name: "Table 2",
        capacity: 6,
        minCovers: 2,
        maxCovers: 6,
        isActive: true,
        status: "OCCUPIED",
      },
    ],
    reservations: [],
    waitlist: [],
    ...overrides,
  };
}

function reservation(
  id: string,
  status: LiveSnapshotInput["reservations"][number]["status"],
  tableId: string,
  startTime: string
) {
  return {
    id,
    status,
    tableId,
    partySize: 2,
    startTime,
    endTime: "2026-11-24T21:00:00.000Z",
    guestName: "Lee",
  };
}

describe("buildLiveSnapshot reservation phase mapping", () => {
  const phase = (r: ReturnType<typeof reservation>, arrived?: readonly string[]) =>
    buildLiveSnapshot(input({ reservations: [r], arrivedReservationIds: arrived })).state
      .reservations[0]!.phase;

  it("maps PENDING and CONFIRMED on a free table to booked", () => {
    expect(phase(reservation("r", "PENDING", "T1", "2026-11-24T20:00:00.000Z"))).toBe("booked");
    expect(phase(reservation("r", "CONFIRMED", "T1", "2026-11-24T20:00:00.000Z"))).toBe("booked");
  });

  it("maps a started CONFIRMED reservation on an OCCUPIED table to seated", () => {
    expect(phase(reservation("r", "CONFIRMED", "T2", "2026-11-24T18:30:00.000Z"))).toBe("seated");
  });

  it("keeps a future booking on an OCCUPIED table booked (the previous party is still there)", () => {
    expect(phase(reservation("r", "CONFIRMED", "T2", "2026-11-24T20:30:00.000Z"))).toBe("booked");
  });

  it("maps COMPLETED, CANCELLED and NO_SHOW to done", () => {
    for (const status of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      expect(phase(reservation("r", status, "T1", "2026-11-24T18:00:00.000Z"))).toBe("done");
    }
  });

  it("maps a booked reservation the host marked arrived to arrived", () => {
    expect(phase(reservation("r", "CONFIRMED", "T1", "2026-11-24T19:00:00.000Z"), ["r"])).toBe(
      "arrived"
    );
  });
});

describe("buildLiveSnapshot waitlist and tables", () => {
  it("maps waiting to waiting with minutes waited, notified/seated to seated, and drops expired/cancelled", () => {
    const base = { guestName: "Garcia", partySize: 6 };
    const { state, at } = buildLiveSnapshot(
      input({
        waitlist: [
          { ...base, id: "a", status: "waiting", createdAt: "2026-11-24T18:35:00.000Z" },
          { ...base, id: "b", status: "notified", createdAt: "2026-11-24T18:35:00.000Z" },
          { ...base, id: "c", status: "seated", createdAt: "2026-11-24T18:35:00.000Z" },
          { ...base, id: "d", status: "expired", createdAt: "2026-11-24T18:35:00.000Z" },
          { ...base, id: "e", status: "cancelled", createdAt: "2026-11-24T18:35:00.000Z" },
        ],
      })
    );
    expect(state.waitlist.map((w) => [w.id, w.status])).toEqual([
      ["a", "waiting"],
      ["b", "seated"],
      ["c", "seated"],
    ]);
    expect(at - state.waitlist[0]!.joinedAt!).toBe(25);
    expect(state.waitlist[0]!.label).toBe("Garcia");
  });

  it("carries table names and statuses", () => {
    const { state } = buildLiveSnapshot(input());
    expect(state.tables.map((t) => [t.id, t.name, t.status])).toEqual([
      ["T1", "Table 1", "AVAILABLE"],
      ["T2", "Table 2", "OCCUPIED"],
    ]);
  });

  it("does not mutate its input", () => {
    const i = input({
      reservations: [reservation("r", "CONFIRMED", "T1", "2026-11-24T20:00:00.000Z")],
    });
    const copy = structuredClone(i);
    buildLiveSnapshot(i);
    expect(i).toEqual(copy);
  });
});

describe("live snapshot to proposals", () => {
  it("proposes a legal offer for a waiting party from live-shaped data", () => {
    const { state, at } = buildLiveSnapshot(
      input({
        waitlist: [
          {
            id: "w1",
            status: "waiting",
            partySize: 2,
            guestName: "the Garcias",
            createdAt: "2026-11-24T18:35:00.000Z",
          },
        ],
      })
    );
    const out = proposeMoves(state, at);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "waitlist_offer", entryId: "w1", tableId: "T1" });
    expect(harmReason(state, out[0]!)).toBeNull();
    expect(out[0]!.reason).toContain("Table 1");
  });
});
