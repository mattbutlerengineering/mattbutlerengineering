import { describe, expect, it } from "vitest";
import { firstOccurrenceOnOrAfter } from "./first-occurrence.js";

describe("firstOccurrenceOnOrAfter", () => {
  it("returns startsOn for a future one-off", () => {
    expect(firstOccurrenceOnOrAfter({ startsOn: "2026-12-24" }, "2026-12-01")).toBe("2026-12-24");
  });

  it("judges a past, ongoing range from today", () => {
    const rule = { startsOn: "2026-12-01", endsOn: "2026-12-30" };
    expect(firstOccurrenceOnOrAfter(rule, "2026-12-10")).toBe("2026-12-10");
  });

  it("is null once the range has ended", () => {
    expect(
      firstOccurrenceOnOrAfter({ startsOn: "2026-12-01", endsOn: "2026-12-05" }, "2026-12-10")
    ).toBeNull();
  });

  it("lands on the next listed weekday", () => {
    // 2026-12-03 is a Thursday; Sundays-only (0) next falls on 2026-12-06.
    const rule = { startsOn: "2026-01-04", repeat: { weekdays: [0] } };
    expect(firstOccurrenceOnOrAfter(rule, "2026-12-03")).toBe("2026-12-06");
  });

  it("is null when the next weekday falls past endsOn", () => {
    const rule = { startsOn: "2026-01-04", endsOn: "2026-12-05", repeat: { weekdays: [0] } };
    expect(firstOccurrenceOnOrAfter(rule, "2026-12-03")).toBeNull();
  });
});
