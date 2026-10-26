import { describe, it, expect } from "vitest";
import { validateConfig } from "@mbe/availability";
import {
  applyPreset,
  draftFromLegacyHours,
  draftToChanges,
  draftToConfig,
  draftToLegacyHours,
  emptyDraft,
  replaceService,
  setServiceTime,
  toggleDay,
  validateDraft,
  WEEKDAY_SHORTCUT,
  WEEK_DISPLAY_ORDER,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";

function counter() {
  let n = 0;
  return () => `id-${++n}`;
}

function dinnerWeekdays(): QuickSetupDraft {
  const base = emptyDraft("s1");
  const [service] = base.services;
  return {
    services: [applyPreset(service!, "dinner", "Dinner")],
    days: WEEKDAY_SHORTCUT,
  };
}

describe("quick setup draft", () => {
  it("starts with one empty service and no days", () => {
    const draft = emptyDraft("s1");
    expect(draft.days).toEqual([]);
    expect(draft.services).toEqual([
      { id: "s1", name: "", opens: null, lastSeating: null, closes: null, lastSeatingLinked: true },
    ]);
  });

  it("fills last seating 45 minutes before close and keeps it linked", () => {
    const draft = dinnerWeekdays();
    expect(draft.services[0]).toMatchObject({
      opens: "17:00",
      closes: "22:00",
      lastSeating: "21:15",
    });
    const later = setServiceTime(draft.services[0]!, "closes", "23:00");
    expect(later.lastSeating).toBe("22:15");
  });

  it("stops following close once last seating is edited", () => {
    const edited = setServiceTime(dinnerWeekdays().services[0]!, "lastSeating", "21:00");
    expect(edited.lastSeatingLinked).toBe(false);
    expect(setServiceTime(edited, "closes", "23:00").lastSeating).toBe("21:00");
  });

  it("toggles a day on and off", () => {
    const on = toggleDay(emptyDraft("s1"), 6);
    expect(on.days).toEqual([6]);
    expect(toggleDay(on, 6).days).toEqual([]);
  });

  it("accepts the bistro week", () => {
    expect(validateDraft(dinnerWeekdays())).toEqual([]);
  });

  it("flags every empty field and the missing days, in card order", () => {
    const issues = validateDraft(emptyDraft("s1"));
    expect(issues.map((i) => `${i.field}:${i.code}`)).toEqual([
      "name:name_required",
      "opens:time_required",
      "lastSeating:time_required",
      "closes:time_required",
      "days:days_required",
    ]);
  });

  it("flags last seating after close", () => {
    const draft = dinnerWeekdays();
    const bad = replaceService(draft, setServiceTime(draft.services[0]!, "lastSeating", "22:30"));
    expect(validateDraft(bad)).toEqual([
      { serviceId: "s1", field: "lastSeating", code: "last_seating_after_close" },
    ]);
  });

  it("flags services that overlap", () => {
    const draft = dinnerWeekdays();
    const lunch = applyPreset({ ...draft.services[0]!, id: "s2" }, "lunch", "Lunch");
    const overlapping = {
      ...lunch,
      closes: "18:00",
      lastSeating: "17:15",
    };
    const issues = validateDraft({ ...draft, services: [draft.services[0]!, overlapping] });
    expect(issues).toContainEqual({ serviceId: "s1", field: "opens", code: "overlap" });
  });

  it("treats a close earlier than the opening as past midnight", () => {
    const draft = emptyDraft("s1");
    const late = applyPreset(draft.services[0]!, "late", "Late");
    const full = { services: [late], days: WEEK_DISPLAY_ORDER };
    expect(validateDraft(full)).toEqual([]);
    const config = draftToConfig(full, counter());
    expect(config.scheduleServices[0]).toMatchObject({
      opensAt: 1320,
      lastSeatingAt: 1455,
      closesAt: 1500,
    });
  });

  it("builds a config the engine accepts", () => {
    const config = draftToConfig(dinnerWeekdays(), counter());
    expect(validateConfig(config)).toEqual([]);
    expect(config.assignments[0]?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(config.schedules[0]).toMatchObject({ isRegular: true });
  });

  it("writes new rows against an empty stored config", () => {
    const stored = {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules: [],
    };
    const changes = draftToChanges(dinnerWeekdays(), stored, counter());
    expect(changes.upsert.schedules).toHaveLength(1);
    expect(changes.upsert.venueServices?.[0]).toMatchObject({ name: "Dinner", position: 0 });
    expect(changes.upsert.scheduleServices).toHaveLength(1);
    expect(changes.remove).toEqual({ scheduleServices: [], assignments: [] });
  });

  it("reuses a stored regular schedule and same-named service, clearing its old rows", () => {
    const stored = {
      schedules: [{ id: "reg", name: "Regular week", kind: "regular" as const, isRegular: true }],
      venueServices: [{ id: "vs-dinner", name: "dinner", position: 0 }],
      scheduleServices: [
        {
          id: "old-ss",
          scheduleId: "reg",
          venueServiceId: "vs-dinner",
          opensAt: 0,
          lastSeatingAt: 10,
          closesAt: 20,
          seating: { version: 1 as const, interval: 15 },
          bookingTypes: [],
        },
      ],
      assignments: [{ id: "old-a", scheduleId: "reg", weekdays: [1], precedence: 0 }],
      dateRules: [],
    };
    const changes = draftToChanges(dinnerWeekdays(), stored, counter());
    expect(changes.upsert.schedules?.[0]?.id).toBe("reg");
    expect(changes.upsert.venueServices).toEqual([]);
    expect(changes.upsert.scheduleServices?.[0]?.venueServiceId).toBe("vs-dinner");
    expect(changes.remove).toEqual({ scheduleServices: ["old-ss"], assignments: ["old-a"] });
  });

  it("projects the legacy wizard shape, leaving closed days out", () => {
    expect(draftToLegacyHours(dinnerWeekdays())).toEqual({
      monday: { open: "17:00", close: "22:00" },
      tuesday: { open: "17:00", close: "22:00" },
      wednesday: { open: "17:00", close: "22:00" },
      thursday: { open: "17:00", close: "22:00" },
      friday: { open: "17:00", close: "22:00" },
    });
  });

  it("seeds a draft back from legacy hours", () => {
    const draft = draftFromLegacyHours(draftToLegacyHours(dinnerWeekdays()), "s9");
    expect(draft.days).toEqual([1, 2, 3, 4, 5]);
    expect(draft.services[0]).toMatchObject({
      opens: "17:00",
      closes: "22:00",
      lastSeating: "21:15",
    });
    expect(draftFromLegacyHours({}, "s9")).toEqual(emptyDraft("s9"));
  });
});
