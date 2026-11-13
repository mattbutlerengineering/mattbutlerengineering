import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, ClosureSummary, DateRule } from "@mbe/types";
import { closuresList, type ClosuresListInput } from "./closures-list.js";
import {
  rule,
  specialHours,
  THURSDAYS,
  TODAY,
  venue,
  window,
} from "./hub/hub-rows-test-helpers.js";

const YESTERDAY = "2026-11-11";
const TOMORROW = "2026-11-13";
const NEXT_THURSDAY = "2026-11-19";
const EMPTY = { now: [], upcoming: [], earlier: [] };

const ONLINE: Partial<DateRule> = { targetKind: "booking", bookingTypes: ["online"] };
const PATIO = rule("r-patio", {
  targetKind: "tables",
  sectionId: "sec-patio",
  tableIds: ["t-1", "t-2"],
  startsOn: "2026-11-01",
  endsOn: null,
});
const NOV_1 = rule("r-nov-1", { startsOn: "2026-11-01", endsOn: "2026-11-01" });
const SERIES = rule("r-series", THURSDAYS);
const skipToday = rule("r-skip", { kind: "skip", seriesId: "r-series" });

const summary = (ruleId: string, rest: Partial<ClosureSummary> = {}): ClosureSummary => ({
  ruleId,
  total: 0,
  cancelled: 0,
  sent: 0,
  rebooked: 0,
  unreachable: 0,
  refundFailed: 0,
  refundFailures: [],
  refundPending: 0,
  ...rest,
});

/** 10:00 AM on a Thursday, with the outcome counts loaded and empty, unless told otherwise. */
const list = (config: AvailabilityConfig, rest: Partial<ClosuresListInput> = {}) =>
  closuresList({
    config,
    sectionNames: new Map([["sec-patio", "Patio"]]),
    timezone: "America/Los_Angeles",
    today: TODAY,
    nowMinute: 600,
    summaries: [],
    ...rest,
  });

const ids = (rows: readonly { readonly ruleId: string }[]) => rows.map((row) => row.ruleId);

describe("closuresList: what is closed", () => {
  it("lists a venue closure on a date to come as upcoming, with its outcome counts", () => {
    const thanksgiving = rule("r-nov-26", { startsOn: "2026-11-26", endsOn: "2026-11-26" });
    const outcomes = summary("r-nov-26", { total: 16, sent: 12, rebooked: 3, unreachable: 1 });
    expect(list(venue([thanksgiving]), { summaries: [outcomes] })).toEqual({
      ...EMPTY,
      upcoming: [
        {
          group: "upcoming",
          ruleId: "r-nov-26",
          on: "2026-11-26",
          target: { kind: "venue" },
          startsOn: "2026-11-26",
          endsOn: "2026-11-26",
          weekdays: null,
          window: null,
          pause: false,
          editable: true,
          seriesId: null,
          series: null,
          outcomes,
          refundsOpen: 0,
        },
      ],
    });
  });

  it("lists a section closed until reopened as closed now", () => {
    expect(list(venue([PATIO]))).toEqual({
      ...EMPTY,
      now: [
        {
          group: "now",
          ruleId: "r-patio",
          on: TODAY,
          target: { kind: "section", sectionId: "sec-patio", name: "Patio" },
          startsOn: "2026-11-01",
          endsOn: null,
          weekdays: null,
          window: null,
          pause: false,
          editable: true,
          seriesId: null,
          series: null,
          outcomes: null,
          refundsOpen: 0,
        },
      ],
    });
  });

  it("lists nothing when nothing is closed or paused", () => {
    expect(list(venue())).toEqual(EMPTY);
  });

  it("lists a closure still running past midnight as closed now, on yesterday's date", () => {
    // Dinner closes at 2:00 AM. Closed from 10:00 PM yesterday; it is 12:30 AM.
    const lateNight = rule("r-late", {
      startsOn: YESTERDAY,
      endsOn: YESTERDAY,
      window: window(1320, 1560),
    });
    const config = venue([lateNight], { regularClosesAt: 1560 });
    expect(list(config, { nowMinute: 30 }).now).toMatchObject([
      { ruleId: "r-late", on: YESTERDAY, window: { from: 1320, to: 1560 } },
    ]);
    // By 10:00 AM yesterday's service is over, and nothing is owed for it.
    expect(list(config)).toEqual(EMPTY);
  });
});

