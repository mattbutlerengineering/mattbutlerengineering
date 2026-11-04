import { describe, expect, it } from "vitest";
import { suggestName } from "./suggest-name.js";

describe("suggestName (ux.md F-UW: a name suggested from the dates)", () => {
  it("names a period of a few months for the season it starts in", () => {
    expect(suggestName("2027-06-01", "2027-09-15")).toEqual({ kind: "season", season: "summer" });
    expect(suggestName("2026-12-01", "2027-02-28")).toEqual({ kind: "season", season: "winter" });
    expect(suggestName("2027-03-01", "2027-05-31")).toEqual({ kind: "season", season: "spring" });
    expect(suggestName("2026-10-01", "2026-11-30")).toEqual({ kind: "season", season: "autumn" });
  });

  it("names a period with no end by where it starts: it is the new regular week", () => {
    expect(suggestName("2027-06-01", null)).toEqual({ kind: "from", from: "2027-06-01" });
  });

  it("names a long period by its dates, because no season is its name", () => {
    expect(suggestName("2027-01-01", "2027-12-31")).toEqual({
      kind: "range",
      from: "2027-01-01",
      to: "2027-12-31",
    });
  });

  it("suggests nothing before a start date is chosen", () => {
    expect(suggestName(null, null)).toBeNull();
  });
});
