import { describe, expect, it } from "vitest";
import { availabilityPath, readExplainAddress } from "./availability-address.js";

describe("the Explain this day address", () => {
  it("carries the date and party size, so the page can be shared", () => {
    expect(availabilityPath({ view: "explain", date: "2026-12-04", partySize: 6 })).toBe(
      "/availability/explain?date=2026-12-04&partySize=6"
    );
  });

  it("leaves out what is not given, and a date that is not a real day", () => {
    expect(availabilityPath({ view: "explain" })).toBe("/availability/explain");
    expect(availabilityPath({ view: "explain", date: "2026-02-31" })).toBe("/availability/explain");
  });

  it("reads the date and party size back, with 2 for a party that is missing or out of range", () => {
    expect(readExplainAddress({ search: "?date=2026-12-04&partySize=6" })).toEqual({
      date: "2026-12-04",
      partySize: 6,
    });
    expect(readExplainAddress({ search: "" })).toEqual({ date: null, partySize: 2 });
    expect(readExplainAddress({ search: "?date=nope&partySize=0" })).toEqual({
      date: null,
      partySize: 2,
    });
    expect(readExplainAddress({ search: "?partySize=21" }).partySize).toBe(2);
    expect(readExplainAddress({ search: "?partySize=2.5" }).partySize).toBe(2);
  });
});
