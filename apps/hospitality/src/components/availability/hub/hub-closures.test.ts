import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import { rowsOf, rule, THURSDAYS, TODAY, venue, window } from "./hub-rows-test-helpers.js";

const YESTERDAY = "2026-11-11";
const TOMORROW = "2026-11-13";
const EMPTY = { row: 4, pause: null, tonight: [], now: [], next: null };

const ONLINE: Partial<DateRule> = { targetKind: "booking", bookingTypes: ["online"] };
/** A pause a closure makes, with no time it ends at. */
const FROM_CLOSURE = { source: "closure", untilMinute: null };
const PATIO = rule("r-patio", {
  targetKind: "tables",
  sectionId: "sec-patio",
  tableIds: ["t-1", "t-2"],
  startsOn: "2026-11-01",
  endsOn: null,
});
const skipToday = rule("r-skip", { kind: "skip", seriesId: "r-series" });

describe("hubRows: 4 closures and pauses", () => {
  it("lists what is closed now, then the next closure", () => {
    const thanksgiving = rule("r-nov-26", { startsOn: "2026-11-26", endsOn: "2026-11-26" });
    const later = rule("r-dec-25", { startsOn: "2026-12-25", endsOn: "2026-12-25" });
    expect(rowsOf(venue([later, thanksgiving, PATIO]))[3]).toEqual({
      ...EMPTY,
      now: [
        {
          ruleId: "r-patio",
          target: { kind: "section", sectionId: "sec-patio", name: "Patio" },
          nextOn: TODAY,
          startsOn: "2026-11-01",
          endsOn: null,
          weekdays: null,
          window: null,
        },
      ],
      next: {
        ruleId: "r-nov-26",
        target: { kind: "venue" },
        nextOn: "2026-11-26",
        startsOn: "2026-11-26",
        endsOn: "2026-11-26",
        weekdays: null,
        window: null,
      },
    });
  });

  it("lists nothing when nothing is closed or paused", () => {
    expect(rowsOf(venue())[3]).toEqual(EMPTY);
  });

  it("holds a closure whose time has not come as the next closure, not as closed now", () => {
    const fromSix = rule("r-from-six", { window: window(1080) });
    const expected = { ruleId: "r-from-six", nextOn: TODAY, window: { from: 1080, to: 2880 } };
    expect(rowsOf(venue([fromSix]))[3]).toMatchObject({ now: [], next: expected });
    expect(rowsOf(venue([fromSix]), { nowMinute: 1100 })[3]).toMatchObject({
      now: [expected],
      next: null,
    });
  });

  it("reads a repeating closure by its weekdays, and only on the days it covers", () => {
    const series = rule("r-series", THURSDAYS);
    expect(rowsOf(venue([series]))[3].now).toMatchObject([{ ruleId: "r-series", weekdays: [4] }]);
    // A Friday: the series is next, on the Thursday after.
    expect(rowsOf(venue([series]), { today: TOMORROW })[3]).toMatchObject({
      now: [],
      next: { ruleId: "r-series", nextOn: "2026-11-19" },
    });
  });
});

describe("hubRows: 4, a series date replaced by a skip or a one-date edit", () => {
  const series = rule("r-series", THURSDAYS);

  it("does not read the series as closed on a date its one-date edit replaces", () => {
    const edit = rule("r-edit", { seriesId: "r-series", window: window(1080) });
    const config = venue([series, edit]);
    expect(rowsOf(config)[3]).toMatchObject({
      now: [],
      next: { ruleId: "r-edit", nextOn: TODAY, window: { from: 1080, to: 2880 } },
    });
    const evening = rowsOf(config, { nowMinute: 1100 })[3];
    expect(evening.now.map((c) => c.ruleId)).toEqual(["r-edit"]);
    expect(evening.next).toMatchObject({ ruleId: "r-series", nextOn: "2026-11-19" });
  });

  it("steps past a skipped date to find the next closure", () => {
    const tomorrow = rule("r-tomorrow", { startsOn: TOMORROW, endsOn: TOMORROW });
    expect(rowsOf(venue([series, skipToday, tomorrow]))[3]).toMatchObject({
      now: [],
      next: { ruleId: "r-tomorrow", nextOn: TOMORROW },
    });
    expect(rowsOf(venue([series, skipToday]))[3].next).toMatchObject({
      ruleId: "r-series",
      nextOn: "2026-11-19",
    });
  });

  it("drops a series whose only date left is skipped", () => {
    const ending = rule("r-series", { ...THURSDAYS, endsOn: TODAY });
    expect(rowsOf(venue([ending, skipToday]))[3]).toEqual(EMPTY);
  });
});

