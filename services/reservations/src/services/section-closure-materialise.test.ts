import { describe, expect, it, vi, type Mock } from "vitest";
import type { StoreDb } from "./availability-config.js";
import { availabilityStore, type Store } from "../test/availability-store.js";
import { materialiseSectionClosures } from "./section-closure-materialise.js";

const NOW = new Date("2026-10-25T19:00:00.000Z"); // Sun Oct 25, noon in Los Angeles
const ACTOR = { actorId: "mgr-1", actorName: "Mia" };

/** A stored closure row, as the config read returns it. */
const stored = (id: string, sectionId: string | null, endsOn: string | null) => ({
  id,
  venueId: "v",
  kind: "closure",
  targetKind: "tables",
  bookingTypes: [],
  startsOn: new Date("2026-10-20T00:00:00.000Z"),
  endsOn: endsOn ? new Date(`${endsOn}T00:00:00.000Z`) : null,
  payload: {},
  deletedAt: null,
  venueServiceId: null,
  useScheduleId: null,
  expiresAt: null,
  repeat: null,
  window: null,
  seriesId: null,
  guestMessage: null,
  staffNote: null,
  sectionId,
  tables: [],
});

/** The store fake with sections "sec-a" (t-1, t-2) and "sec-b" (no tables) in the venue. */
function fake(store: Store) {
  const { tx, create } = availabilityStore(store);
  Object.assign(tx, {
    floorPlanSection: {
      findMany: vi.fn(async () => [
        { id: "sec-a", tables: [{ id: "t-1" }, { id: "t-2" }] },
        { id: "sec-b", tables: [] },
      ]),
    },
  });
  return {
    tx: tx as unknown as StoreDb,
    raw: tx["$executeRaw"] as Mock<() => Promise<number>>,
    create,
  };
}

const materialise = (tx: StoreDb, sectionIds: string[]) =>
  materialiseSectionClosures(tx, { venueId: "v", sectionIds, now: NOW, actor: ACTOR });

describe("materialiseSectionClosures", () => {
  it("writes one History row and bumps once, for every closure it changes", async () => {
    const store: Store = {
      version: 4,
      dateRules: [stored("dr-bar", "sec-a", null), stored("dr-patio", "sec-a", "2026-12-01")],
      changes: [],
    };
    const { tx } = fake(store);

    expect(await materialise(tx, ["sec-a"])).toBe(2);

    expect(store.version).toBe(5);
    expect(store.dateRules.map((r) => r["sectionId"])).toEqual([null, null]);
    expect(store.changes).toEqual([EXPECTED_ROW]);
  });

  it("gives the closure a join row per table of the section", async () => {
    const store: Store = { version: 4, dateRules: [stored("dr-bar", "sec-a", null)], changes: [] };
    const { tx } = fake(store);
    await materialise(tx, ["sec-a"]);
    expect(tx.dateRuleTable.createMany).toHaveBeenCalledWith({
      data: [
        { dateRuleId: "dr-bar", tableId: "t-1", venueId: "v" },
        { dateRuleId: "dr-bar", tableId: "t-2", venueId: "v" },
      ],
    });
  });

  it("materialises a closure committed while it waited for the venue lock", async () => {
    const store: Store = { version: 4, dateRules: [], changes: [] };
    const { tx, raw } = fake(store);
    // The closure's own commit holds the venue row; it lands before this delete gets the lock.
    raw.mockImplementation(() => {
      store.dateRules = [stored("dr-late", "sec-a", null)];
      return Promise.resolve(0);
    });

    expect(await materialise(tx, ["sec-a"])).toBe(1);

    expect(store.dateRules.map((r) => r["sectionId"])).toEqual([null]);
    expect(store.changes).toHaveLength(1);
  });

  it("changes nothing, bumps nothing and writes no row when no live closure names the section", async () => {
    const store: Store = {
      version: 4,
      dateRules: [stored("dr-old", "sec-a", "2026-10-01"), stored("dr-other", "sec-b", null)],
      changes: [],
    };
    const { tx } = fake(store);

    expect(await materialise(tx, ["sec-a"])).toBe(0);

    expect(store).toEqual({
      version: 4,
      dateRules: [stored("dr-old", "sec-a", "2026-10-01"), stored("dr-other", "sec-b", null)],
      changes: [],
    });
  });

  it("does not touch the store at all for no sections", async () => {
    const store: Store = { version: 4, dateRules: [stored("dr", "sec-a", null)], changes: [] };
    const { tx, raw } = fake(store);
    expect(await materialise(tx, [])).toBe(0);
    expect(raw).not.toHaveBeenCalled();
    expect(store.version).toBe(4);
  });

  it("reads today in the venue's own zone: a closure ending yesterday there is left alone", async () => {
    // 02:00 UTC on 26 Oct is still 25 Oct in Los Angeles, so a closure ending 25 Oct is live.
    const store: Store = {
      version: 4,
      dateRules: [stored("dr-edge", "sec-a", "2026-10-25")],
      changes: [],
    };
    const { tx } = fake(store);
    const early = new Date("2026-10-26T02:00:00.000Z");
    expect(
      await materialiseSectionClosures(tx, {
        venueId: "v",
        sectionIds: ["sec-a"],
        now: early,
        actor: ACTOR,
      })
    ).toBe(1);
  });
});

const NO_ROWS = {
  assignments: [],
  dateRules: [],
  scheduleServices: [],
  schedules: [],
  venueServices: [],
};

/** A closure as it was before: still naming its section. */
const restored = (id: string, endsOn: string | null) => ({
  id,
  kind: "closure",
  targetKind: "tables",
  bookingTypes: [],
  venueServiceId: null,
  tableIds: [],
  sectionId: "sec-a",
  startsOn: "2026-10-20",
  endsOn,
  repeat: null,
  window: null,
  seriesId: null,
  guestMessage: null,
  staffNote: null,
});

const EXPECTED_ROW = {
  venueId: "v",
  actorId: "mgr-1",
  actorName: "Mia",
  at: NOW,
  kind: "section_closure_materialised",
  summary: "Section deleted: 2 closures now close its tables",
  summaryDetail: { code: "section_closure_materialised" },
  // The earliest start, and no end: one of the two closures is open-ended.
  affectedFrom: new Date("2026-10-20T00:00:00.000Z"),
  affectedTo: null,
  // Not undoable (`availability-changes.ts` refuses the kind), but it still carries the exact
  // prior rows, as every audit row does.
  inverse: {
    version: 1,
    operatingHours: null,
    remove: NO_ROWS,
    restore: {
      ...NO_ROWS,
      dateRules: [restored("dr-bar", null), restored("dr-patio", "2026-12-01")],
    },
  },
  version: 5,
};
