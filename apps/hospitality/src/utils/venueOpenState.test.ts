import { describe, it, expect } from "vitest";
import type { DaySchedule, OperatingHours } from "@mbe/types";
import { hasOperatingHours } from "../components/booking-widget/hasOperatingHours.js";
import { deriveVenueOpenState, type DeriveVenueOpenStateInput } from "./venueOpenState.js";

const LA = "America/Los_Angeles";

/**
 * UTC instant for a Pacific Daylight Time wall-clock (UTC−7, in force from
 * 2026-03-08 to 2026-11-01). Sun 2026-08-30 … Sat 2026-09-05 is the fixture week;
 * 2026-08-31 is a Monday.
 */
const pdt = (local: string): Date => new Date(`${local}:00-07:00`);

const MON_10 = pdt("2026-08-31T10:00");
const MON_12 = pdt("2026-08-31T12:00");

const MON_EVENING: DaySchedule = { open: "17:00", close: "22:00" };
const FRI_OVERNIGHT: DaySchedule = { open: "18:00", close: "02:00" };

function derive(
  operatingHours: OperatingHours | null | undefined,
  now: Date,
  overrides: Partial<Omit<DeriveVenueOpenStateInput, "operatingHours" | "now">> = {}
) {
  return deriveVenueOpenState({ operatingHours, ianaTimezone: LA, now, ...overrides });
}