describe("hubRows: 4, a closure for part of each day", () => {
  it("sorts a closure whose time has passed today by the next day it closes", () => {
    // Closed 11:00 AM to 12:00 PM each day through Saturday; it is 1:00 PM.
    const mornings = rule("r-mornings", { endsOn: "2026-11-14", window: window(660, 720) });
    const tomorrow = rule("r-tomorrow", { startsOn: TOMORROW, endsOn: TOMORROW });
    const afternoon = { nowMinute: 780 };
    expect(rowsOf(venue([mornings]), afternoon)[3]).toMatchObject({
      now: [],
      next: { ruleId: "r-mornings", nextOn: TOMORROW },
    });
    // The whole-day closure tomorrow starts before 11:00 AM tomorrow.
    expect(rowsOf(venue([mornings, tomorrow]), afternoon)[3].next).toMatchObject({
      ruleId: "r-tomorrow",
    });
  });

  it("drops a one-day closure whose time has passed", () => {
    const morning = rule("r-morning", { window: window(660, 720) });
    expect(rowsOf(venue([morning]), { nowMinute: 780 })[3]).toEqual(EMPTY);
  });

  it("is in force after midnight while yesterday's service still runs", () => {
    // Dinner closes at 2:00 AM. Closed from 10:00 PM yesterday; it is 12:30 AM.
    const lateNight = rule("r-late", {
      startsOn: YESTERDAY,
      endsOn: YESTERDAY,
      window: window(1320, 1560),
    });
    const config = venue([lateNight], { regularClosesAt: 1560 });
    expect(rowsOf(config, { nowMinute: 30 })[3]).toMatchObject({
      now: [{ ruleId: "r-late", nextOn: YESTERDAY, window: { from: 1320, to: 1560 } }],
      next: null,
    });
    // By 10:00 AM yesterday's service is over.
    expect(rowsOf(config)[3]).toEqual(EMPTY);
  });
});

describe("hubRows: 4, what a closure closes", () => {
  const targetOf = (closure: DateRule, sectionNames?: ReadonlyMap<string, string>) =>
    rowsOf(venue([closure]), sectionNames ? { sectionNames } : {})[3].now[0]?.target;

  it("keeps a closure of one service apart from the venue", () => {
    const dinner = rule("r-dinner", { targetKind: "service", venueServiceId: "vs-dinner" });
    expect(targetOf(dinner)).toEqual({
      kind: "service",
      venueServiceId: "vs-dinner",
      name: "Dinner",
    });
  });

  it("counts the tables of a closure that names no section", () => {
    const tables = rule("r-tables", { targetKind: "tables", tableIds: ["t-1", "t-2", "t-3"] });
    expect(targetOf(tables)).toEqual({ kind: "tables", count: 3 });
  });

  it("keeps a section whose name is not known as a section, with no name", () => {
    const unnamed = { kind: "section", sectionId: "sec-patio", name: null };
    expect(targetOf(PATIO, new Map([["sec-bar", "Bar"]]))).toEqual(unnamed);
    // While sections load, the map is empty.
    expect(targetOf(PATIO, new Map())).toEqual(unnamed);
  });

  it("carries the ways of booking a booking closure stops", () => {
    const phones = rule("r-phones", { targetKind: "booking", bookingTypes: ["online", "phone"] });
    expect(rowsOf(venue([phones]))[3]).toMatchObject({
      pause: null,
      now: [{ ruleId: "r-phones", target: { kind: "booking", channels: ["online", "phone"] } }],
    });
  });
});

