import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import {
  blockedTableIds,
  bookingMinuteOnServiceDay,
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

describe("bookingMinuteOnServiceDay", () => {
  it("reads the time on the service day itself", () => {
    expect(bookingMinuteOnServiceDay("2026-10-23", "2026-10-23", "19:30")).toBe(1170);
  });

  it("reads an after-midnight time on the next calendar date as the same service day", () => {
    expect(bookingMinuteOnServiceDay("2026-10-23", "2026-10-24", "00:30")).toBe(1470);
  });

  it("is null for any other date", () => {
    expect(bookingMinuteOnServiceDay("2026-10-23", "2026-10-25", "19:30")).toBeNull();
    expect(bookingMinuteOnServiceDay("2026-10-23", "2026-10-22", "19:30")).toBeNull();
  });

  it("is null for an unreadable time", () => {
    expect(bookingMinuteOnServiceDay("2026-10-23", "2026-10-23", "")).toBeNull();
  });
});

describe("blockedTableIds", () => {
  it("lists the tables of a Tonight block that covers the booking", () => {
    const ids = blockedTableIds([block({})], "2026-10-23", 1170, 90);
    expect([...ids].sort()).toEqual(["t1", "t2"]);
  });

  it("ignores a block for another service day", () => {
    expect(blockedTableIds([block({ startsOn: "2026-10-24" })], "2026-10-23", 1170, 90).size).toBe(
      0
    );
  });

  it("ignores a block whose window ends before the booking starts", () => {
    const rule = block({ stop: { from: 0, to: 1000 } });
    expect(blockedTableIds([rule], "2026-10-23", 1170, 90).size).toBe(0);
  });

  it("counts a block that begins during the booking", () => {
    const rule = block({ stop: { from: 1200, to: 1300 } });
    expect(blockedTableIds([rule], "2026-10-23", 1170, 90).size).toBe(2);
  });

  it("ignores rules that are not table blocks", () => {
    const pause = block({ targetKind: "venue", tableIds: null });
    expect(blockedTableIds([pause], "2026-10-23", 1170, 90).size).toBe(0);
  });

  it("is empty when the booking is not on the service day", () => {
    expect(blockedTableIds([block({})], "2026-10-23", null, 90).size).toBe(0);
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
});
