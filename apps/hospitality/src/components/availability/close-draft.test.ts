import { describe, expect, it } from "vitest";
import type { ClosureImpactGroup, DateRule } from "@mbe/types";
import { EARLY_DINNER, fixtureConfig } from "./resolved-day-fixtures.js";
import {
  actionsFor,
  activeOnlinePause,
  buildCloseRule,
  closedDates,
  closeWhenId,
  decisionsReady,
  isUrgent,
  outcomeCounts,
  replacedSpecialDate,
  startMinutes,
  toDecisions,
  validateClose,
  type CloseForm,
} from "./close-draft.js";

const TODAY = "2026-12-01";

const form = (patch: Partial<CloseForm> = {}): CloseForm => ({
  what: { kind: "venue" },
  when: { kind: "date", date: "2026-12-24" },
  fromMinute: null,
  staffNote: "",
  guestMessage: "",
  ...patch,
});

const group = (patch: Partial<ClosureImpactGroup> = {}): ClosureImpactGroup => ({
  groupKey: "2026-12-24:closed",
  date: "2026-12-24",
  kind: "closed",
  covers: 52,
  depositsHeld: 3,
  reservations: Array.from({ length: 14 }, (_, i) => ({
    id: `r${i}`,
    startTime: "2026-12-24T17:30:00Z",
    endTime: "2026-12-24T19:00:00Z",
    partySize: 4,
    guestName: "Rivera",
    deposit: null,
    runsIntoClosure: false,
  })),
  ...patch,
});

describe("buildCloseRule", () => {
  it("closes the whole venue on one date with no window", () => {
    expect(buildCloseRule(form(), "rule-1", TODAY)).toMatchObject({
      id: "rule-1",
      kind: "closure",
      targetKind: "venue",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
      window: null,
    });
  });

  it("closes tonight as today", () => {
    expect(buildCloseRule(form({ when: { kind: "tonight" } }), "r", TODAY)).toMatchObject({
      startsOn: TODAY,
      endsOn: TODAY,
    });
  });

  it("leaves an until-I-reopen closure open-ended", () => {
    const rule = buildCloseRule(form({ when: { kind: "until-reopen", from: TODAY } }), "r", TODAY);
    expect(rule).toMatchObject({ startsOn: TODAY, endsOn: null });
  });

  it("turns a start time into a window running to the end of the service day", () => {
    const rule = buildCloseRule(form({ fromMinute: 22 * 60 }), "r", TODAY);
    expect(rule).toMatchObject({ window: { version: 1, from: 1320, to: 2880 } });
  });

  it("targets one service, or the chosen booking channels", () => {
    expect(
      buildCloseRule(form({ what: { kind: "service", serviceId: "svc" } }), "r", TODAY)
    ).toMatchObject({ targetKind: "service", venueServiceId: "svc" });
    const booking = buildCloseRule(
      form({ what: { kind: "booking", types: ["online"] } }),
      "r",
      TODAY
    );
    expect(booking).toMatchObject({ targetKind: "booking", bookingTypes: ["online"] });
  });

  it("repeats on weekdays across a range", () => {
    const rule = buildCloseRule(
      form({ when: { kind: "repeats", weekdays: [1], from: "2027-01-01", to: "2027-03-31" } }),
      "r",
      TODAY
    );
    expect(rule).toMatchObject({
      startsOn: "2027-01-01",
      endsOn: "2027-03-31",
      repeat: { version: 1, weekdays: [1] },
    });
  });

  it("carries trimmed messages and omits empty ones", () => {
    const rule = buildCloseRule(form({ staffNote: " Gomez ", guestMessage: "" }), "r", TODAY);
    expect(rule).toMatchObject({ staffNote: "Gomez" });
    expect(rule?.guestMessage).toBeUndefined();
  });

  it("is null until the form is complete", () => {
    expect(buildCloseRule(form({ when: { kind: "date", date: "" } }), "r", TODAY)).toBeNull();
    expect(buildCloseRule(form({ what: { kind: "booking", types: [] } }), "r", TODAY)).toBeNull();
    expect(
      buildCloseRule(form({ what: { kind: "service", serviceId: "" } }), "r", TODAY)
    ).toBeNull();
    expect(
      buildCloseRule(
        form({ when: { kind: "range", from: "2026-12-24", to: "2026-12-20" } }),
        "r",
        TODAY
      )
    ).toBeNull();
  });
});