describe("hubRows: 4, online pause", () => {
  it("carries an open-ended pause that is in force, apart from the closures", () => {
    expect(rowsOf(venue([rule("r-pause", { ...ONLINE, endsOn: null })]))[3]).toEqual({
      ...EMPTY,
      pause: { ...FROM_CLOSURE, ruleId: "r-pause", inForce: true, fromMinute: null, endsOn: null },
    });
  });

  it("carries an open-ended pause that is waiting for its time", () => {
    const waiting = rule("r-pause", { ...ONLINE, endsOn: null, window: window(1080) });
    expect(rowsOf(venue([waiting]))[3]).toEqual({
      ...EMPTY,
      pause: { ...FROM_CLOSURE, ruleId: "r-pause", inForce: false, fromMinute: 1080, endsOn: null },
    });
    // Once its time is reached it is in force.
    expect(rowsOf(venue([waiting]), { nowMinute: 1100 })[3].pause).toMatchObject({
      inForce: true,
    });
  });

  it("carries a pause for tonight only, in force, with the date it ends", () => {
    expect(rowsOf(venue([rule("r-pause", ONLINE)]))[3]).toEqual({
      ...EMPTY,
      pause: { ...FROM_CLOSURE, ruleId: "r-pause", inForce: true, fromMinute: null, endsOn: TODAY },
    });
  });

  it("carries a pause for tonight only that is waiting for its time", () => {
    const waiting = rule("r-pause", { ...ONLINE, window: window(1080) });
    expect(rowsOf(venue([waiting]))[3]).toEqual({
      ...EMPTY,
      pause: {
        ...FROM_CLOSURE,
        ruleId: "r-pause",
        inForce: false,
        fromMinute: 1080,
        endsOn: TODAY,
      },
    });
  });

  it("names the pause in force of two, and leaves the other with the closures", () => {
    const tonight = rule("r-tonight-only", { ...ONLINE, window: window(1080) });
    const open = rule("r-open", { ...ONLINE, startsOn: "2026-11-01", endsOn: null });
    expect(rowsOf(venue([tonight, open]))[3]).toMatchObject({
      pause: { ruleId: "r-open", inForce: true, endsOn: null },
      now: [],
      next: { ruleId: "r-tonight-only", target: { kind: "booking", channels: ["online"] } },
    });
  });

  it("names the soonest of two pauses when neither is in force", () => {
    const fromEight = rule("r-eight", { ...ONLINE, window: window(1200) });
    const fromSix = rule("r-six", { ...ONLINE, window: window(1080) });
    expect(rowsOf(venue([fromEight, fromSix]))[3]).toMatchObject({
      pause: { ruleId: "r-six", inForce: false, fromMinute: 1080 },
      next: { ruleId: "r-eight" },
    });
  });

  it("does not read a pause that starts on a later date as the pause", () => {
    const later = rule("r-later", { ...ONLINE, startsOn: "2026-11-20", endsOn: "2026-11-20" });
    expect(rowsOf(venue([later]))[3]).toMatchObject({ pause: null, next: { ruleId: "r-later" } });
  });
});

describe("hubRows: 4, an online pause for part of the day", () => {
  // Online booking off from 12:00 PM to 2:00 PM today.
  const lunchtime = rule("r-pause", { ...ONLINE, window: window(720, 840) });

  it("carries the minute a pause in force ends at", () => {
    expect(rowsOf(venue([lunchtime]), { nowMinute: 780 })[3]).toEqual({
      ...EMPTY,
      pause: {
        ruleId: "r-pause",
        source: "closure",
        inForce: true,
        fromMinute: 720,
        untilMinute: 840,
        endsOn: TODAY,
      },
    });
  });

  it("is no pause once its time has passed", () => {
    expect(rowsOf(venue([lunchtime]), { nowMinute: 900 })[3]).toEqual(EMPTY);
  });

  it("holds one that runs on later days as the next closure once today's time has passed", () => {
    const daily = rule("r-pause", { ...ONLINE, endsOn: "2026-11-14", window: window(720, 840) });
    expect(rowsOf(venue([daily]), { nowMinute: 900 })[3]).toMatchObject({
      pause: null,
      now: [],
      next: { ruleId: "r-pause", nextOn: TOMORROW },
    });
  });
});