describe("closuresList: a pause of online booking", () => {
  it("lists a pause in force as closed now, marked as a pause", () => {
    expect(list(venue([rule("r-pause", ONLINE)])).now).toMatchObject([
      {
        group: "now",
        ruleId: "r-pause",
        on: TODAY,
        target: { kind: "booking", channels: ["online"] },
        endsOn: TODAY,
        pause: true,
      },
    ]);
  });

  it("lists a pause waiting for its time as upcoming, today, until its time comes", () => {
    const waiting = rule("r-pause", { ...ONLINE, endsOn: null, window: window(1080) });
    expect(list(venue([waiting]))).toMatchObject({
      now: [],
      upcoming: [{ ruleId: "r-pause", on: TODAY, pause: true, window: { from: 1080, to: 2880 } }],
    });
    expect(list(venue([waiting]), { nowMinute: 1100 })).toMatchObject({
      now: [{ ruleId: "r-pause", on: TODAY, pause: true }],
      upcoming: [],
    });
  });

  it("does not read a repeating online closure, or one that stops phones too, as a pause", () => {
    const weekly = rule("r-weekly", { ...ONLINE, ...THURSDAYS } as Partial<DateRule>);
    const phones = rule("r-phones", { targetKind: "booking", bookingTypes: ["online", "phone"] });
    expect(list(venue([weekly, phones])).now).toMatchObject([
      { ruleId: "r-weekly", pause: false },
      { ruleId: "r-phones", pause: false },
    ]);
  });

  it("stops listing a pause for part of today once that part is over", () => {
    // Paused 10:00 AM to 3:00 PM today only.
    const config = venue([rule("p-b", { ...ONLINE, window: window(600, 900) })]);
    expect(ids(list(config, { nowMinute: 899 }).now)).toEqual(["p-b"]);
    expect(list(config, { nowMinute: 900 })).toEqual(EMPTY);
    expect(list(config, { nowMinute: 1000 })).toEqual(EMPTY);
  });

  it("lists a pause whose part of today is over as earlier while its refunds are open", () => {
    const config = venue([rule("p-b", { ...ONLINE, window: window(600, 900) })]);
    const summaries = [summary("p-b", { refundPending: 1 })];
    expect(list(config, { nowMinute: 1000, summaries })).toMatchObject({
      now: [],
      upcoming: [],
      earlier: [{ ruleId: "p-b", reason: "ended" }],
    });
  });

  it("lists no row for an online stop made for tonight, and files a pause beside it as usual", () => {
    const stop = rule("r-stop", {
      kind: "tonight",
      ...ONLINE,
      payload: { version: 1, stop: { from: 0, to: 2880 } },
    } as Partial<DateRule>);
    // The hub names the pause closure, which is in force all day.
    const allDay = list(venue([stop, rule("r-pause", ONLINE)]));
    expect(allDay).toMatchObject({ now: [{ ruleId: "r-pause", pause: true }], upcoming: [] });
    expect(allDay.earlier).toEqual([]);
    // The hub names the stop, in force now; the pause from 6:00 PM waits for its own time.
    const config = venue([stop, rule("r-pause", { ...ONLINE, window: window(1080) })]);
    expect(list(config)).toMatchObject({
      now: [],
      upcoming: [{ ruleId: "r-pause", on: TODAY, pause: true }],
      earlier: [],
    });
    expect(ids(list(config, { nowMinute: 1100 }).now)).toEqual(["r-pause"]);
  });

  it("holds the second of two pauses as upcoming until its own time, as the hub does", () => {
    // From 7:00 PM and from 8:00 PM. At 7:10 PM the first already stops every online booking.
    const first = rule("p-a", { ...ONLINE, window: window(1140) });
    const second = rule("p-b", { ...ONLINE, window: window(1200) });
    const config = venue([second, first]);
    const early = list(config, { nowMinute: 1150 });
    expect(ids(early.now)).toEqual(["p-a"]);
    expect(early.upcoming).toMatchObject([{ ruleId: "p-b", on: TODAY, pause: true }]);
    const late = list(config, { nowMinute: 1210 });
    expect(ids(late.now)).toEqual(["p-a", "p-b"]);
    expect(late.upcoming).toEqual([]);
  });
});

