import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, PreviewAvailabilityBody } from "@mbe/types";
import { PreviewAvailabilityBodySchema } from "@mbe/types";
import { planPreview } from "./availability-preview.js";
import { planSave } from "./availability-config.js";

/**
 * #7982 review: the schedule editor and Compare preview an edit of a schedule over "the dates it
 * runs". A date a `use_schedule` rule sends to the schedule is not one of them when the week is
 * read with date rules set aside, so a list scope of those dates leaves its bookings out of the
 * stranded list that the save then refuses on. An open scope from today is what the save checks.
 */

const NOW = new Date("2026-10-25T19:00:00.000Z");
const TZ = "America/Los_Angeles";
const SATURDAY = "2026-11-07";
const RULE_THURSDAY = "2026-11-12";

const service = (id: string, venueServiceId: string, opensAt: number, closesAt: number) => ({
  id,
  scheduleId: "weekend",
  venueServiceId,
  opensAt,
  lastSeatingAt: closesAt - 60,
  closesAt,
  seating: { version: 1 as const, interval: 15 },
  bookingTypes: ["online" as const, "phone" as const],
});

const CONFIG: AvailabilityConfig = {
  schedules: [
    { id: "regular", name: "Regular week", kind: "regular", isRegular: true },
    { id: "weekend", name: "Weekend", kind: "alternate", isRegular: false },
  ],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
  ],
  scheduleServices: [
    { ...service("ss-r", "vs-dinner", 1020, 1380), scheduleId: "regular" },
    service("ss-w-lunch", "vs-lunch", 660, 900),
    service("ss-w-dinner", "vs-dinner", 1080, 1410),
  ],
  assignments: [
    { id: "as-r", scheduleId: "regular", weekdays: [1, 2, 3, 4, 5], precedence: 0 },
    { id: "as-w", scheduleId: "weekend", weekdays: [0, 6], precedence: 1 },
  ],
  dateRules: [
    {
      id: "rule-thu",
      kind: "use_schedule",
      targetKind: "venue",
      startsOn: RULE_THURSDAY,
      endsOn: RULE_THURSDAY,
      useScheduleId: "weekend",
    },
  ],
};

const STATE = {
  stored: CONFIG,
  effective: CONFIG,
  source: "rows" as const,
  version: 7,
  timezone: TZ,
  operatingHours: null,
};

// Noon Pacific: inside Lunch, outside Dinner.
const lunch = (id: string, day: string) => ({
  id,
  tableId: null,
  startTime: new Date(`${day}T20:00:00.000Z`),
  partySize: 2,
  date: new Date(`${day}T00:00:00.000Z`),
});
const BOOKINGS = [lunch("res-sat", SATURDAY), lunch("res-rule-thu", RULE_THURSDAY)];
const REMOVE_LUNCH = { upsert: {}, remove: { scheduleServices: ["ss-w-lunch"] } };

const previewIds = (scope: PreviewAvailabilityBody["scope"]) => {
  const body = PreviewAvailabilityBodySchema.parse({
    draft: { changes: REMOVE_LUNCH, scopeConflicts: "keep" },
    scope,
    focusDate: SATURDAY,
  });
  const plan = planPreview({
    state: STATE,
    body,
    bookings: BOOKINGS,
    tableIds: new Set(),
    now: NOW,
  });
  if (plan.kind !== "ok") throw new Error("preview refused");
  return plan.result.stranded.items.map((i) => i.id);
};

