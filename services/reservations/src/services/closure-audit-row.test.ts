import { describe, expect, it, vi } from "vitest";
import type { CreateClosureBody, DateRule } from "@mbe/types";
import { availabilityStore, type Store } from "../test/availability-store.js";

vi.mock("./database.js", () => ({ prisma: {} }));

const { createClosure, reopenClosure } = await import("./closure-command.js");

/**
 * Pins the whole `availabilityChange` row a closure create and a reopen write, on the shared store
 * fake (no bookings, so no outcomes). The expected rows were captured from the commands as they
 * stood before they moved onto `commitSave` (origin/main e08becf46), so the move is provably
 * byte-identical.
 */

const NOW = new Date("2026-10-25T19:00:00.000Z"); // Sun Oct 25, noon in Los Angeles
const MANAGER = { isManager: true, actorId: "mgr-1", actorName: "Mia" };

/** The store fake plus the closure-side tables a booking-free closure touches. */
function fake(store: Store) {
  const { client, tx } = availabilityStore(store);
  Object.assign(tx, {
    closureOutcome: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    reservationHold: { findMany: vi.fn(async () => []) },
    reservationEvent: { create: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
  });
  return client;
}

const closure = (patch: Partial<DateRule> = {}) =>
  ({
    id: "c-new",
    kind: "closure",
    targetKind: "venue",
    bookingTypes: [],
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
    ...patch,
  }) as DateRule;

const createBody = (rule: DateRule): CreateClosureBody =>
  ({ expectedVersion: 4, rule, decisions: [] }) as CreateClosureBody;

const stored = (id: string, startsOn: string, endsOn: string, patch: object = {}) => ({
  id,
  venueId: "v",
  kind: "closure",
  targetKind: "venue",
  bookingTypes: [],
  startsOn: new Date(`${startsOn}T00:00:00.000Z`),
  endsOn: new Date(`${endsOn}T00:00:00.000Z`),
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
  tables: [],
  ...patch,
});

const NO_ROWS = {
  assignments: [],
  dateRules: [],
  scheduleServices: [],
  schedules: [],
  venueServices: [],
};

/** The rule as a client read it: the shape of the config response. */
const ruleJson = (id: string, startsOn: string, endsOn: string) => ({
  id,
  kind: "closure",
  targetKind: "venue",
  startsOn,
  endsOn,
});

describe("closure audit rows", () => {
  it("refuses a one-date reopen whose pieces name a table the venue no longer has", async () => {
    const dead = { targetKind: "tables", tables: [{ tableId: "t-gone" }] };
    const store: Store = {
      version: 4,
      dateRules: [stored("c-old", "2026-12-24", "2026-12-26", dead)],
      changes: [],
    };
    const seen = { rule: ruleJson("c-old", "2026-12-24", "2026-12-26"), children: [] };
    const outcome = await reopenClosure(
      {
        venueId: "v",
        ruleId: "c-old",
        caller: MANAGER,
        tellCancelledGuests: false,
        now: NOW,
        date: "2026-12-25",
        seen: {
          ...seen,
          rule: { ...seen.rule, targetKind: "tables", tableIds: ["t-gone"] },
        } as never,
      },
      fake(store)
    );

    expect(outcome).toMatchObject({
      kind: "invalid",
      issues: [{ code: "unknown_reference" }, { code: "unknown_reference" }],
    });
    expect(store.changes).toEqual([]);
  });

  it("writes the whole create row", async () => {
    const store: Store = { version: 4, dateRules: [], changes: [] };
    const outcome = await createClosure(
      {
        venueId: "v",
        caller: MANAGER,
        body: createBody(closure()),
        idempotencyKey: "k-1",
        now: NOW,
      },
      fake(store)
    );

    expect(outcome).toMatchObject({ kind: "saved", result: { ruleId: "c-new", version: 5 } });
    expect(store.changes).toEqual([EXPECTED_CREATE]);
  });

  it("writes the whole row of a whole-rule reopen", async () => {
    const store: Store = {
      version: 4,
      dateRules: [stored("c-old", "2026-12-24", "2026-12-26")],
      changes: [],
    };
    const outcome = await reopenClosure(
      { venueId: "v", ruleId: "c-old", caller: MANAGER, tellCancelledGuests: false, now: NOW },
      fake(store)
    );

    expect(outcome).toMatchObject({ kind: "reopened", result: { version: 5 } });
    expect(store.changes).toEqual([EXPECTED_REOPEN]);
  });

  it("writes the whole row of a one-date reopen, linked to its day", async () => {
    const store: Store = {
      version: 4,
      dateRules: [stored("c-old", "2026-12-24", "2026-12-26")],
      changes: [],
    };
    const seen = { rule: ruleJson("c-old", "2026-12-24", "2026-12-26"), children: [] };
    const outcome = await reopenClosure(
      {
        venueId: "v",
        ruleId: "c-old",
        caller: MANAGER,
        tellCancelledGuests: false,
        now: NOW,
        date: "2026-12-25",
        seen: seen as never,
      },
      fake(store)
    );

    expect(outcome).toMatchObject({ kind: "reopened", result: { version: 5 } });
    expect(store.changes).toEqual([EXPECTED_REOPEN_ONE_DATE]);
  });
});

const AT = {
  venueId: "v",
  actorId: "mgr-1",
  actorName: "Mia",
  at: NOW,
  notifiedGuests: false,
  version: 5,
};

const EXPECTED_CREATE = {
  ...AT,
  kind: "closure",
  summary: "Closure saved for 2026-12-24: 0 cancelled, 0 moved, 0 kept",
  summaryDetail: {
    code: "closure_saved",
    cancelled: 0,
    moved: 0,
    kept: 0,
    startsOn: "2026-12-24",
    endsOn: "2026-12-24",
  },
  affectedFrom: new Date("2026-12-24T00:00:00.000Z"),
  affectedTo: new Date("2026-12-24T00:00:00.000Z"),
  inverse: {
    version: 1,
    operatingHours: null,
    remove: { ...NO_ROWS, dateRules: ["c-new"] },
    restore: NO_ROWS,
    closure: {
      ruleId: "c-new",
      idempotencyKey: "k-1",
      version: 5,
      outcome: {
        cancelled: 0,
        moved: 0,
        kept: 0,
        closeEarly: false,
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
      },
      counts: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    },
  },
};

const RESTORED_OLD = {
  id: "c-old",
  kind: "closure",
  targetKind: "venue",
  bookingTypes: [],
  venueServiceId: null,
  tableIds: [],
  sectionId: undefined,
  startsOn: "2026-12-24",
  endsOn: "2026-12-26",
  repeat: null,
  window: null,
  seriesId: null,
  guestMessage: null,
  staffNote: null,
};

const EXPECTED_REOPEN = {
  ...AT,
  kind: "reopen",
  summary: "Closure reopened (2026-12-24)",
  summaryDetail: { code: "closure_reopened", startsOn: "2026-12-24", endsOn: "2026-12-26" },
  affectedFrom: new Date("2026-12-24T00:00:00.000Z"),
  affectedTo: new Date("2026-12-26T00:00:00.000Z"),
  inverse: {
    version: 1,
    operatingHours: null,
    remove: NO_ROWS,
    restore: { ...NO_ROWS, dateRules: [RESTORED_OLD] },
  },
};

const EXPECTED_REOPEN_ONE_DATE = {
  ...AT,
  kind: "reopen",
  summary: "Closure reopened (2026-12-25)",
  summaryDetail: { code: "closure_reopened", startsOn: "2026-12-25", endsOn: "2026-12-25" },
  // A one-date reopen links to its day in History, not to the range it was cut from.
  affectedFrom: new Date("2026-12-25T00:00:00.000Z"),
  affectedTo: new Date("2026-12-25T00:00:00.000Z"),
  inverse: {
    version: 1,
    operatingHours: null,
    // The two rules that keep the rest of the range closed: new ids.
    remove: { ...NO_ROWS, dateRules: [expect.any(String), expect.any(String)] },
    restore: { ...NO_ROWS, dateRules: [RESTORED_OLD] },
  },
};