describe("closuresList: a repeating closure", () => {
  it("lists a series once, on its next date, with the dates skipped out of it", () => {
    const result = list(venue([SERIES, skipToday]));
    expect(result).toMatchObject({
      now: [],
      upcoming: [
        {
          ruleId: "r-series",
          on: NEXT_THURSDAY,
          startsOn: "2026-11-01",
          endsOn: "2027-02-28",
          weekdays: [4],
          editable: false,
          series: { skipped: [{ skipId: "r-skip", date: TODAY }] },
        },
      ],
    });
    expect(result.upcoming).toHaveLength(1);
  });

  it("lists the skipped dates in date order, and leaves out one already past", () => {
    const skip = (id: string, date: string) =>
      rule(id, { kind: "skip", seriesId: "r-series", startsOn: date, endsOn: date });
    const rules = [SERIES, skip("r-later", "2026-11-26"), skipToday, skip("r-past", "2026-11-05")];
    expect(list(venue(rules)).upcoming[0]?.series?.skipped).toEqual([
      { skipId: "r-skip", date: TODAY },
      { skipId: "r-later", date: "2026-11-26" },
    ]);
  });

  it("keeps a series whose only date left is skipped, so the date can be restored", () => {
    const ending = rule("r-series", { ...THURSDAYS, endsOn: TODAY });
    expect(list(venue([ending, skipToday]))).toMatchObject({
      now: [],
      upcoming: [
        { ruleId: "r-series", on: null, series: { skipped: [{ skipId: "r-skip", date: TODAY }] } },
      ],
    });
  });

  it("lists a one-date edit as its own row, pointing at the series it replaces that date of", () => {
    const edit = rule("r-edit", { seriesId: "r-series", window: window(1080) });
    const config = venue([SERIES, edit]);
    expect(list(config)).toMatchObject({
      now: [],
      upcoming: [
        { ruleId: "r-edit", on: TODAY, seriesId: "r-series", series: null, editable: false },
        { ruleId: "r-series", on: NEXT_THURSDAY, seriesId: null, series: { skipped: [] } },
      ],
    });
    // In the evening the edit is in force; the series it replaces today is not.
    const evening = list(config, { nowMinute: 1100 });
    expect(ids(evening.now)).toEqual(["r-edit"]);
    expect(ids(evening.upcoming)).toEqual(["r-series"]);
  });
});