describe("validateClose", () => {
  it("names the first problem field", () => {
    expect(validateClose(form({ what: { kind: "booking", types: [] } }), TODAY)).toBe("what");
    expect(validateClose(form({ when: { kind: "date", date: "" } }), TODAY)).toBe("when");
    expect(validateClose(form({ guestMessage: "x".repeat(201) }), TODAY)).toBe("guestMessage");
    expect(validateClose(form(), TODAY)).toBeNull();
  });
});

describe("closeWhenId: where a failed Next sends focus (#7979)", () => {
  const repeats = (from: string, to: string) => ({
    kind: "repeats" as const,
    from,
    to,
    weekdays: [],
  });

  it.each([
    ["no start date", repeats("", "2026-11-10")],
    ["no dates at all", repeats("", "")],
    ["no end date", repeats("2026-11-10", "")],
    ["dates out of order", repeats("2026-11-10", "2026-11-09")],
    ["a single date", { kind: "date" as const, date: "" }],
  ])("%s: the dates", (_name, when) => {
    expect(closeWhenId(when, false)).toBe("close-field-when");
    expect(closeWhenId(when, true)).toBeUndefined();
  });

  it("a repeat whose dates are in order: its days", () => {
    const when = repeats("2026-11-09", "2026-11-10");
    expect(closeWhenId(when, true)).toBe("close-field-when");
    expect(closeWhenId(when, false)).toBeUndefined();
  });
});

describe("decisions", () => {
  const key = "2026-12-24:closed";

  it("offers move only for a shortened group", () => {
    expect(actionsFor("closed")).toEqual(["cancel", "keep_notify", "keep_silent"]);
    expect(actionsFor("shortened")).toEqual(["cancel", "move", "keep_notify", "keep_silent"]);
  });

  it("needs a choice per group, and the box for keeping silent", () => {
    const groups = [group()];
    expect(decisionsReady(groups, {})).toBe(false);
    expect(decisionsReady(groups, { [key]: { action: "cancel", acknowledged: false } })).toBe(true);
    expect(decisionsReady(groups, { [key]: { action: "keep_silent", acknowledged: false } })).toBe(
      false
    );
    expect(decisionsReady(groups, { [key]: { action: "keep_silent", acknowledged: true } })).toBe(
      true
    );
  });

  it("sends the acknowledgement only with keep_silent, and the bookings each choice was made on", () => {
    const ids = group().reservations.map((r) => r.id);
    const groups = [group(), group({ groupKey: "2026-12-25:closed", date: "2026-12-25" })];
    expect(
      toDecisions(groups, {
        [key]: { action: "cancel", acknowledged: true },
        "2026-12-25:closed": { action: "keep_silent", acknowledged: true },
      })
    ).toEqual([
      { groupKey: key, action: "cancel", reservationIds: ids },
      {
        groupKey: "2026-12-25:closed",
        action: "keep_silent",
        acknowledged: true,
        reservationIds: ids,
      },
    ]);
  });

  it("counts bookings per chosen outcome", () => {
    const second = group({
      groupKey: "2026-12-25:closed",
      date: "2026-12-25",
      reservations: group().reservations.slice(0, 9),
    });
    expect(
      outcomeCounts([group(), second], {
        [key]: { action: "cancel", acknowledged: false },
        "2026-12-25:closed": { action: "keep_notify", acknowledged: false },
      })
    ).toEqual({ cancel: 14, move: 0, keep_notify: 9, keep_silent: 0 });
  });
});

