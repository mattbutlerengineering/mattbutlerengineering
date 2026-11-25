import { describe, expect, it } from "vitest";
import { invalidBookingRules, toBookingRulesForm, withBookingRules } from "./booking-rules.js";

const form = (
  daysAhead = "",
  noticeHours = "",
  largestParty = "",
  pacingCovers = "",
  pacingMinutes = ""
) => ({
  daysAhead,
  noticeHours,
  largestParty,
  pacingCovers,
  pacingMinutes,
});

describe("booking rules", () => {
  it("reads the stored rules as text, and an unset one as empty", () => {
    expect(toBookingRulesForm({ maxAdvanceBooking: 60, maxPartySize: 10 })).toEqual(
      form("60", "", "10")
    );
    expect(toBookingRulesForm(null)).toEqual(form());
  });

  it("writes the rules and keeps every other setting, dropping a rule left empty", () => {
    const stored = { maxAdvanceBooking: 30, minAdvanceBooking: 2, profile: { website: "x" } };
    expect(withBookingRules(stored, form("90", "", "12"))).toEqual({
      maxAdvanceBooking: 90,
      maxPartySize: 12,
      profile: { website: "x" },
    });
    expect(withBookingRules(null, form())).toEqual({});
  });

  it("accepts today only and no notice, and refuses fractions, negatives and a party of 0", () => {
    expect(invalidBookingRules(form("0", "0", "1"))).toEqual([]);
    expect(invalidBookingRules(form("1.5"))).toEqual(["daysAhead"]);
    expect(invalidBookingRules(form("", "-1"))).toEqual(["noticeHours"]);
    expect(invalidBookingRules(form("", "", "0"))).toEqual(["largestParty"]);
    expect(invalidBookingRules(form("abc"))).toEqual(["daysAhead"]);
    expect(invalidBookingRules(form("731"))).toEqual(["daysAhead"]);
  });

  it("names every bad field at once, not only the first", () => {
    expect(invalidBookingRules(form("", "-3", "2.5"))).toEqual(["noticeHours", "largestParty"]);
  });

  describe("pacing", () => {
    it("reads the first pacing rule as text", () => {
      expect(
        toBookingRulesForm({ pacingRules: [{ maxCoversPerSlot: 12, timeWindowMinutes: 30 }] })
      ).toEqual(form("", "", "", "12", "30"));
      expect(toBookingRulesForm({ pacingRules: [{ maxCoversPerSlot: 8 }] })).toEqual(
        form("", "", "", "8", "")
      );
    });

    it("writes the first rule and keeps any later rules and other settings", () => {
      const stored = {
        profile: { website: "x" },
        pacingRules: [{ maxCoversPerSlot: 4 }, { maxCoversPerSlot: 9, timeWindowMinutes: 60 }],
      };
      expect(withBookingRules(stored, form("", "", "", "10", "30"))).toEqual({
        profile: { website: "x" },
        pacingRules: [{ maxCoversPerSlot: 10, timeWindowMinutes: 30 }, stored.pacingRules[1]],
      });
    });

    it("leaves the window out when only the cap is set", () => {
      expect(withBookingRules(null, form("", "", "", "10", ""))).toEqual({
        pacingRules: [{ maxCoversPerSlot: 10 }],
      });
    });

    it("clearing the cap removes the first rule, and the key when none are left", () => {
      expect(
        withBookingRules({ pacingRules: [{ maxCoversPerSlot: 4 }] }, form("", "", "", "", ""))
      ).toEqual({});
      expect(
        withBookingRules(
          { pacingRules: [{ maxCoversPerSlot: 4 }, { maxCoversPerSlot: 9 }] },
          form()
        )
      ).toEqual({ pacingRules: [{ maxCoversPerSlot: 9 }] });
    });

    it("refuses a window without a cap, and out-of-range values", () => {
      expect(invalidBookingRules(form("", "", "", "", "30"))).toEqual(["pacingCovers"]);
      expect(invalidBookingRules(form("", "", "", "0", ""))).toEqual(["pacingCovers"]);
      expect(invalidBookingRules(form("", "", "", "10", "0"))).toEqual(["pacingMinutes"]);
      expect(invalidBookingRules(form("", "", "", "10", "30"))).toEqual([]);
    });
  });
});
