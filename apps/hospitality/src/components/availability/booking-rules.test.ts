import { describe, expect, it } from "vitest";
import { invalidBookingRule, toBookingRulesForm, withBookingRules } from "./booking-rules.js";

const form = (daysAhead = "", noticeHours = "", largestParty = "") => ({
  daysAhead,
  noticeHours,
  largestParty,
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
    expect(invalidBookingRule(form("0", "0", "1"))).toBeNull();
    expect(invalidBookingRule(form("1.5"))).toBe("daysAhead");
    expect(invalidBookingRule(form("", "-1"))).toBe("noticeHours");
    expect(invalidBookingRule(form("", "", "0"))).toBe("largestParty");
    expect(invalidBookingRule(form("abc"))).toBe("daysAhead");
    expect(invalidBookingRule(form("731"))).toBe("daysAhead");
  });
});