describe("isUrgent", () => {
  it("is urgent when the closure starts within 6 hours", () => {
    expect(isUrgent({ startsOn: TODAY, fromMinute: null }, TODAY, 20 * 60)).toBe(true);
    expect(isUrgent({ startsOn: TODAY, fromMinute: 23 * 60 }, TODAY, 18 * 60)).toBe(true);
    expect(isUrgent({ startsOn: TODAY, fromMinute: 23 * 60 }, TODAY, 12 * 60)).toBe(false);
    expect(isUrgent({ startsOn: "2026-12-24", fromMinute: null }, TODAY, 12 * 60)).toBe(false);
  });

  it("is never urgent for a closure two or more days out, however late it is", () => {
    for (const nowMinute of [18 * 60, 20 * 60, 23 * 60 + 59]) {
      expect(isUrgent({ startsOn: "2026-12-03", fromMinute: null }, TODAY, nowMinute)).toBe(false);
      expect(isUrgent({ startsOn: "2026-12-24", fromMinute: null }, TODAY, nowMinute)).toBe(false);
    }
  });

  describe("a repeating closure that started in the past", () => {
    // TODAY is Tuesday 2026-12-01.
    const tuesdays = { startsOn: "2026-10-06", fromMinute: 20 * 60, repeat: { weekdays: [2] } };
    const sundays = { startsOn: "2026-10-04", fromMinute: null, repeat: { weekdays: [0] } };

    it("is urgent when its next occurrence is tonight", () => {
      expect(isUrgent(tuesdays, TODAY, 18 * 60)).toBe(true);
    });

    it("is not urgent when its next occurrence is days away", () => {
      expect(isUrgent(sundays, TODAY, 20 * 60)).toBe(false);
    });
  });

  it("is not urgent when the range ended before today", () => {
    expect(
      isUrgent({ startsOn: "2026-11-01", endsOn: "2026-11-05", fromMinute: null }, TODAY, 20 * 60)
    ).toBe(false);
  });

  it("measures a closure tomorrow from tonight", () => {
    expect(isUrgent({ startsOn: "2026-12-02", fromMinute: null }, TODAY, 20 * 60)).toBe(true);
    expect(isUrgent({ startsOn: "2026-12-02", fromMinute: 60 }, TODAY, 20 * 60)).toBe(true);
    expect(isUrgent({ startsOn: "2026-12-02", fromMinute: 12 * 60 }, TODAY, 20 * 60)).toBe(false);
  });
});

