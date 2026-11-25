import { describe, expect, it, vi } from "vitest";
import type { SetTonightBody } from "@mbe/types";
import { availabilityStore, type Store } from "../test/availability-store.js";

vi.mock("./database.js", () => ({ prisma: {} }));

const { setTonight, endTonight } = await import("./tonight-command.js");

/**
 * Pins the whole `availabilityChange` row a Tonight set and end write, on the shared store fake.
 * The expected rows were captured from the command as it stood before it moved onto
 * `commitSave` (origin/main d26c9259c), so the move is provably byte-identical.
 */

const NOW = new Date("2026-10-25T19:00:00.000Z"); // Sun Oct 25, noon in Los Angeles
const HOST = { isManager: false, actorId: "host-1", actorName: "Hana" };

const body = (change: SetTonightBody["change"], patch: Partial<SetTonightBody> = {}) =>
  ({ expectedVersion: 4, ruleId: "t-new", change, decisions: [], ...patch }) as SetTonightBody;

describe("Tonight audit rows", () => {
  it("writes the whole set row for a pause", async () => {
    const store: Store = { version: 4, dateRules: [], changes: [] };
    await setTonight(
      { venueId: "v", caller: HOST, body: body({ type: "pause_online" }), now: NOW },
      availabilityStore(store).client,
      { createClosure: vi.fn() as never }
    );

    expect(store.changes).toEqual([EXPECTED_SET]);
  });

  it("writes the whole end row, version bumped from the current one", async () => {
    const store: Store = { version: 4, dateRules: [], changes: [] };
    const client = availabilityStore(store).client;
    await setTonight(
      { venueId: "v", caller: HOST, body: body({ type: "pause_online" }), now: NOW },
      client,
      { createClosure: vi.fn() as never }
    );

    await endTonight({ venueId: "v", ruleId: "t-new", caller: HOST, now: NOW }, client);

    expect(store.changes[1]).toEqual(EXPECTED_END);
  });
});

const NO_ROWS = {
  assignments: [],
  dateRules: [],
  scheduleServices: [],
  schedules: [],
  venueServices: [],
};

const EXPECTED_SET = {
  venueId: "v",
  actorId: "host-1",
  actorName: "Hana",
  at: NOW,
  kind: "tonight",
  summary: "Tonight: online booking paused",
  summaryDetail: { code: "tonight_pause_online" },
  affectedFrom: new Date("2026-10-25T00:00:00.000Z"),
  affectedTo: new Date("2026-10-25T00:00:00.000Z"),
  inverse: {
    version: 1,
    operatingHours: null,
    remove: { ...NO_ROWS, dateRules: ["t-new"] },
    restore: NO_ROWS,
    tonight: { ruleId: "t-new", version: 5 },
  },
  version: 5,
};

const EXPECTED_END = {
  venueId: "v",
  actorId: "host-1",
  actorName: "Hana",
  at: NOW,
  kind: "tonight_end",
  summary: "Tonight change ended",
  summaryDetail: { code: "tonight_ended" },
  affectedFrom: new Date("2026-10-25T00:00:00.000Z"),
  affectedTo: new Date("2026-10-25T00:00:00.000Z"),
  inverse: {
    version: 1,
    operatingHours: null,
    remove: NO_ROWS,
    restore: {
      ...NO_ROWS,
      dateRules: [
        {
          id: "t-new",
          kind: "tonight",
          targetKind: "booking",
          bookingTypes: ["online"],
          venueServiceId: null,
          tableIds: [],
          sectionId: null,
          payload: { version: 1, stop: { from: 0, to: 2880 } },
          startsOn: "2026-10-25",
          endsOn: "2026-10-25",
          expiresAt: "2026-10-26T07:00:00.000Z",
          repeat: null,
          window: null,
          seriesId: null,
          guestMessage: null,
          staffNote: null,
        },
      ],
    },
  },
  version: 6,
};