describe("a schedule edit's stranded list", () => {
  it("is what the save refuses on when the scope is open from today", () => {
    const save = planSave({
      state: STATE,
      body: { expectedVersion: 7, changes: REMOVE_LUNCH, scopeConflicts: "keep" },
      bookings: BOOKINGS,
      tableIds: new Set(),
      now: NOW,
    });
    expect(save.kind).toBe("stranded");
    const saved = save.kind === "stranded" ? save.reservations.map((r) => r.id).sort() : [];
    expect(saved).toEqual(["res-rule-thu", "res-sat"]);
    expect(previewIds({ from: "2026-10-25" }).sort()).toEqual(saved);
  });

  // #8125: the day drawer previews a schedule edit the same way, in either conflict mode (it
  // sends "replace" when the week reaches one date and the Manager's choice otherwise).
  it.each(["keep", "replace"] as const)(
    "matches the save under %s when the day drawer's schedule edit is open from today",
    (scopeConflicts) => {
      const save = planSave({
        state: STATE,
        body: { expectedVersion: 7, changes: REMOVE_LUNCH, scopeConflicts },
        bookings: BOOKINGS,
        tableIds: new Set(),
        now: NOW,
      });
      const saved = save.kind === "stranded" ? save.reservations.map((r) => r.id).sort() : [];
      const body = PreviewAvailabilityBodySchema.parse({
        draft: { changes: REMOVE_LUNCH, scopeConflicts },
        scope: { from: "2026-10-25" },
        focusDate: SATURDAY,
      });
      const plan = planPreview({
        state: STATE,
        body,
        bookings: BOOKINGS,
        tableIds: new Set(),
        now: NOW,
      });
      if (plan.kind !== "ok") throw new Error("preview refused");
      expect(saved).toEqual(["res-rule-thu", "res-sat"]);
      expect(plan.result.stranded.items.map((i) => i.id).sort()).toEqual(saved);
    }
  );

  it("misses a date a use_schedule rule sends to the schedule when only the week's dates are listed", () => {
    expect(previewIds([SATURDAY, "2026-11-08"])).toEqual(["res-sat"]);
  });
});

// The day drawer lets a Manager save a schedule that no week day uses and only a use_schedule rule
// reaches. What its Save sends must write the schedule's rows and nothing else, and the preview of
// that same draft must show what the save refuses on.
describe("a schedule reached only through a use_schedule rule", () => {
  const RULE_DATE = "2026-11-12";
  const rowsOnly: AvailabilityConfig = {
    ...CONFIG,
    schedules: [
      ...CONFIG.schedules,
      { id: "brunch", name: "Brunch", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...CONFIG.scheduleServices,
      { ...service("ss-b-lunch", "vs-lunch", 660, 900), scheduleId: "brunch" },
    ],
    dateRules: [
      {
        id: "rule-brunch",
        kind: "use_schedule",
        targetKind: "venue",
        startsOn: RULE_DATE,
        endsOn: RULE_DATE,
        useScheduleId: "brunch",
      },
    ],
  };
  const state = { ...STATE, stored: rowsOnly, effective: rowsOnly };
  const remove = { upsert: {}, remove: { scheduleServices: ["ss-b-lunch"] } };
  const booking = lunch("res-brunch", RULE_DATE);

  it.each(["keep", "replace"] as const)(
    "refuses the booking the preview lists, and writes only the schedule's rows (%s)",
    (scopeConflicts) => {
      const save = planSave({
        state,
        body: { expectedVersion: 7, changes: remove, scopeConflicts },
        bookings: [booking],
        tableIds: new Set(),
        now: NOW,
      });
      const preview = planPreview({
        state,
        body: PreviewAvailabilityBodySchema.parse({
          draft: { changes: remove, scopeConflicts },
          scope: { from: "2026-10-25" },
          focusDate: RULE_DATE,
        }),
        bookings: [booking],
        tableIds: new Set(),
        now: NOW,
      });
      if (preview.kind !== "ok") throw new Error("preview refused");
      expect(save.kind).toBe("stranded");
      expect(preview.result.stranded.items.map((i) => i.id)).toEqual(["res-brunch"]);
    }
  );

  it.each(["keep", "replace"] as const)(
    "with no booking, the save leaves the date rule alone (%s)",
    (scopeConflicts) => {
      const save = planSave({
        state,
        body: { expectedVersion: 7, changes: remove, scopeConflicts },
        bookings: [],
        tableIds: new Set(),
        now: NOW,
      });
      if (save.kind !== "write") throw new Error(`expected a write, got ${save.kind}`);
      expect(save.next.dateRules).toEqual(rowsOnly.dateRules);
      expect(save.next.assignments).toEqual(rowsOnly.assignments);
      expect(save.next.scheduleServices.map((s) => s.id)).not.toContain("ss-b-lunch");
    }
  );
});