describe("activeOnlinePause", () => {
  const rule = (patch: Record<string, unknown>) =>
    ({
      id: "p1",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: "2026-11-30",
      endsOn: null,
      ...patch,
    }) as DateRule;

  const NOON = 12 * 60;
  const TZ = "America/Los_Angeles";
  /** Dinner to `closesAt`, on the fixture's only open day, Friday. */
  const pausedAt = (r: DateRule, today: string, minute: number, closesAt = 1380) => {
    const base = fixtureConfig(r);
    const scheduleServices = base.scheduleServices.map((s) => ({ ...s, closesAt }));
    return activeOnlinePause({ ...base, scheduleServices }, TZ, today, minute);
  };

  it("finds an open-ended online pause that has started", () => {
    expect(pausedAt(rule({}), TODAY, NOON)?.id).toBe("p1");
    expect(pausedAt(rule({ window: null }), TODAY, NOON)?.id).toBe("p1");
  });

  it("ignores pauses that have not started, have ended, or close other channels", () => {
    expect(pausedAt(rule({ startsOn: "2026-12-02" }), TODAY, NOON)).toBeNull();
    expect(pausedAt(rule({ endsOn: "2026-11-30" }), TODAY, NOON)).toBeNull();
    expect(pausedAt(rule({ bookingTypes: ["phone"] }), TODAY, NOON)).toBeNull();
    expect(pausedAt(rule({ targetKind: "venue" }), TODAY, NOON)).toBeNull();
  });

  it("ignores a repeating online closure, even on one of its weekdays", () => {
    // 2026-12-01 is a Tuesday; Resume would delete the whole recurring rule.
    const tuesdays = rule({ repeat: { version: 1, weekdays: [2] } });
    const mondays = rule({ repeat: { version: 1, weekdays: [1] } });
    expect(pausedAt(mondays, TODAY, NOON)).toBeNull();
    expect(pausedAt(tuesdays, TODAY, NOON)).toBeNull();
  });

  it("ignores a dated online closure: only the open-ended pause shape offers Resume", () => {
    expect(pausedAt(rule({ startsOn: TODAY, endsOn: TODAY }), TODAY, NOON)).toBeNull();
  });

  describe("a pause from a next-day time (#7978)", () => {
    const FRIDAY = "2026-11-06";
    const SATURDAY = "2026-11-07";
    const fromNextDay = rule({ startsOn: FRIDAY, window: { version: 1, from: 1500, to: 2880 } });

    it("is not in force until that time on the night it starts", () => {
      expect(pausedAt(fromNextDay, FRIDAY, 20 * 60)).toBeNull();
      expect(pausedAt(fromNextDay, SATURDAY, 30)).toBeNull();
    });

    it("is in force once the clock passes it, after midnight", () => {
      expect(pausedAt(fromNextDay, SATURDAY, 90, 1560)?.id).toBe("p1");
    });

    it("stays in force past midnight when it started the evening before", () => {
      const evening = rule({ startsOn: FRIDAY, window: { version: 1, from: 22 * 60, to: 2880 } });
      expect(pausedAt(evening, SATURDAY, 30, 1560)?.id).toBe("p1");
    });

    describe("once yesterday's service is over", () => {
      const fromSix = rule({ startsOn: FRIDAY, window: { version: 1, from: 18 * 60, to: 2880 } });

      it("is not in force the next morning, when lunch is bookable, as on the first", () => {
        expect(pausedAt(fromSix, FRIDAY, 10 * 60, 1560)).toBeNull();
        expect(pausedAt(fromSix, SATURDAY, 10 * 60, 1560)).toBeNull();
      });

      it("is not in force after the 2:00 AM close, or past midnight with no late service", () => {
        expect(pausedAt(fromSix, SATURDAY, 150, 1560)).toBeNull();
        expect(pausedAt(fromSix, SATURDAY, 30)).toBeNull();
      });

      it("is in force again from its own time", () => {
        expect(pausedAt(fromSix, SATURDAY, 18 * 60, 1560)?.id).toBe("p1");
      });
    });
  });

  it("waits for a later-today window to start", () => {
    const late = rule({ startsOn: TODAY, window: { version: 1, from: 22 * 60, to: 2880 } });
    expect(pausedAt(late, TODAY, NOON)).toBeNull();
    expect(pausedAt(late, TODAY, 22 * 60)?.id).toBe("p1");
  });
});

describe("replacedSpecialDate (#7978)", () => {
  // 2026-12-25 is a Friday.
  const special = [{ ...EARLY_DINNER, id: "sh", startsOn: "2026-12-25", endsOn: "2026-12-25" }];

  it("finds special hours inside a range, not only on its first day", () => {
    expect(replacedSpecialDate(special, { startsOn: "2026-12-20", endsOn: "2026-12-31" })).toBe(
      "2026-12-25"
    );
    expect(
      replacedSpecialDate(special, { startsOn: "2026-12-26", endsOn: "2026-12-31" })
    ).toBeNull();
  });

  it("only counts the weekdays a repeat covers", () => {
    const range = { startsOn: "2026-12-20", endsOn: "2026-12-31" };
    expect(replacedSpecialDate(special, { ...range, repeat: { version: 1, weekdays: [5] } })).toBe(
      "2026-12-25"
    );
    expect(
      replacedSpecialDate(special, { ...range, repeat: { version: 1, weekdays: [1, 2] } })
    ).toBeNull();
  });

  it("scans an open-ended closure forward", () => {
    expect(replacedSpecialDate(special, { startsOn: "2026-12-01", endsOn: null })).toBe(
      "2026-12-25"
    );
  });
});

