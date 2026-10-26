import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import { DINNER_CONFIG, DINNER_TZ } from "./dinner-config.fixture.js";
import {
  blockedTableIds,
  bookingMinuteOnServiceDay,
  isTonightOnlyWaitlistClosure,
  waitlistClosingRule,
} from "./tonight-blocks.js";

const block = (over: Partial<DateRule> & { stop?: { from: number; to: number } }): DateRule =>
  ({
    id: "r1",
    kind: "tonight",
    targetKind: "tables",
    tableIds: ["t1", "t2"],
    startsOn: "2026-10-23",
    payload: { version: 1, stop: over.stop ?? { from: 0, to: 2880 } },
    ...over,
  }) as DateRule;

// 2026-10-22 is a Thursday, 2026-10-23 a Friday; service runs 17:00 to 02:00.
const minuteOn = (serviceDate: string, date: string, time: string) =>
  bookingMinuteOnServiceDay(DINNER_CONFIG, DINNER_TZ, serviceDate, date, time);

describe("bookingMinuteOnServiceDay", () => {
  it("reads the time on the service day itself", () => {
    expect(minuteOn("2026-10-23", "2026-10-23", "19:30")).toBe(1170);
  });

  it("reads an after-midnight time as the previous day's service while it still runs", () => {
    expect(minuteOn("2026-10-22", "2026-10-23", "00:30")).toBe(1470);
    expect(minuteOn("2026-10-23", "2026-10-23", "00:30")).toBeNull();
  });

  it("gives an evening time on the next date to that date, not to tonight", () => {
    expect(minuteOn("2026-10-22", "2026-10-23", "19:00")).toBeNull();
    expect(minuteOn("2026-10-23", "2026-10-23", "19:00")).toBe(1140);
  });

  it("is null for a time outside any service", () => {
    expect(minuteOn("2026-10-23", "2026-10-23", "10:00")).toBeNull();
  });

  it("is null for an unreadable time", () => {
    expect(minuteOn("2026-10-23", "2026-10-23", "")).toBeNull();
  });
});

describe("blockedTableIds", () => {
  it("lists the tables of a Tonight block that covers the booking start", () => {
    const ids = blockedTableIds([block({})], "2026-10-23", 1170);
    expect([...ids].sort()).toEqual(["t1", "t2"]);
  });

  it("ignores a block for another service day", () => {
    expect(blockedTableIds([block({ startsOn: "2026-10-24" })], "2026-10-23", 1170).size).toBe(0);
  });

  it("ignores a block whose window ended before the booking starts", () => {
    const rule = block({ stop: { from: 0, to: 1000 } });
    expect(blockedTableIds([rule], "2026-10-23", 1170).size).toBe(0);
  });

  it("does not count a block that begins only after the booking starts", () => {
    const rule = block({ stop: { from: 1200, to: 1300 } });
    expect(blockedTableIds([rule], "2026-10-23", 1170).size).toBe(0);
  });

  it("includes the window's first minute and excludes its end", () => {
    const rule = block({ stop: { from: 1170, to: 1300 } });
    expect(blockedTableIds([rule], "2026-10-23", 1170).size).toBe(2);
    expect(blockedTableIds([rule], "2026-10-23", 1300).size).toBe(0);
  });

  it("ignores rules that are not table blocks", () => {
    const pause = block({ targetKind: "venue", tableIds: null });
    expect(blockedTableIds([pause], "2026-10-23", 1170).size).toBe(0);
  });

  it("is empty when the booking is not on the service day", () => {
    expect(blockedTableIds([block({})], "2026-10-23", null).size).toBe(0);
  });
});

describe("waitlistClosingRule", () => {
  const closure = (over: Record<string, unknown>): DateRule =>
    ({
      id: "c1",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["waitlist"],
      startsOn: "2026-10-23",
      staffNote: "kitchen backed up",
      ...over,
    }) as DateRule;

  it("finds a waitlist closure in force on the service day", () => {
    expect(waitlistClosingRule([closure({})], "2026-10-23")?.id).toBe("c1");
  });

  it("finds an open-ended closure that began earlier", () => {
    expect(waitlistClosingRule([closure({ startsOn: "2026-10-01" })], "2026-10-23")?.id).toBe("c1");
  });

  it("skips one that has ended, has not begun, or closes other channels", () => {
    expect(waitlistClosingRule([closure({ endsOn: "2026-10-22" })], "2026-10-23")).toBeNull();
    expect(waitlistClosingRule([closure({ startsOn: "2026-10-24" })], "2026-10-23")).toBeNull();
    expect(waitlistClosingRule([closure({ bookingTypes: ["online"] })], "2026-10-23")).toBeNull();
  });

  it("skips a repeating closure on a weekday it does not repeat on", () => {
    // Mondays only; 2026-10-23 is a Friday.
    const mondays = closure({ startsOn: "2026-10-01", repeat: { version: 1, weekdays: [1] } });
    expect(waitlistClosingRule([mondays], "2026-10-23")).toBeNull();
    expect(waitlistClosingRule([mondays], "2026-10-26")?.id).toBe("c1");
  });

  it("skips a series on a date a skip row takes it out", () => {
    const series = closure({ startsOn: "2026-10-01", repeat: { version: 1, weekdays: [5] } });
    const skip = {
      id: "sk",
      kind: "skip",
      targetKind: "venue",
      startsOn: "2026-10-23",
      seriesId: "c1",
    };
    expect(waitlistClosingRule([series, skip as DateRule], "2026-10-23")).toBeNull();
    expect(waitlistClosingRule([series, skip as DateRule], "2026-10-30")?.id).toBe("c1");
  });

  it("skips a closure that covers only a window of the night", () => {
    const windowed = closure({ window: { version: 1, from: 1200, to: 1300 } });
    expect(waitlistClosingRule([windowed], "2026-10-23")).toBeNull();
  });
});

describe("isTonightOnlyWaitlistClosure", () => {
  const closure = (over: Record<string, unknown>): DateRule =>
    ({
      id: "c1",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["waitlist"],
      startsOn: "2026-10-23",
      endsOn: "2026-10-23",
      ...over,
    }) as DateRule;

  it("accepts a waitlist-only closure on a single date", () => {
    expect(isTonightOnlyWaitlistClosure(closure({}))).toBe(true);
  });

  it("rejects other channels, open-ended, ranged and repeating closures", () => {
    expect(isTonightOnlyWaitlistClosure(closure({ bookingTypes: ["waitlist", "online"] }))).toBe(
      false
    );
    expect(isTonightOnlyWaitlistClosure(closure({ endsOn: null }))).toBe(false);
    expect(isTonightOnlyWaitlistClosure(closure({ endsOn: "2026-10-24" }))).toBe(false);
    expect(isTonightOnlyWaitlistClosure(closure({ repeat: { version: 1, weekdays: [5] } }))).toBe(
      false
    );
  });
});