describe("closuresList: earlier, with refunds still open", () => {
  it("lists an ended closure with a failed refund", () => {
    const failure = { outcomeId: "o-1", guestName: "Rivera", amountCents: 4000, currency: "USD" };
    const outcomes = summary("r-nov-1", {
      total: 3,
      cancelled: 3,
      refundFailed: 2,
      refundFailures: [failure],
      refundPending: 1,
    });
    expect(list(venue([NOV_1]), { summaries: [outcomes] })).toEqual({
      ...EMPTY,
      earlier: [
        {
          group: "earlier",
          ruleId: "r-nov-1",
          reason: "ended",
          closure: {
            target: { kind: "venue" },
            startsOn: "2026-11-01",
            endsOn: "2026-11-01",
            weekdays: null,
            window: null,
          },
          outcomes,
          refundsOpen: 3,
        },
      ],
    });
  });

  it("lists an ended closure with a refund still pending", () => {
    const outcomes = summary("r-nov-1", { refundPending: 1 });
    expect(list(venue([NOV_1]), { summaries: [outcomes] }).earlier).toMatchObject([
      { ruleId: "r-nov-1", refundsOpen: 1 },
    ]);
  });

  it("does not list an ended closure with nothing open", () => {
    const settled = summary("r-nov-1", { total: 3, cancelled: 3, sent: 3 });
    expect(list(venue([NOV_1]), { summaries: [settled] })).toEqual(EMPTY);
    expect(list(venue([NOV_1]))).toEqual(EMPTY);
  });

  it("lists nothing earlier while the outcome counts are not known", () => {
    expect(list(venue([NOV_1, PATIO]), { summaries: null })).toMatchObject({
      now: [{ ruleId: "r-patio", outcomes: null, refundsOpen: 0 }],
      earlier: [],
    });
  });

  it("lists refunds owed for a rule that is gone as removed, with no closure known", () => {
    const outcomes = summary("r-reopened", { refundFailed: 1 });
    expect(list(venue(), { summaries: [outcomes] }).earlier).toEqual([
      {
        group: "earlier",
        ruleId: "r-reopened",
        reason: "removed",
        closure: null,
        outcomes,
        refundsOpen: 1,
      },
    ]);
  });

  it("lists refunds owed for a change made for tonight as tonight's, not as ended", () => {
    const closeEarly = rule("r-close", {
      kind: "tonight",
      payload: { version: 1, closeAt: 1200 },
    } as Partial<DateRule>);
    const outcomes = summary("r-close", { refundPending: 2 });
    expect(list(venue([closeEarly]), { summaries: [outcomes] })).toEqual({
      ...EMPTY,
      earlier: [
        {
          group: "earlier",
          ruleId: "r-close",
          reason: "tonight",
          closure: null,
          outcomes,
          refundsOpen: 2,
        },
      ],
    });
  });

  it("leaves refunds owed for special hours to the Special dates page", () => {
    const hours = specialHours("r-sh", "2026-11-26");
    const summaries = [summary("r-sh", { refundFailed: 1 })];
    expect(list(venue([hours]), { summaries })).toEqual(EMPTY);
  });

  it("keeps a closure with refunds open in its own group while it is closed or to come", () => {
    const result = list(venue([PATIO]), { summaries: [summary("r-patio", { refundFailed: 1 })] });
    expect(result.now).toMatchObject([{ ruleId: "r-patio", refundsOpen: 1 }]);
    expect(result.earlier).toEqual([]);
  });
});

describe("closuresList: order", () => {
  it("lists a pause first among what is closed now, then the closure that started soonest", () => {
    const today = rule("r-a-today");
    const pause = rule("r-pause", ONLINE);
    expect(ids(list(venue([today, pause, PATIO])).now)).toEqual([
      "r-pause",
      "r-patio",
      "r-a-today",
    ]);
  });

  it("lists upcoming closures by the next date each closes, then by the time it starts", () => {
    const dec = rule("r-dec-25", { startsOn: "2026-12-25", endsOn: "2026-12-25" });
    const tomorrow = rule("r-tomorrow", { startsOn: TOMORROW, endsOn: TOMORROW });
    const tonight = rule("r-tonight", { window: window(1200) });
    const fromSix = rule("r-from-six", { window: window(1080) });
    const allSkipped = rule("r-series", { ...THURSDAYS, endsOn: TODAY });
    const rules = [dec, allSkipped, skipToday, tomorrow, tonight, fromSix];
    expect(ids(list(venue(rules)).upcoming)).toEqual([
      "r-from-six",
      "r-tonight",
      "r-tomorrow",
      "r-dec-25",
      "r-series",
    ]);
  });

  it("lists earlier closures most recently ended first, then refunds whose rule is gone", () => {
    const oct = rule("r-oct-20", { startsOn: "2026-10-20", endsOn: "2026-10-20" });
    const summaries = [
      summary("r-gone", { refundPending: 1 }),
      summary("r-oct-20", { refundFailed: 1 }),
      summary("r-nov-1", { refundFailed: 1 }),
    ];
    expect(ids(list(venue([oct, NOV_1]), { summaries }).earlier)).toEqual([
      "r-nov-1",
      "r-oct-20",
      "r-gone",
    ]);
  });
});

describe("closures-list.ts is policy", () => {
  it("imports no React, router or i18n", () => {
    const source = readFileSync(join(import.meta.dirname, "closures-list.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((from) => /react|router|i18n/i.test(from ?? ""))).toEqual([]);
  });
});