describe("closedDates (#7978)", () => {
  it("lists every date of a range", () => {
    expect(closedDates({ startsOn: "2026-11-02", endsOn: "2026-11-04" })).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
  });

  it("lists only a repeat's weekdays, from the first one on or after its start", () => {
    // 2026-11-02 is a Monday.
    const repeat = { version: 1 as const, weekdays: [5] };
    expect(closedDates({ startsOn: "2026-11-02", endsOn: "2026-11-14", repeat })).toEqual([
      "2026-11-06",
      "2026-11-13",
    ]);
  });

  it("stops after a year when nothing ends it, and is empty when no date qualifies", () => {
    expect(closedDates({ startsOn: "2026-11-02", endsOn: null }).length).toBeLessThan(368);
    const repeat = { version: 1 as const, weekdays: [5] };
    expect(closedDates({ startsOn: "2026-11-02", endsOn: "2026-11-03", repeat })).toEqual([]);
  });
});

describe("startMinutes (#7978)", () => {
  const FRIDAY = "2026-12-25";
  const late = (closesAt: number) => {
    const base = fixtureConfig();
    return { ...base, scheduleServices: base.scheduleServices.map((s) => ({ ...s, closesAt })) };
  };
  const TZ = "America/Los_Angeles";

  it("offers the whole day in half hours when the day closes before midnight", () => {
    const options = startMinutes(fixtureConfig(), TZ, [FRIDAY], null);
    expect(options).toHaveLength(48);
    expect(options.at(-1)).toBe(1410);
  });

  it("continues past midnight to the half hour before a 2:00 AM close", () => {
    const options = startMinutes(late(1560), TZ, [FRIDAY], null);
    expect(options.slice(-5)).toEqual([1410, 1440, 1470, 1500, 1530]);
  });

  it("keeps a start time the form already holds selectable", () => {
    expect(startMinutes(fixtureConfig(), TZ, [FRIDAY], 1500)).toContain(1500);
  });

  describe("on a day that runs past midnight", () => {
    /** Dinner alone, 5:00 PM to 2:00 AM. */
    const overnight = () => {
      const base = late(1560);
      return {
        ...base,
        scheduleServices: base.scheduleServices.filter((s) => s.venueServiceId === "vs-dinner"),
      };
    };

    it("never offers a morning time, which reads as after midnight and closes the evening", () => {
      const options = startMinutes(overnight(), TZ, [FRIDAY], null);
      expect(options).not.toContain(60);
      expect(options[0]).toBe(1020);
      expect(options).toContain(1500);
      expect(options).toHaveLength(18);
    });

    it("reads every date it is given: one late day is enough to drop the morning times", () => {
      const monday = "2026-12-21"; // closed in the fixture, so nothing but Friday has hours
      const options = startMinutes(overnight(), TZ, [monday, FRIDAY], null);
      expect(options).not.toContain(60);
      expect(options).toContain(1500);
    });

    it("sees a late schedule assigned to only some weeks of a long closure", () => {
      const base = fixtureConfig();
      const week = { ...base.assignments[0]!, weekdays: [0, 1, 2, 3, 4, 5, 6] };
      const lateWeek = {
        ...base.assignments[0]!,
        id: "as-late",
        scheduleId: "late",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        precedence: 1,
        startsOn: "2026-12-14",
        endsOn: "2026-12-20",
      };
      const config = {
        ...base,
        schedules: [
          ...base.schedules,
          { id: "late", name: "Late", kind: "regular" as const, isRegular: false },
        ],
        scheduleServices: [
          ...base.scheduleServices,
          ...overnight().scheduleServices.map((s) => ({ ...s, id: "ss-late", scheduleId: "late" })),
        ],
        assignments: [week, lateWeek],
      };
      const dates = closedDates({ startsOn: "2026-12-07", endsOn: "2026-12-31" });
      expect(startMinutes(config, TZ, dates, null)).toContain(1500);
    });

    it("still keeps a morning time the form already holds", () => {
      expect(startMinutes(overnight(), TZ, [FRIDAY], 60)).toContain(60);
    });
  });
});
