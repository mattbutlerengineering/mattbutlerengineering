import { describe, expect, it } from "vitest";
import { GUIDE_EXAMPLES, runGuideCheck, type GuideExample } from "./availability-guide-examples.js";

const PM = (hour: number) => (hour + 12) * 60;

function example(id: string): GuideExample {
  const found = GUIDE_EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`no guide example ${id}`);
  return found;
}

/** Runs a named check of an example through the engine and reads back the offered times. */
function outcome(exampleId: string, checkId: string) {
  const ex = example(exampleId);
  const check = ex.checks.find((c) => c.id === checkId);
  if (!check) throw new Error(`no check ${checkId} in ${exampleId}`);
  return runGuideCheck(ex, check);
}

const bookable = (minutes: readonly number[]) =>
  minutes.map((minute) => ({ minute, available: true }));

describe("the guide's worked examples run through @mbe/availability", () => {
  it("offers exactly five examples with an id apiece", () => {
    expect(GUIDE_EXAMPLES.map((e) => e.id)).toEqual([
      "seasonalAndSpecial",
      "closureBeatsSpecial",
      "pauseVersusClosure",
      "sectionClosed",
      "pacing",
    ]);
  });

  describe("seasonalAndSpecial", () => {
    it("uses Regular hours outside the seasonal dates", () => {
      expect(outcome("seasonalAndSpecial", "beforeSeason").offered).toEqual(
        bookable([PM(5), PM(6), PM(7), PM(8)])
      );
    });

    it("uses Seasonal hours on a date they cover", () => {
      expect(outcome("seasonalAndSpecial", "inSeason").offered).toEqual(
        bookable([PM(4), PM(5), PM(6), PM(7), PM(8)])
      );
    });

    it("lets the special date's Special hours replace the seasonal hours", () => {
      expect(outcome("seasonalAndSpecial", "specialDate").offered).toEqual(
        bookable([PM(4), PM(5)])
      );
    });
  });

  describe("closureBeatsSpecial", () => {
    it("offers nothing on the special date, online or by phone", () => {
      expect(outcome("closureBeatsSpecial", "online").offered).toEqual([]);
      expect(outcome("closureBeatsSpecial", "phone").offered).toEqual([]);
    });
  });

  describe("pauseVersusClosure", () => {
    it("a pause stops online booking but leaves phone booking on", () => {
      expect(outcome("pauseVersusClosure", "pausedOnline").offered).toEqual([]);
      expect(outcome("pauseVersusClosure", "pausedPhone").offered).toEqual(
        bookable([PM(5), PM(6), PM(7), PM(8)])
      );
    });

    it("a closure of the venue takes every channel", () => {
      expect(outcome("pauseVersusClosure", "closedOnline").offered).toEqual([]);
      expect(outcome("pauseVersusClosure", "closedPhone").offered).toEqual([]);
    });
  });

  describe("sectionClosed", () => {
    it("lists every time for a party only the closed section's table fits, none bookable", () => {
      expect(outcome("sectionClosed", "partyOfFour").offered).toEqual(
        [PM(5), PM(6), PM(7), PM(8)].map((minute) => ({
          minute,
          available: false,
          reason: "no_table",
        }))
      );
    });

    it("keeps the times bookable for a party an open section can seat", () => {
      expect(outcome("sectionClosed", "partyOfTwo").offered).toEqual(
        bookable([PM(5), PM(6), PM(7), PM(8)])
      );
    });
  });

  describe("pacing", () => {
    it("lists the 6 pm time but marks it not bookable once the pacing cap is reached", () => {
      expect(outcome("pacing", "partyOfTwo").offered).toEqual([
        { minute: PM(5), available: true },
        { minute: PM(6), available: false, reason: "pacing" },
        { minute: PM(7), available: true },
        { minute: PM(8), available: true },
      ]);
    });
  });
});