describe("hubRows: 4, an online stop made for tonight is the pause", () => {
  const stop = (id: string, from: number, to = 2880, rest: Partial<DateRule> = {}): DateRule =>
    rule(id, {
      kind: "tonight",
      ...ONLINE,
      payload: { version: 1, stop: { from, to } },
      ...rest,
    } as Partial<DateRule>);

  it("carries a stop for the rest of tonight as the pause in force", () => {
    expect(rowsOf(venue([stop("r-stop", 0)]))[3]).toEqual({
      ...EMPTY,
      pause: {
        ruleId: "r-stop",
        source: "tonight",
        inForce: true,
        fromMinute: 0,
        untilMinute: null,
        endsOn: TODAY,
      },
    });
  });

  it("carries a stop that waits for its time, then one in force with the minute it ends", () => {
    const evening = venue([stop("r-stop", 1080, 1200)]);
    expect(rowsOf(evening)[3].pause).toEqual({
      ruleId: "r-stop",
      source: "tonight",
      inForce: false,
      fromMinute: 1080,
      untilMinute: 1200,
      endsOn: TODAY,
    });
    expect(rowsOf(evening, { nowMinute: 1100 })[3].pause).toMatchObject({ inForce: true });
    // Once the stop is over, online booking is open again.
    expect(rowsOf(evening, { nowMinute: 1200 })[3]).toEqual(EMPTY);
  });

  it("counts a stop of online with other ways of booking", () => {
    const both = stop("r-stop", 0, 2880, { bookingTypes: ["online", "phone"] });
    expect(rowsOf(venue([both]))[3].pause).toMatchObject({ ruleId: "r-stop", source: "tonight" });
  });

  it("leaves the slot to a closure pause that is in force", () => {
    const open = rule("r-open", { ...ONLINE, startsOn: "2026-11-01", endsOn: null });
    expect(rowsOf(venue([stop("r-stop", 0), open]))[3].pause).toMatchObject({
      ruleId: "r-open",
      source: "closure",
      inForce: true,
    });
  });

  it("takes the slot from a closure pause that is still waiting", () => {
    const waiting = rule("r-waiting", { ...ONLINE, window: window(1080) });
    expect(rowsOf(venue([waiting, stop("r-stop", 0)]))[3]).toMatchObject({
      pause: { ruleId: "r-stop", source: "tonight", inForce: true },
      next: { ruleId: "r-waiting" },
    });
  });

  it("does not read a stop made for another night, or of other ways of booking, as the pause", () => {
    const lastNight = stop("r-stop", 0, 2880, { startsOn: YESTERDAY, endsOn: YESTERDAY });
    expect(rowsOf(venue([lastNight]))[3]).toEqual(EMPTY);
    const phone = stop("r-phone", 0, 2880, { bookingTypes: ["phone"] });
    expect(rowsOf(venue([phone]))[3]).toEqual(EMPTY);
  });
});

describe("hubRows: 4, changes made for tonight", () => {
  const tonight = (id: string, rest: Partial<DateRule>): DateRule =>
    rule(id, { kind: "tonight", ...rest } as Partial<DateRule>);

  it("lists a close-early for tonight", () => {
    const closeAtEight = tonight("r-close", { payload: { version: 1, closeAt: 1200 } });
    expect(rowsOf(venue([closeAtEight]))[3]).toEqual({
      ...EMPTY,
      tonight: [{ ruleId: "r-close", closeAt: 1200, window: null }],
    });
  });

  it("lists a stop of the whole venue for part of tonight", () => {
    const stop = tonight("r-stop", { payload: { version: 1, stop: { from: 1170, to: 1200 } } });
    expect(rowsOf(venue([stop]))[3].tonight).toEqual([
      { ruleId: "r-stop", closeAt: null, window: { from: 1170, to: 1200 } },
    ]);
  });

  it.each<[string, Partial<DateRule>]>([
    ["a pacing change", { payload: { version: 1, pacing: { covers: 6 } } }],
    [
      "blocked tables",
      {
        targetKind: "tables",
        tableIds: ["t-1"],
        payload: { version: 1, stop: { from: 0, to: 2880 } },
      },
    ],
  ])("does not list %s: it changes no hours", (_name, rest) => {
    expect(rowsOf(venue([tonight("r-tonight", rest)]))[3]).toEqual(EMPTY);
  });

  it("does not list a change made for another night", () => {
    const yesterday = tonight("r-close", {
      startsOn: YESTERDAY,
      endsOn: YESTERDAY,
      payload: { version: 1, closeAt: 1200 },
    });
    expect(rowsOf(venue([yesterday]))[3].tonight).toEqual([]);
  });
});
