import { describe, expect, it } from "vitest";
import { localDateTimeOf, serviceDayInstant } from "./instant.js";
import { addDays } from "./civil-date.js";

const hm = (h: number, m = 0) => h * 60 + m;
const NEXT = 1440;

type Case = [tz: string, date: string, minute: number, iso: string | null];

const CASES: Case[] = [
  // UTC
  ["UTC", "2026-06-05", hm(17, 30), "2026-06-05T17:30:00.000Z"],
  ["UTC", "2026-06-05", NEXT + hm(0, 30), "2026-06-06T00:30:00.000Z"],
  // Los Angeles (PDT, -07:00): an evening slot whose UTC date is the next day
  ["America/Los_Angeles", "2026-06-05", hm(19), "2026-06-06T02:00:00.000Z"],
  ["America/Los_Angeles", "2026-06-05", NEXT, "2026-06-06T07:00:00.000Z"],
  // Kolkata (+05:30)
  ["Asia/Kolkata", "2026-06-05", hm(18, 30), "2026-06-05T13:00:00.000Z"],
  ["Asia/Kolkata", "2026-06-05", hm(1), "2026-06-04T19:30:00.000Z"],
  // New York spring forward 2026-03-08: Saturday 16:00–03:00 window
  ["America/New_York", "2026-03-07", hm(16), "2026-03-07T21:00:00.000Z"],
  ["America/New_York", "2026-03-07", NEXT + hm(1, 45), "2026-03-08T06:45:00.000Z"],
  ["America/New_York", "2026-03-07", NEXT + hm(2), null],
  ["America/New_York", "2026-03-07", NEXT + hm(2, 15), null],
  ["America/New_York", "2026-03-07", NEXT + hm(2, 30), null],
  ["America/New_York", "2026-03-07", NEXT + hm(2, 45), null],
  ["America/New_York", "2026-03-07", NEXT + hm(3), "2026-03-08T07:00:00.000Z"],
  // New York fall back 2026-11-01: 01:xx resolves to the first (EDT) occurrence
  ["America/New_York", "2026-10-31", NEXT + hm(0, 45), "2026-11-01T04:45:00.000Z"],
  ["America/New_York", "2026-10-31", NEXT + hm(1), "2026-11-01T05:00:00.000Z"],
  ["America/New_York", "2026-10-31", NEXT + hm(1, 30), "2026-11-01T05:30:00.000Z"],
  ["America/New_York", "2026-10-31", NEXT + hm(1, 45), "2026-11-01T05:45:00.000Z"],
  ["America/New_York", "2026-10-31", NEXT + hm(2), "2026-11-01T07:00:00.000Z"],
  // London spring forward 2026-03-29 (01:00 GMT → 02:00 BST)
  ["Europe/London", "2026-03-29", hm(0, 30), "2026-03-29T00:30:00.000Z"],
  ["Europe/London", "2026-03-29", hm(1, 30), null],
  ["Europe/London", "2026-03-29", hm(2), "2026-03-29T01:00:00.000Z"],
  // London fall back 2026-10-25 (02:00 BST → 01:00 GMT): first occurrence is BST
  ["Europe/London", "2026-10-25", hm(1), "2026-10-25T00:00:00.000Z"],
  ["Europe/London", "2026-10-25", hm(1, 30), "2026-10-25T00:30:00.000Z"],
  ["Europe/London", "2026-10-25", hm(2), "2026-10-25T02:00:00.000Z"],
];

describe("serviceDayInstant", () => {
  it.each(CASES)("%s %s minute %i → %s", (tz, date, minute, iso) => {
    const instant = serviceDayInstant(date, minute, tz);
    expect(instant === null ? null : instant.toISOString()).toBe(iso);
  });

  it("offers each fall-back wall time once (no duplicate instants across the night)", () => {
    const instants = [];
    for (let m = NEXT; m <= NEXT + hm(3); m += 15) {
      const instant = serviceDayInstant("2026-10-31", m, "America/New_York");
      if (instant) instants.push(instant.getTime());
    }
    expect(new Set(instants).size).toBe(instants.length);
    expect(instants).toEqual([...instants].sort((a, b) => a - b));
  });
});

describe("localDateTimeOf", () => {
  it("reads the venue-local civil date and minute of an instant", () => {
    expect(localDateTimeOf(new Date("2026-06-06T02:00:00Z"), "America/Los_Angeles")).toEqual({
      date: "2026-06-05",
      minute: hm(19),
    });
    expect(localDateTimeOf(new Date("2026-06-05T20:00:00Z"), "Asia/Kolkata")).toEqual({
      date: "2026-06-06",
      minute: hm(1, 30),
    });
    expect(localDateTimeOf(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toEqual({
      date: "2026-11-01",
      minute: hm(1, 30),
    });
    expect(localDateTimeOf(new Date("2026-06-05T00:00:00Z"), "UTC")).toEqual({
      date: "2026-06-05",
      minute: 0,
    });
  });

  it.each(CASES.filter(([, , , iso]) => iso !== null))(
    "round-trips %s %s minute %i",
    (tz, date, minute) => {
      const instant = serviceDayInstant(date, minute, tz);
      expect(instant).not.toBeNull();
      expect(localDateTimeOf(instant as Date, tz)).toEqual({
        date: addDays(date, Math.floor(minute / 1440)),
        minute: minute % 1440,
      });
    }
  );
});
