import { describe, it, expect } from "vitest";
import { validateConfig } from "@mbe/availability";
import { localeRuntime } from "../../i18n/runtime.js";
import { DEMO_WEEK_CONFIG } from "../../utils/demo-week.fixture.js";
import { EVERY_DAY, demoDraft, draftBlock, draftService } from "./quick-setup-demo.fixture.js";
import {
  addBlock,
  applyPreset,
  autoLastSeating,
  draftFromConfig,
  draftFromLegacyHours,
  draftToChanges,
  draftToConfig,
  draftToLegacyHours,
  emptyDraft,
  emptyService,
  issueMessage,
  replaceService,
  setServiceDays,
  setServiceTime,
  setSharedDays,
  toggleBlockDay,
  toggleDayIn,
  validateDraft,
  validateQuickSetupHours,
  WEEKDAY_SHORTCUT,
  WEEK_DISPLAY_ORDER,
  type QuickSetupDraft,
  type ServiceDraft,
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
      {
        id: "s1",
        name: "",
        opens: null,
        lastSeating: null,
        closes: null,
        lastSeatingLinked: true,
        days: null,
        blocks: [],
      },
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

  describe("a service shorter than the last-seating lead", () => {
    const short = (): ServiceDraft =>
      setServiceTime(setServiceTime(emptyService("s1"), "opens", "17:00"), "closes", "17:30");

    it("fills last seating at the opening, not before it", () => {
      expect(short().lastSeating).toBe("17:00");
    });

    it("passes validation with no last-seating error", () => {
      const draft = { services: [{ ...short(), name: "Early" }], days: WEEKDAY_SHORTCUT };
      expect(validateDraft(draft)).toEqual([]);
    });

    it("corrects a linked last seating when the opening is set after the close", () => {
      const closesFirst = setServiceTime(emptyService("s1"), "closes", "17:30");
      expect(setServiceTime(closesFirst, "opens", "17:00").lastSeating).toBe("17:00");
    });

    it("leaves a last seating the Manager set when the opening moves", () => {
      const edited = setServiceTime(short(), "lastSeating", "17:15");
      expect(setServiceTime(edited, "opens", "17:10").lastSeating).toBe("17:15");
    });

    it("counts a close past midnight from the opening", () => {
      const late = setServiceTime(
        setServiceTime(emptyService("s1"), "opens", "23:45"),
        "closes",
        "00:15"
      );
      expect(late.lastSeating).toBe("23:45");
      expect(autoLastSeating("01:00", "22:00")).toBe("00:15");
    });
  });

  it("stops following close once last seating is edited", () => {
    const edited = setServiceTime(dinnerWeekdays().services[0]!, "lastSeating", "21:00");
    expect(edited.lastSeatingLinked).toBe(false);
    expect(setServiceTime(edited, "closes", "23:00").lastSeating).toBe("21:00");
  });

  it("toggles a day on and off", () => {
    const on = toggleDayIn(emptyDraft("s1").days, 6);
    expect(on).toEqual([6]);
    expect(toggleDayIn(on, 6)).toEqual([]);
  });

  it("drops a block's days the service no longer runs on when its own days change", () => {
    const dinner = draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], {
      days: EVERY_DAY,
      blocks: [draftBlock("late", [5, 6], ["17:00", "22:00", "00:00"])],
    });
    expect(setServiceDays(dinner, [1, 2, 3, 4, 5], EVERY_DAY).blocks[0]?.days).toEqual([5]);
    expect(setServiceDays(dinner, null, EVERY_DAY).blocks[0]?.days).toEqual([5, 6]);
    // Back to the shared days: only the days those cover stay in the block.
    expect(setServiceDays(dinner, null, [1, 2, 3, 4, 5]).blocks[0]?.days).toEqual([5]);
  });

  it("drops the blocks' days off the shared days from the services that follow them", () => {
    const follows = draftService("a", "A", ["17:00", "21:00", "23:00"], {
      blocks: [draftBlock("b", [5, 6], ["17:00", "22:00", "00:00"])],
    });
    const own = draftService("c", "C", ["10:00", "13:00", "14:00"], {
      days: EVERY_DAY,
      blocks: [draftBlock("d", [5, 6], ["10:00", "13:00", "14:00"])],
    });
    const next = setSharedDays({ days: EVERY_DAY, services: [follows, own] }, [1, 2, 3, 4, 5]);
    expect(next.days).toEqual([1, 2, 3, 4, 5]);
    expect(next.services.map((s) => s.blocks[0]?.days)).toEqual([[5], [5, 6]]);
  });

  it("adds a block with the service's own hours and no day ticked", () => {
    const dinner = draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"]);
    expect(addBlock(dinner, "late").blocks).toEqual([
      {
        id: "late",
        days: [],
        opens: "17:00",
        lastSeating: "21:00",
        closes: "23:00",
        lastSeatingLinked: false,
      },
    ]);
  });

  it("moves a ticked day out of the other block and drops a block left with no day", () => {
    const dinner = draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], {
      blocks: [
        draftBlock("one", [5], ["17:00", "22:00", "00:00"]),
        draftBlock("two", [6], ["17:00", "22:00", "00:30"]),
      ],
    });
    const claim = toggleBlockDay(dinner, "two", 5);
    expect(claim.moved).toBe(true);
    expect(claim.removed.map((b) => b.id)).toEqual(["one"]);
    expect(claim.service.blocks).toMatchObject([{ id: "two", days: [6, 5] }]);
    // Unticking a day of its own block moves nothing.
    const untick = toggleBlockDay(claim.service, "two", 6);
    expect(untick).toMatchObject({ moved: false, removed: [] });
    expect(untick.service.blocks[0]?.days).toEqual([5]);
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

  it("flags a past-midnight service longer than the server reads (16 hours)", () => {
    const draft = dinnerWeekdays();
    const at = (opens: string, lastSeating: string, closes: string) => {
      const s = draft.services[0]!;
      return replaceService(
        draft,
        setServiceTime(
          setServiceTime(setServiceTime(s, "opens", opens), "lastSeating", lastSeating),
          "closes",
          closes
        )
      );
    };
    expect(validateDraft(at("10:00", "02:15", "03:00"))).toEqual([
      { serviceId: "s1", field: "closes", code: "span_too_long" },
    ]);
    expect(validateDraft(at("10:00", "01:15", "02:00"))).toEqual([]);
    // A midnight close is past midnight to the server's reader too: 07:00 -> 00:00 is 17 hours.
    expect(validateDraft(at("07:00", "22:30", "00:00"))).toEqual([
      { serviceId: "s1", field: "closes", code: "span_too_long" },
    ]);
  });

  it("flags a day whose services together span past midnight for more than 16 hours", () => {
    const timed = (id: string, opens: string, lastSeating: string, closes: string) =>
      setServiceTime(
        setServiceTime(
          setServiceTime({ ...emptyDraft(id).services[0]!, name: id }, "opens", opens),
          "lastSeating",
          lastSeating
        ),
        "closes",
        closes
      );
    const draft: QuickSetupDraft = {
      services: [timed("b", "07:00", "09:30", "10:30"), timed("d", "17:00", "23:00", "00:30")],
      days: WEEKDAY_SHORTCUT,
    };
    expect(validateDraft(draft)).toEqual([
      { serviceId: "d", field: "closes", code: "span_too_long" },
    ]);
  });

  it("flags a day of exactly 24 hours, which the legacy reader reads as closed", () => {
    const timed = (id: string, opens: string, lastSeating: string, closes: string) =>
      setServiceTime(
        setServiceTime(
          setServiceTime({ ...emptyDraft(id).services[0]!, name: id }, "opens", opens),
          "lastSeating",
          lastSeating
        ),
        "closes",
        closes
      );
    const draft: QuickSetupDraft = {
      services: [timed("l", "11:00", "14:00", "15:00"), timed("n", "22:00", "10:00", "11:00")],
      days: WEEKDAY_SHORTCUT,
    };
    expect(validateDraft(draft, { legacyReader: true })).toEqual([
      { serviceId: "n", field: "closes", code: "legacy_closed_day" },
    ]);
  });

  it("flags a service shorter than the last-seating buffer", () => {
    const draft = dinnerWeekdays();
    const short = replaceService(
      draft,
      setServiceTime(
        setServiceTime(setServiceTime(draft.services[0]!, "opens", "10:00"), "closes", "11:00"),
        "lastSeating",
        "10:30"
      )
    );
    expect(validateDraft(short, { legacyReader: true })).toEqual([
      { serviceId: "s1", field: "closes", code: "legacy_closed_day" },
    ]);
    // The Availability page card writes config rows directly, so the legacy reader never sees them.
    expect(validateDraft(short)).toEqual([]);
  });

  it("flags a service name over 40 characters", () => {
    const draft = dinnerWeekdays();
    const long = replaceService(draft, { ...draft.services[0]!, name: "D".repeat(41) });
    expect(validateDraft(long)).toEqual([
      { serviceId: "s1", field: "name", code: "name_too_long" },
    ]);
    const ok = replaceService(draft, { ...draft.services[0]!, name: "D".repeat(40) });
    expect(validateDraft(ok)).toEqual([]);
  });

  it("gates wizard hours on at least one open day, accepting past-midnight closes", () => {
    const late = applyPreset(emptyDraft("s1").services[0]!, "late", "Late");
    const hours = draftToLegacyHours({ services: [late], days: WEEK_DISPLAY_ORDER });
    expect(hours.monday).toEqual({ open: "22:00", close: "01:00" });
    expect(validateQuickSetupHours(hours)).toBeNull();
    expect(validateQuickSetupHours({})?.global).toBe("At least one day must be open");
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
          weekdays: [],
          dayHours: { version: 1 as const, sets: [] },
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

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function withoutIds(draft: QuickSetupDraft) {
  return {
    days: draft.days,
    services: draft.services.map(({ id: _id, blocks, ...rest }) => ({
      ...rest,
      blocks: blocks.map(({ id: _blockId, ...b }) => b),
    })),
  };
}

describe("quick setup draft with days and blocks", () => {
  it("writes a uniform draft as the rows it always wrote: no scope, no sets", () => {
    const config = draftToConfig(dinnerWeekdays(), counter());
    expect(config.scheduleServices).toHaveLength(1);
    expect(config.scheduleServices[0]).toMatchObject({
      opensAt: 1020,
      lastSeatingAt: 1275,
      closesAt: 1320,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    });
    expect(config.assignments[0]?.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it("encodes the demo week to the rows of the demo-week fixture", () => {
    const config = draftToConfig(demoDraft(), counter());
    const rowsOf = (c: typeof config) =>
      c.scheduleServices.map(
        ({ id: _id, scheduleId: _schedule, venueServiceId: _service, ...row }) => row
      );
    expect(rowsOf(config)).toEqual(rowsOf(DEMO_WEEK_CONFIG));
    expect(config.assignments[0]?.weekdays).toEqual(EVERY_DAY);
    expect(config.venueServices.map((s) => s.name)).toEqual(["Lunch", "Dinner", "Brunch"]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("round-trips through draftFromConfig", () => {
    const draft = demoDraft();
    expect(withoutIds(draftFromConfig(draftToConfig(draft, counter()), counter()))).toEqual(
      withoutIds(draft)
    );
    const uniform = dinnerWeekdays();
    expect(withoutIds(draftFromConfig(draftToConfig(uniform, counter()), counter()))).toEqual(
      withoutIds(uniform)
    );
  });

  it("reads a stored week back as base hours plus blocks", () => {
    const draft = draftFromConfig(DEMO_WEEK_CONFIG, counter());
    const dinner = draft.services.find((s) => s.name === "Dinner");
    expect(dinner).toMatchObject({ days: [2, 3, 4, 5, 6, 0], opens: "17:00", closes: "23:00" });
    expect(dinner?.blocks).toMatchObject([{ days: [5, 6], closes: "00:00" }]);
  });

  it("reports a Saturday-only overlap with the block that makes it", () => {
    const draft: QuickSetupDraft = {
      days: EVERY_DAY,
      services: [
        draftService("brunch", "Brunch", ["10:00", "17:00", "18:00"], { days: [6] }),
        draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], {
          days: [5, 6],
          blocks: [draftBlock("late", [5, 6], ["17:00", "22:00", "00:00"])],
        }),
      ],
    };
    const [issue, ...rest] = validateDraft(draft);
    expect(rest).toEqual([]);
    expect(issue).toEqual({
      serviceId: "dinner",
      blockId: "late",
      field: "opens",
      code: "overlap",
      weekday: 6,
      otherServiceId: "brunch",
    });
    expect(issueMessage(issue!, draft, localeRuntime.i18n.t, (d) => WEEKDAY_NAMES[d]!)).toBe(
      "Dinner overlaps Brunch on Saturday."
    );
  });

  it("accepts services that share a time on different days", () => {
    const draft: QuickSetupDraft = {
      days: EVERY_DAY,
      services: [
        draftService("brunch", "Brunch", ["10:00", "17:00", "18:00"], { days: [6, 0] }),
        draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], { days: [1, 2, 3, 4, 5] }),
      ],
    };
    expect(validateDraft(draft)).toEqual([]);
  });

  it("needs days for a service with its own days, and for a block", () => {
    const draft: QuickSetupDraft = {
      days: [],
      services: [
        draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], {
          days: [],
          blocks: [draftBlock("late", [], ["17:00", "22:00", "00:00"])],
        }),
      ],
    };
    // Every service has its own days, so the shared days are not asked for.
    const issues = validateDraft(draft);
    expect(issues).toEqual([
      { serviceId: "dinner", field: "days", code: "days_required" },
      { serviceId: "dinner", blockId: "late", field: "days", code: "block_days_required" },
    ]);
    expect(issueMessage(issues[0]!, draft, localeRuntime.i18n.t, (d) => WEEKDAY_NAMES[d]!)).toBe(
      "Choose at least one day for Dinner."
    );
  });

  it("checks a block's own times", () => {
    const draft: QuickSetupDraft = {
      days: EVERY_DAY,
      services: [
        draftService("dinner", "Dinner", ["17:00", "21:00", "23:00"], {
          blocks: [draftBlock("late", [5], ["17:00", "23:30", "23:00"])],
        }),
      ],
    };
    expect(validateDraft(draft)).toEqual([
      {
        serviceId: "dinner",
        blockId: "late",
        field: "lastSeating",
        code: "last_seating_after_close",
      },
    ]);
  });

  it("projects a varied week to each weekday's earliest open and latest close", () => {
    const hours = draftToLegacyHours(demoDraft());
    expect(hours.monday).toEqual({ open: "11:30", close: "15:00" });
    expect(hours.friday).toEqual({ open: "11:30", close: "00:00" });
    expect(hours.saturday).toEqual({ open: "10:00", close: "00:00" });
    expect(hours.sunday).toEqual({ open: "10:00", close: "23:00" });
  });
});