describe("deriveVenueOpenState", () => {
  describe("unset", () => {
    const unsetFixtures: ReadonlyArray<[string, OperatingHours | null | undefined]> = [
      ["null", null],
      ["undefined", undefined],
      ["an empty object", {}],
      [
        "every configured day closed",
        {
          monday: { open: "09:00", close: "22:00", closed: true },
          tuesday: { open: "09:00", close: "22:00", closed: true },
        },
      ],
    ];

    it.each(unsetFixtures)("is unset for %s, agreeing with hasOperatingHours", (_, hours) => {
      expect(hasOperatingHours(hours)).toBe(false);
      expect(derive(hours, MON_12)).toEqual({ state: "unset" });
    });

    it("is unset when the only non-closed days are malformed (diverging from hasOperatingHours)", () => {
      const hours: OperatingHours = { monday: { open: "9am", close: "22:00" } };
      expect(hasOperatingHours(hours)).toBe(true);
      expect(derive(hours, MON_12)).toEqual({ state: "unset" });
    });
  });

  describe("open", () => {
    const monday: OperatingHours = { monday: { open: "11:00", close: "22:00" } };

    it("is open mid-window with the closing time", () => {
      expect(derive(monday, MON_12)).toEqual({ state: "open", closesAt: "22:00" });
    });

    it("treats the window as half-open [open, close)", () => {
      expect(derive(monday, pdt("2026-08-31T11:00"))).toEqual({ state: "open", closesAt: "22:00" });
      expect(derive(monday, pdt("2026-08-31T22:00"))?.state).not.toBe("open");
    });

    const spillFixtures: ReadonlyArray<[string, OperatingHours]> = [
      [
        "closed",
        { friday: FRI_OVERNIGHT, saturday: { open: "09:00", close: "17:00", closed: true } },
      ],
      ["missing", { friday: FRI_OVERNIGHT }],
    ];

    it.each(spillFixtures)(
      "spills Friday's overnight window into Saturday 01:00 when Saturday is %s",
      (_, hours) => {
        expect(derive(hours, pdt("2026-09-05T01:00"))).toEqual({
          state: "open",
          closesAt: "02:00",
        });
      }
    );

    it("is not open once the overnight spill has closed", () => {
      expect(derive({ friday: FRI_OVERNIGHT }, pdt("2026-09-05T03:00"))?.state).not.toBe("open");
    });

    it("is open on the evening side of an overnight window", () => {
      expect(derive({ friday: FRI_OVERNIGHT }, pdt("2026-09-04T23:30"))).toEqual({
        state: "open",
        closesAt: "02:00",
      });
    });

    it("lets today's window win when it overlaps yesterday's overnight spill", () => {
      const hours: OperatingHours = {
        friday: FRI_OVERNIGHT,
        saturday: { open: "01:00", close: "10:00" },
      };
      expect(derive(hours, pdt("2026-09-05T01:30"))).toEqual({ state: "open", closesAt: "10:00" });
    });
  });

  describe("closed", () => {
    it("opens later today", () => {
      expect(derive({ monday: MON_EVENING }, MON_10)).toEqual({
        state: "closed",
        opensAt: "17:00",
        opensOn: null,
      });
    });

    it("skips a day marked closed", () => {
      const hours: OperatingHours = {
        monday: { open: "17:00", close: "22:00", closed: true },
        tuesday: MON_EVENING,
      };
      expect(derive(hours, MON_10)).toEqual({
        state: "closed",
        opensAt: "17:00",
        opensOn: "tuesday",
      });
    });

    it("skips missing days", () => {
      expect(derive({ friday: { open: "17:00", close: "23:00" } }, MON_10)).toEqual({
        state: "closed",
        opensAt: "17:00",
        opensOn: "friday",
      });
    });

    it("wraps to the same weekday next week", () => {
      expect(derive({ monday: MON_EVENING }, pdt("2026-08-31T23:00"))).toEqual({
        state: "closed",
        opensAt: "17:00",
        opensOn: "monday",
      });
    });
  });

  describe("opening-soon", () => {
    const leadFixtures: ReadonlyArray<[string, number, string]> = [
      ["16:01", 59, "opening-soon"],
      ["16:00", 60, "opening-soon"],
      ["15:59", 61, "closed"],
    ];

    it.each(leadFixtures)("at %s (%i minutes before a 17:00 opening) is %s", (time, _, state) => {
      expect(derive({ monday: MON_EVENING }, pdt(`2026-08-31T${time}`))).toMatchObject({
        state,
        opensAt: "17:00",
      });
    });

    it("counts the lead across midnight", () => {
      const hours: OperatingHours = { tuesday: { open: "00:30", close: "02:00" } };
      expect(derive(hours, pdt("2026-08-31T23:45"))).toEqual({
        state: "opening-soon",
        opensAt: "00:30",
      });
    });

    it("honours a shorter openingSoonMinutes", () => {
      expect(
        derive({ monday: MON_EVENING }, pdt("2026-08-31T16:01"), { openingSoonMinutes: 30 })
      ).toEqual({ state: "closed", opensAt: "17:00", opensOn: null });
    });
  });

  describe("time zone", () => {
    // Sun 17:30 PDT in Los Angeles; Mon 01:30 BST in London.
    const now = new Date("2026-08-31T00:30:00Z");
    const hours: OperatingHours = { sunday: MON_EVENING };

    it("reads the venue zone, not the machine zone", () => {
      expect(derive(hours, now, { ianaTimezone: "America/Los_Angeles" })).toEqual({
        state: "open",
        closesAt: "22:00",
      });
      expect(derive(hours, now, { ianaTimezone: "Europe/London" })).toEqual({
        state: "closed",
        opensAt: "17:00",
        opensOn: "sunday",
      });
    });

    it.each([["Mars/Olympus"], [""], [undefined], [null]])(
      "returns null without throwing for the unusable zone %j",
      (ianaTimezone) => {
        expect(() => derive(hours, now, { ianaTimezone })).not.toThrow();
        expect(derive(hours, now, { ianaTimezone })).toBeNull();
      }
    );
  });

  describe("malformed days", () => {
    const malformedFixtures: ReadonlyArray<[string, DaySchedule]> = [
      ["hour 25", { open: "25:00", close: "22:00" }],
      ["12-hour text", { open: "9am", close: "22:00" }],
      ["unpadded digits", { open: "7:5", close: "22:00" }],
      ["a malformed close", { open: "11:00", close: "9pm" }],
      ["open equal to close", { open: "17:00", close: "17:00" }],
    ];

    it.each(malformedFixtures)("skips a Monday with %s and names Tuesday", (_, monday) => {
      expect(derive({ monday, tuesday: MON_EVENING }, MON_10)).toEqual({
        state: "closed",
        opensAt: "17:00",
        opensOn: "tuesday",
      });
    });
  });

  describe("DST", () => {
    describe("spring-forward (2026-03-08, 02:00 PST → 03:00 PDT)", () => {
      const instants: ReadonlyArray<[string, Date]> = [
        ["01:30 PST", new Date("2026-03-08T09:30:00Z")],
        ["03:30 PDT", new Date("2026-03-08T10:30:00Z")],
      ];

      it.each(instants)("is closed until 09:00 at %s", (_, now) => {
        expect(derive({ sunday: { open: "09:00", close: "17:00" } }, now)).toEqual({
          state: "closed",
          opensAt: "09:00",
          opensOn: null,
        });
      });

      it.each(instants)("is open inside a 01:00–05:00 window at %s", (_, now) => {
        expect(derive({ sunday: { open: "01:00", close: "05:00" } }, now)).toEqual({
          state: "open",
          closesAt: "05:00",
        });
      });
    });

    describe("fall-back (2026-11-01, 02:00 PDT → 01:00 PST)", () => {
      const instants: ReadonlyArray<[string, Date]> = [
        ["01:30 PDT", new Date("2026-11-01T08:30:00Z")],
        ["01:30 PST", new Date("2026-11-01T09:30:00Z")],
      ];

      it.each(instants)("is closed until 10:00 at %s", (_, now) => {
        expect(derive({ sunday: { open: "10:00", close: "22:00" } }, now)).toEqual({
          state: "closed",
          opensAt: "10:00",
          opensOn: null,
        });
      });
    });
  });

  it("does not mutate the input hours", () => {
    const hours: OperatingHours = Object.freeze({
      monday: Object.freeze({ open: "11:00", close: "22:00" }),
    });
    const before = JSON.parse(JSON.stringify(hours)) as OperatingHours;
    expect(() => derive(hours, MON_12)).not.toThrow();
    expect(hours).toEqual(before);
  });
});
