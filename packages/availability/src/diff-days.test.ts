import type { AvailabilityConfig } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { applyDraft } from "./apply-draft.js";
import { diffDays } from "./diff-days.js";
import type { BookingSnapshot } from "./slots.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "regular", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss",
      scheduleId: "regular",
      venueServiceId: "vs",
      opensAt: 1020,
      lastSeatingAt: 1080,
      closesAt: 1200,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};
const BEFORE: BookingSnapshot = {
  timezone: "America/Los_Angeles",
  config: CONFIG,
  tables: [],
  reservations: [],
  holds: [],
  settings: null,
};
const OPTIONS = { partySize: 2, channel: "online" as const, now: NOW };
const DATES = ["2026-11-06", "2026-11-07"];

describe("diffDays", () => {
  it("is empty when nothing changed", () => {
    expect(diffDays(BEFORE, BEFORE, DATES, OPTIONS)).toEqual([
      { serviceDate: "2026-11-06", added: [], removed: [] },
      { serviceDate: "2026-11-07", added: [], removed: [] },
    ]);
  });

  it("lists minutes added and removed", () => {
    const after = applyDraft(
      BEFORE,
      {
        upsert: {
          scheduleServices: [
            { ...CONFIG.scheduleServices[0]!, opensAt: 1050, lastSeatingAt: 1110 },
          ],
        },
        remove: {},
      },
      NOW.toISOString()
    );
    const [first] = diffDays(BEFORE, after, DATES, OPTIONS);
    expect(first).toEqual({ serviceDate: "2026-11-06", added: [1110], removed: [1020] });
  });

  it("shows a closed date as every time removed", () => {
    const after = applyDraft(
      BEFORE,
      {
        upsert: {
          dateRules: [{ id: "c", kind: "closure", targetKind: "venue", startsOn: "2026-11-07" }],
        },
        remove: {},
      },
      NOW.toISOString()
    );
    const days = diffDays(BEFORE, after, DATES, OPTIONS);
    expect(days[0]?.removed).toEqual([]);
    expect(days[1]?.removed).toEqual([1020, 1050, 1080]);
  });

  it("counts only seatings a table fits when bookableOnly is set", () => {
    const withTable: BookingSnapshot = {
      ...BEFORE,
      tables: [
        {
          id: "t",
          name: "T",
          capacity: 2,
          minCovers: 1,
          maxCovers: null,
          isActive: true,
          priority: 0,
        },
      ],
    };
    const closed = applyDraft(
      withTable,
      {
        upsert: {
          dateRules: [{ id: "c", kind: "closure", targetKind: "venue", startsOn: "2026-11-07" }],
        },
        remove: {},
      },
      NOW.toISOString()
    );
    const asked = (partySize: number) =>
      diffDays(withTable, closed, DATES, { ...OPTIONS, partySize, bookableOnly: true });
    expect(asked(2)[1]?.removed).toEqual([1020, 1050, 1080]);
    expect(asked(5)[1]?.removed).toEqual([]);
  });
});
