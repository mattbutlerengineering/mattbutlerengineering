import { describe, expect, it } from "vitest";
import type { ClosureImpactGroup, DateRule } from "@mbe/types";
import { defaultT } from "../../i18n/default-t.js";
import { formatCalendarDate, formatLocalTime } from "../../utils/format.js";
import { EARLY_DINNER, fixtureConfig } from "./resolved-day-fixtures.js";
import {
  actionsFor,
  shownOnlinePause,
  buildCloseRule,
  buildCloseRules,
  toggleDate,
  closedDates,
  closeWhenId,
  decisionsReady,
  isPauseInForce,
  isUrgent,
  outcomeCounts,
  replacedSpecialDate,
  settleStartMinute,
  startMinutes,
  toDecisions,
  unmovable,
  validateClose,
  willHaveStepTwo,
  withoutChoicesFor,
  type CloseForm,
} from "./close-draft.js";
import {
  closeButtonText,
  closeIncompleteText,
  closeToastText,
  type ToastOutcome,
} from "./close-text.js";

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

  it("does not take a move for a group with a booking that has no open time", () => {
    const stuck = group({
      groupKey: "2026-12-24:shortened",
      kind: "shortened",
      reservations: [
        { ...group().reservations[0]!, id: "ok", proposedStart: "2026-12-25T02:00:00.000Z" },
        { ...group().reservations[0]!, id: "stuck", proposedStart: null },
      ],
    });
    const key = stuck.groupKey;
    expect(unmovable(stuck).map((r) => r.id)).toEqual(["stuck"]);
    expect(decisionsReady([stuck], { [key]: { action: "move", acknowledged: false } })).toBe(false);
    expect(decisionsReady([stuck], { [key]: { action: "cancel", acknowledged: false } })).toBe(
      true
    );
    // A server that sent no proposals (an older one) leaves the choice to the server.
    const unknown = group({
      groupKey: key,
      kind: "shortened",
      reservations: [{ ...group().reservations[0]!, id: "x" }],
    });
    expect(unmovable(unknown)).toEqual([]);
  });

  it("drops the choice of every group holding a booking that could not be moved", () => {
    const a = group();
    const b = group({
      groupKey: "2026-12-25:closed",
      date: "2026-12-25",
      reservations: [{ ...group().reservations[0]!, id: "other" }],
    });
    const choices = {
      [a.groupKey]: { action: "move", acknowledged: false },
      [b.groupKey]: { action: "cancel", acknowledged: false },
    } as const;
    const ids = [a.reservations[0]!.id];
    expect(Object.keys(withoutChoicesFor([a, b], choices, ids))).toEqual([b.groupKey]);
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

describe("settleStartMinute (#8032)", () => {
  const MONDAY = "2026-12-21";
  /** The fixture week's dinner to `closesAt`; 2026-12-25, a Friday, is its only open day. */
  const config = (closesAt: number) => {
    const base = fixtureConfig();
    return {
      ...base,
      scheduleServices: base.scheduleServices.map((s) => ({ ...s, closesAt })),
    };
  };
  const monday = form({ when: { kind: "date", date: MONDAY }, fromMinute: 60 });
  const toRange = (to: string): CloseForm => ({
    ...monday,
    when: { kind: "range", from: MONDAY, to },
  });
  const settled = (next: CloseForm, closesAt = 1560) =>
    settleStartMinute(monday, next, config(closesAt), "America/Los_Angeles", TODAY);

  it("drops a time before opening once a covered day runs past midnight", () => {
    expect(settled(toRange("2026-12-27")).fromMinute).toBeNull();
  });

  it("keeps it when no covered day runs past midnight", () => {
    expect(settled(toRange("2026-12-27"), 1380).fromMinute).toBe(60);
    expect(settled(toRange("2026-12-22")).fromMinute).toBe(60);
  });

  it("keeps a time after midnight, which means what it says on the late day", () => {
    const next = { ...toRange("2026-12-27"), fromMinute: 1500 };
    expect(settled(next).fromMinute).toBe(1500);
  });

  it("waits for When to be complete", () => {
    expect(settled(toRange("")).fromMinute).toBe(60);
  });

  it("leaves a time alone when When did not change: a series keeps its own", () => {
    const friday = form({ when: { kind: "date", date: "2026-12-25" }, fromMinute: 60 });
    const next = { ...friday, staffNote: "note" };
    const result = settleStartMinute(friday, next, config(1560), "America/Los_Angeles", TODAY);
    expect(result.fromMinute).toBe(60);
  });
});

describe("a repeat with no date in its range (#8032)", () => {
  // 2026-12-21 is a Monday: no Friday falls in Monday and Tuesday.
  const noFriday = form({
    when: { kind: "repeats", weekdays: [5], from: "2026-12-21", to: "2026-12-22" },
  });

  it("blocks Next and builds no rule, because it would close nothing", () => {
    expect(validateClose(noFriday, TODAY)).toBe("when");
    expect(buildCloseRule(noFriday, "id", TODAY)).toBeNull();
  });
});

describe("shownOnlinePause, for a pause waiting for its time (#8032)", () => {
  const FRIDAY = "2026-11-06";
  const SATURDAY = "2026-11-07";
  const pause = (id: string, window: DateRule["window"]) =>
    ({
      id,
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: FRIDAY,
      endsOn: null,
      window,
    }) as DateRule;
  const fromSix = pause("six", { version: 1, from: 18 * 60, to: 2880 });
  const TZ = "America/Los_Angeles";

  it("still finds it, the morning after and before its first evening", () => {
    const config = fixtureConfig(fromSix);
    expect(shownOnlinePause(config, TZ, SATURDAY, 10 * 60)?.id).toBe("six");
    expect(shownOnlinePause(config, TZ, FRIDAY, 10 * 60)?.id).toBe("six");
  });

  it("prefers a pause in force over one that is waiting", () => {
    const config = fixtureConfig(fromSix, pause("now", null));
    expect(shownOnlinePause(config, TZ, SATURDAY, 10 * 60)?.id).toBe("now");
  });

  it("names the earliest of two waiting pauses, whatever their order", () => {
    const fromEight = pause("eight", { version: 1, from: 20 * 60, to: 2880 });
    expect(shownOnlinePause(fixtureConfig(fromEight, fromSix), TZ, SATURDAY, 10 * 60)?.id).toBe(
      "six"
    );
  });

  describe("isPauseInForce, from the day's online seatings (#8032)", () => {
    // The fixture's only open day, Friday, has lunch and then dinner from 5:00 PM.
    const inForce = (from: number, today: string, minute: number) => {
      const rule = pause("p", { version: 1, from, to: 2880 });
      return isPauseInForce(rule, fixtureConfig(rule), TZ, today, minute);
    };

    it("is not in force while seatings before its time remain", () => {
      expect(inForce(18 * 60, FRIDAY, 10 * 60)).toBe(false);
    });

    it("is in force when its time takes every seating of the day", () => {
      expect(inForce(60, FRIDAY, 30)).toBe(true);
      expect(inForce(10 * 60, FRIDAY, 9 * 60)).toBe(true);
    });

    it("is in force once the last seating before its time has gone", () => {
      expect(inForce(18 * 60, FRIDAY, 17 * 60 + 50)).toBe(true);
    });

    it("is not in force on a day with no service, which it takes nothing from", () => {
      expect(inForce(60, SATURDAY, 30)).toBe(false);
    });

    describe("alongside another closure", () => {
      const beforeLunch = { version: 1, from: 10 * 60, to: 2880 } as const;
      const judged = pause("judged", beforeLunch);
      const inForceWith = (other: DateRule) =>
        isPauseInForce(judged, fixtureConfig(judged, other), TZ, FRIDAY, 9 * 60);

      it("is in force when a second pause takes the same seatings", () => {
        expect(inForceWith(pause("second", beforeLunch))).toBe(true);
      });

      it("is in force when a dated online closure takes the same seatings", () => {
        expect(inForceWith({ ...pause("dated", beforeLunch), endsOn: FRIDAY })).toBe(true);
      });

      it("is not in force when the venue is closed: no pause took those seatings", () => {
        const fromSix = pause("judged", { version: 1, from: 18 * 60, to: 2880 });
        const closed = {
          ...pause("venue", null),
          targetKind: "venue",
          bookingTypes: undefined,
          endsOn: FRIDAY,
          window: undefined,
        } as DateRule;
        const config = fixtureConfig(fromSix, closed);
        expect(isPauseInForce(fromSix, config, TZ, FRIDAY, 10 * 60)).toBe(false);
      });
    });
  });
});

describe("shownOnlinePause", () => {
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
    const config = { ...base, scheduleServices };
    const found = shownOnlinePause(config, TZ, today, minute);
    return found && isPauseInForce(found, config, TZ, today, minute) ? found : null;
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

  it("runs from the first opening to the half hour before the last close", () => {
    // The fixture Friday: Lunch opens 11:30 AM, Dinner closes 11:00 PM.
    const options = startMinutes(fixtureConfig(), TZ, [FRIDAY], null);
    expect(options[0]).toBe(690);
    expect(options.at(-1)).toBe(1350);
    expect(options).toHaveLength(23);
  });

  it("floors the first opening to the half hour", () => {
    const base = fixtureConfig();
    const config = {
      ...base,
      scheduleServices: base.scheduleServices.map((s) => ({ ...s, opensAt: s.opensAt + 10 })),
    };
    expect(startMinutes(config, TZ, [FRIDAY], null)[0]).toBe(690);
  });

  it("offers the whole day on a date with no hours at all", () => {
    const options = startMinutes(fixtureConfig(), TZ, ["2026-12-21"], null);
    expect(options[0]).toBe(0);
    expect(options.at(-1)).toBe(1410);
  });

  describe("with the time now (today)", () => {
    it("starts at the next half hour, never on the half hour it is", () => {
      const at = (now: number) => startMinutes(fixtureConfig(), TZ, [FRIDAY], null, now);
      expect(at(18 * 60)[0]).toBe(18 * 60 + 30);
      expect(at(18 * 60 + 1)[0]).toBe(18 * 60 + 30);
      expect(at(18 * 60 + 29)[0]).toBe(18 * 60 + 30);
      expect(at(18 * 60 + 30)[0]).toBe(19 * 60);
    });

    it("lists 6:30 PM to 10:30 PM at 6:00 PM when Dinner closes at 11:00 PM", () => {
      const options = startMinutes(fixtureConfig(), TZ, [FRIDAY], null, 18 * 60);
      expect(options).toEqual([1110, 1140, 1170, 1200, 1230, 1260, 1290, 1320, 1350]);
    });

    it("does not start before opening when it is earlier than that", () => {
      expect(startMinutes(fixtureConfig(), TZ, [FRIDAY], null, 6 * 60)[0]).toBe(690);
    });

    it("keeps the overnight close: the last option is still the half hour before it", () => {
      expect(startMinutes(late(1560), TZ, [FRIDAY], null, 22 * 60).slice(0, 2)).toEqual([
        1350, 1380,
      ]);
      expect(startMinutes(late(1560), TZ, [FRIDAY], null, 22 * 60).at(-1)).toBe(1530);
    });

    it("ignores the time now, as the dialog passes it only for today alone", () => {
      // The dialog gives no nowMinute when several dates are closed, today among them.
      expect(startMinutes(fixtureConfig(), TZ, ["2026-12-18", FRIDAY], null)[0]).toBe(690);
    });

    it("keeps a held time before opening on a day that does not run past midnight", () => {
      const options = startMinutes(fixtureConfig(), TZ, [FRIDAY], 300);
      expect(options[0]).toBe(300);
      expect(options[1]).toBe(690);
    });

    it("is empty once nothing is left to close from, and still holds a time the form has", () => {
      expect(startMinutes(fixtureConfig(), TZ, [FRIDAY], null, 22 * 60 + 45)).toEqual([]);
      expect(startMinutes(fixtureConfig(), TZ, [FRIDAY], 1200, 22 * 60 + 45)).toEqual([1200]);
    });
  });

  it("continues past midnight to the half hour before a 2:00 AM close", () => {
    const options = startMinutes(late(1560), TZ, [FRIDAY], null);
    expect(options.slice(-5)).toEqual([1410, 1440, 1470, 1500, 1530]);
  });

  it("keeps a start time the form already holds selectable", () => {
    expect(startMinutes(fixtureConfig(), TZ, [FRIDAY], 1500)).toContain(1500);
    expect(startMinutes(fixtureConfig(), TZ, [FRIDAY], 60)).toContain(60);
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

describe("Close on several dates (#7981)", () => {
  const several = (dates: string[], patch: Partial<CloseForm> = {}) =>
    form({ when: { kind: "dates", dates }, ...patch });
  const ids = (date: string) => `id-${date}`;

  it("builds one single-date closure rule per date, in order, sharing what, time and words", () => {
    const rules = buildCloseRules(
      several(["2026-12-24", "2026-12-26"], {
        what: { kind: "service", serviceId: "vs-dinner" },
        fromMinute: 1320,
        staffNote: " Gomez wedding ",
        guestMessage: "Closed for a private event",
      }),
      ids,
      TODAY
    );
    expect(rules).toEqual(
      ["2026-12-24", "2026-12-26"].map((date) => ({
        id: `id-${date}`,
        kind: "closure",
        targetKind: "service",
        venueServiceId: "vs-dinner",
        startsOn: date,
        endsOn: date,
        window: { version: 1, from: 1320, to: 2880 },
        staffNote: "Gomez wedding",
        guestMessage: "Closed for a private event",
      }))
    );
  });

  it("builds the one rule of any other When, and none while the form is incomplete", () => {
    expect(buildCloseRules(form(), () => "r1", TODAY)).toEqual([
      buildCloseRule(form(), "r1", TODAY),
    ]);
    expect(buildCloseRules(several([]), ids, TODAY)).toEqual([]);
  });

  it("is not one rule: buildCloseRule gives none for several dates", () => {
    expect(buildCloseRule(several(["2026-12-24", "2026-12-25"]), "r", TODAY)).toBeNull();
  });

  it("needs at least one date and at most what one command holds", () => {
    expect(validateClose(several([]), TODAY)).toBe("when");
    const dates = (n: number) =>
      Array.from({ length: n }, (_, i) => `2027-01-${String(i + 1).padStart(2, "0")}`);
    expect(validateClose(several(dates(20)), TODAY)).toBeNull();
    expect(validateClose(several(dates(21)), TODAY)).toBe("when");
  });

  it("toggles a date in and out, ascending and without repeats", () => {
    expect(toggleDate(["2026-12-26"], "2026-12-24")).toEqual(["2026-12-24", "2026-12-26"]);
    expect(toggleDate(["2026-12-24", "2026-12-26"], "2026-12-24")).toEqual(["2026-12-26"]);
  });
});

describe("willHaveStepTwo", () => {
  const group = { groupKey: "g" } as ClosureImpactGroup;

  it("is true when bookings are affected or an edit gives dates back", () => {
    expect(willHaveStepTwo([group], undefined)).toBe(true);
    expect(willHaveStepTwo([], { guests: 2 } as never)).toBe(true);
  });

  it("is false when nothing is affected", () => {
    expect(willHaveStepTwo([], undefined)).toBe(false);
  });
});

describe("closeToastText (ux.md F4.7)", () => {
  const locale = "en-US";
  const fmt = {
    formatCalendarDate: (d: string, o: Intl.DateTimeFormatOptions) =>
      formatCalendarDate(d, o, locale),
    formatLocalTime: (hhmm: string) => formatLocalTime(hhmm, locale),
    locale,
  };
  const base = (patch: Partial<CloseForm>): CloseForm =>
    form({ when: { kind: "date", date: "2026-12-24" }, ...patch });
  const text = (
    f: CloseForm,
    extra: {
      outcome?: Partial<ToastOutcome>;
      name?: string;
      count?: number;
      date?: string;
    } = {}
  ) =>
    closeToastText(
      { form: f, date: extra.date ?? "2026-12-24", count: extra.count ?? 1, name: extra.name },
      { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0, ...extra.outcome },
      defaultT,
      fmt
    );

  it("names the whole venue, a service and a section on one date", () => {
    expect(text(base({}))).toBe("Closed on Thu, Dec 24");
    expect(text(base({ what: { kind: "service", serviceId: "s" } }), { name: "Lunch" })).toBe(
      "Lunch closed on Thu, Dec 24"
    );
    expect(text(base({ what: { kind: "section", sectionId: "s" } }), { name: "Bar" })).toBe(
      "Bar closed on Thu, Dec 24"
    );
  });

  it("names the channels a booking-only closure pauses", () => {
    const paused = (types: readonly ("online" | "phone" | "waitlist")[]) =>
      text(base({ what: { kind: "booking", types }, when: { kind: "date", date: "2026-11-08" } }), {
        date: "2026-11-08",
      });
    expect(paused(["phone"])).toBe("Phone booking paused on Sun, Nov 8");
    expect(paused(["online", "phone"])).toBe("Online and phone booking paused on Sun, Nov 8");
    expect(paused(["phone", "online"])).toBe("Online and phone booking paused on Sun, Nov 8");
    expect(paused(["online", "phone", "waitlist"])).toBe("All booking paused on Sun, Nov 8");
    expect(paused(["online"])).toBe("Online booking paused on Sun, Nov 8");
  });

  it("says when it starts: tonight, or on a date", () => {
    expect(
      text(base({ when: { kind: "tonight" }, fromMinute: 1290 }), { date: "2026-11-08" })
    ).toBe("Closed from 9:30 PM tonight");
    expect(
      text(base({ what: { kind: "service", serviceId: "s" }, fromMinute: 780 }), { name: "Lunch" })
    ).toBe("Lunch closed from 1:00 PM on Thu, Dec 24");
    expect(text(base({ fromMinute: 1500 }))).toBe("Closed from 1:00 AM (next day) on Thu, Dec 24");
  });

  it("counts several dates, naming the target first", () => {
    const several = base({
      when: { kind: "dates", dates: ["2026-12-24", "2026-12-25", "2026-12-26"] },
    });
    expect(text(several, { count: 3 })).toBe("3 dates closed");
    expect(
      text({ ...several, what: { kind: "service", serviceId: "s" } }, { count: 3, name: "Lunch" })
    ).toBe("Lunch closed on 3 dates");
    expect(text({ ...several, what: { kind: "booking", types: ["phone"] } }, { count: 3 })).toBe(
      "Booking paused on 3 dates"
    );
  });

  describe("a range, a repeat and until reopened say their dates, for every target", () => {
    const range = { kind: "range", from: "2026-12-24", to: "2027-01-02" } as const;
    const repeats = {
      kind: "repeats",
      weekdays: [1],
      from: "2027-01-01",
      to: "2027-01-31",
    } as const;
    const until = { kind: "until-reopen", from: "2026-11-08" } as const;
    const venue = { kind: "venue" } as const;
    const lunch = { kind: "service", serviceId: "s" } as const;
    const bar = { kind: "section", sectionId: "s" } as const;
    const phone = { kind: "booking", types: ["phone"] } as const;
    const whenOf = {
      range: { when: range, date: "2026-12-24" },
      repeats: { when: repeats, date: "2027-01-04" },
      until: { when: until, date: "2026-11-08" },
    } as const;
    const t = (
      kind: keyof typeof whenOf,
      what: CloseForm["what"],
      fromMinute: number | null = null,
      name?: string
    ) =>
      text(base({ what, when: whenOf[kind].when, fromMinute }), {
        name,
        date: whenOf[kind].date,
      });

    it("all day", () => {
      expect(t("range", venue)).toBe("Closed Thu, Dec 24 – Sat, Jan 2");
      expect(t("range", lunch, null, "Lunch")).toBe("Lunch closed Thu, Dec 24 – Sat, Jan 2");
      expect(t("range", bar, null, "Bar")).toBe("Bar closed Thu, Dec 24 – Sat, Jan 2");
      expect(t("range", phone)).toBe("Phone booking paused Thu, Dec 24 – Sat, Jan 2");
      expect(t("repeats", venue)).toBe("Closed every Monday, Mon, Jan 4 – Mon, Jan 25");
      expect(t("repeats", lunch, null, "Lunch")).toBe(
        "Lunch closed every Monday, Mon, Jan 4 – Mon, Jan 25"
      );
      expect(t("repeats", phone)).toBe(
        "Phone booking paused every Monday, Mon, Jan 4 – Mon, Jan 25"
      );
      expect(t("until", venue)).toBe("Closed from Sun, Nov 8 until you reopen");
      expect(t("until", bar, null, "Bar")).toBe("Bar closed from Sun, Nov 8 until you reopen");
      expect(t("until", phone)).toBe("Phone booking paused from Sun, Nov 8 until you reopen");
    });

    it("keeps the pause entry's own sentence", () => {
      expect(t("until", { kind: "booking", types: ["online"] })).toBe("Online booking paused");
    });

    it("keeps the start time", () => {
      expect(t("range", venue, 780)).toBe("Closed from 1:00 PM on Thu, Dec 24 – Sat, Jan 2");
      expect(t("range", lunch, 780, "Lunch")).toBe(
        "Lunch closed from 1:00 PM on Thu, Dec 24 – Sat, Jan 2"
      );
      expect(t("repeats", bar, 780, "Bar")).toBe(
        "Bar closed from 1:00 PM every Monday, Mon, Jan 4 – Mon, Jan 25"
      );
      expect(t("until", venue, 780)).toBe("Closed from 1:00 PM on Sun, Nov 8 until you reopen");
      expect(t("until", phone, 780)).toBe(
        "Phone booking paused from 1:00 PM on Sun, Nov 8 until you reopen"
      );
    });

    it("names several weekdays as a summary and keeps the notified count", () => {
      const days = { ...repeats, weekdays: [1, 2, 3, 5] };
      expect(text(base({ when: days }), { date: "2027-01-04", outcome: { cancel: 2 } })).toBe(
        "Closed every Mon–Wed and Fri, Mon, Jan 4 – Fri, Jan 29 · 2 bookings cancelled and notified"
      );
    });
  });

  it("says a repeat with one occurrence as that date", () => {
    const once = { kind: "repeats", weekdays: [5], from: "2026-12-21", to: "2026-12-31" } as const;
    expect(text(base({ when: once }), { date: "2026-12-25" })).toBe("Closed on Fri, Dec 25");
  });

  it("keeps the time on a booking-only closure, tonight or on a date", () => {
    const phone = { kind: "booking", types: ["phone"] } as const;
    expect(
      text(base({ what: phone, when: { kind: "tonight" }, fromMinute: 1110 }), {
        date: "2026-11-08",
      })
    ).toBe("Phone booking paused from 6:30 PM tonight");
    expect(text(base({ what: phone, fromMinute: 1110 }))).toBe(
      "Phone booking paused from 6:30 PM on Thu, Dec 24"
    );
  });

  it("says what became of the bookings: cancelled, moved or kept (#8689)", () => {
    expect(text(base({}), { outcome: { cancel: 14 } })).toBe(
      "Closed on Thu, Dec 24 · 14 bookings cancelled and notified"
    );
    expect(text(base({}), { outcome: { cancel: 1 } })).toBe(
      "Closed on Thu, Dec 24 · 1 booking cancelled and notified"
    );
    expect(
      text(base({ what: { kind: "service", serviceId: "s" } }), {
        name: "Lunch",
        outcome: { move: 2 },
      })
    ).toBe("Lunch closed on Thu, Dec 24 · 2 bookings moved and notified");
    expect(
      text(base({}), { outcome: { cancel: 3, move: 2, keep_notify: 1, keep_silent: 4 } })
    ).toBe(
      "Closed on Thu, Dec 24 · 3 bookings cancelled and notified · 2 bookings moved and notified · 1 booking kept, guest notified · 4 bookings kept, guests not told"
    );
  });
});

describe("closeButtonText (ux.md S-Close, R4, R6)", () => {
  const locale = "en-US";
  const fmt = {
    formatCalendarDate: (d: string, o: Intl.DateTimeFormatOptions) =>
      formatCalendarDate(d, o, locale),
    formatLocalTime: (hhmm: string) => formatLocalTime(hhmm, locale),
    locale,
  };
  const label = (patch: Partial<CloseForm>, name?: string, date = "2026-12-24") =>
    closeButtonText({ form: form(patch), date, name }, defaultT, fmt);
  const lunch = { kind: "service", serviceId: "s" } as const;
  const tonight = { kind: "tonight" } as const;

  it("keeps Close with the date for the venue with no start time", () => {
    expect(label({})).toBe("Close Thu, Dec 24");
  });

  it("names a service or section", () => {
    expect(label({ what: lunch }, "Lunch")).toBe("Close Lunch on Thu, Dec 24");
    expect(label({ what: { kind: "section", sectionId: "x" } }, "Bar")).toBe(
      "Close Bar on Thu, Dec 24"
    );
  });

  it("names the start time: tonight, or on a date", () => {
    expect(label({ when: tonight, fromMinute: 1290 })).toBe("Close from 9:30 PM tonight");
    expect(label({ fromMinute: 780 })).toBe("Close from 1:00 PM on Thu, Dec 24");
    expect(label({ what: lunch, fromMinute: 780 }, "Lunch")).toBe(
      "Close Lunch from 1:00 PM on Thu, Dec 24"
    );
    expect(label({ what: lunch, when: tonight, fromMinute: 1290 }, "Lunch")).toBe(
      "Close Lunch from 9:30 PM tonight"
    );
  });

  describe("a range, a repeat and until reopened say their dates", () => {
    const range = { kind: "range", from: "2026-12-24", to: "2027-01-02" } as const;
    const repeats = {
      kind: "repeats",
      weekdays: [1],
      from: "2027-01-01",
      to: "2027-01-31",
    } as const;
    const until = { kind: "until-reopen", from: "2026-11-08" } as const;

    it("without a start time", () => {
      expect(label({ when: range })).toBe("Close Thu, Dec 24 – Sat, Jan 2");
      expect(label({ what: lunch, when: range }, "Lunch")).toBe(
        "Close Lunch Thu, Dec 24 – Sat, Jan 2"
      );
      expect(label({ when: repeats }, undefined, "2027-01-04")).toBe(
        "Close every Monday, Mon, Jan 4 – Mon, Jan 25"
      );
      expect(label({ what: lunch, when: repeats }, "Lunch", "2027-01-04")).toBe(
        "Close Lunch every Monday, Mon, Jan 4 – Mon, Jan 25"
      );
      expect(label({ when: until }, undefined, "2026-11-08")).toBe(
        "Close from Sun, Nov 8 until you reopen"
      );
      expect(label({ what: lunch, when: until }, "Lunch", "2026-11-08")).toBe(
        "Close Lunch from Sun, Nov 8 until you reopen"
      );
    });

    it("with a start time", () => {
      expect(label({ when: range, fromMinute: 780 })).toBe(
        "Close from 1:00 PM on Thu, Dec 24 – Sat, Jan 2"
      );
      expect(label({ what: lunch, when: range, fromMinute: 780 }, "Lunch")).toBe(
        "Close Lunch from 1:00 PM on Thu, Dec 24 – Sat, Jan 2"
      );
      expect(label({ when: repeats, fromMinute: 780 }, undefined, "2027-01-04")).toBe(
        "Close from 1:00 PM every Monday, Mon, Jan 4 – Mon, Jan 25"
      );
      expect(label({ when: until, fromMinute: 780 }, undefined, "2026-11-08")).toBe(
        "Close from 1:00 PM on Sun, Nov 8 until you reopen"
      );
    });
  });
});

describe("a closure that is not one yet says what is missing (#8689)", () => {
  const locale = "en-US";
  const fmt = {
    formatCalendarDate: (d: string, o: Intl.DateTimeFormatOptions) =>
      formatCalendarDate(d, o, locale),
    formatLocalTime: (hhmm: string) => formatLocalTime(hhmm, locale),
    locale,
  };
  const whats: readonly CloseForm["what"][] = [
    { kind: "venue" },
    { kind: "service", serviceId: "s" },
    { kind: "section", sectionId: "sec" },
    { kind: "booking", types: ["online"] },
  ];
  /** Every When with its fields empty or half filled, and what the primary should ask for. */
  const incomplete: readonly (readonly [CloseForm["when"], string])[] = [
    [{ kind: "date", date: "" }, "Choose a date"],
    [{ kind: "dates", dates: [] }, "Choose dates"],
    [{ kind: "until-reopen", from: "" }, "Choose a date"],
    [{ kind: "range", from: "", to: "" }, "Choose a date"],
    [{ kind: "range", from: "2026-12-24", to: "" }, "Choose an end date"],
    [{ kind: "repeats", weekdays: [], from: "", to: "" }, "Choose a date"],
    [{ kind: "repeats", weekdays: [], from: "2026-12-24", to: "" }, "Choose days and an end date"],
    [{ kind: "repeats", weekdays: [], from: "2026-12-24", to: "2027-01-31" }, "Choose days"],
    [{ kind: "repeats", weekdays: [1], from: "2026-12-24", to: "" }, "Choose an end date"],
    // Thursday to Saturday holds no Monday: nothing would close.
    [{ kind: "repeats", weekdays: [1], from: "2026-12-24", to: "2026-12-26" }, "Choose days"],
  ];

  for (const what of whats) {
    for (const [when, expected] of incomplete) {
      for (const fromMinute of [null, 1290]) {
        it(`${what.kind} / ${when.kind} ${JSON.stringify(when)} from ${fromMinute}: "${expected}"`, () => {
          const f = form({ what, when, fromMinute });
          const label = closeButtonText(
            { form: f, date: "", name: what.kind === "venue" ? undefined : "Name" },
            defaultT,
            fmt
          );
          expect(label).toBe(expected);
          expect(label).not.toContain("Invalid Date");
          expect(label).not.toContain("every ,");
          expect(closeIncompleteText(f, defaultT)).toBe(expected);
        });
      }
    }
  }

  it("is silent once the dates are complete", () => {
    for (const when of [
      { kind: "tonight" },
      { kind: "date", date: "2026-12-24" },
      { kind: "dates", dates: ["2026-12-24"] },
      { kind: "range", from: "2026-12-24", to: "2026-12-26" },
      { kind: "repeats", weekdays: [4], from: "2026-12-24", to: "2026-12-31" },
      { kind: "until-reopen", from: "2026-12-24" },
    ] as const) {
      expect(closeIncompleteText(form({ when }), defaultT)).toBeNull();
    }
  });
});
