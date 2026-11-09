import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import { singleDateChangeCount } from "./copy-day.js";
import { EARLY_DINNER, fixtureConfig } from "./resolved-day-fixtures.js";

describe("singleDateChangeCount (the discovery nudge's trigger)", () => {
  const single = (id: string, date: string): DateRule => ({
    ...EARLY_DINNER,
    id,
    startsOn: date,
    endsOn: date,
  });

  it("counts single-date special hours on one weekday", () => {
    const config = fixtureConfig(
      single("a", "2026-10-02"),
      single("b", "2026-10-09"),
      single("c", "2026-10-16"),
      single("d", "2026-10-17")
    );
    expect(singleDateChangeCount(config, 5)).toBe(3);
    expect(singleDateChangeCount(config, 6)).toBe(1);
  });

  it("does not count ranges, repeats or closures", () => {
    const config = fixtureConfig(
      { ...single("a", "2026-10-02"), endsOn: "2026-10-09" },
      { ...single("b", "2026-10-09"), repeat: { version: 1, weekdays: [5] } },
      {
        id: "c",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-10-16",
        endsOn: "2026-10-16",
      }
    );
    expect(singleDateChangeCount(config, 5)).toBe(0);
  });
});
