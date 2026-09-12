import { describe, expect, it } from "vitest";
import { isLocalToday, localDateString, localHour } from "./local-clock.js";

// The service-night clock is the device's local clock (ux.md decision (a)). Pin the zone so the
// local-vs-UTC split is exercised identically on a Pacific laptop and on UTC CI.
process.env.TZ = "America/Los_Angeles";

/** 23:30 PDT on 2026-09-04 — already 2026-09-05 in UTC. */
const LATE_EVENING = new Date(2026, 8, 4, 23, 30);
/** 00:30 PDT on 2026-09-05 — the UTC day has not moved since LATE_EVENING. */
const AFTER_MIDNIGHT = new Date(2026, 8, 5, 0, 30);

describe("localDateString", () => {
  it("formats the local calendar day as YYYY-MM-DD", () => {
    expect(localDateString(new Date("2026-09-04T06:30:00Z"))).toBe("2026-09-03");
  });

  it("stays on today at 23:30 local even though the UTC day has rolled", () => {
    expect(LATE_EVENING.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(localDateString(LATE_EVENING)).toBe("2026-09-04");
  });

  it("rolls over at local midnight, not at UTC midnight", () => {
    expect(AFTER_MIDNIGHT.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(localDateString(AFTER_MIDNIGHT)).toBe("2026-09-05");
  });

  it("returns an empty string for an invalid Date instead of throwing", () => {
    expect(localDateString(new Date(Number.NaN))).toBe("");
  });
});

describe("localHour", () => {
  it("reads the local hour, not the UTC hour", () => {
    expect(localHour(new Date("2026-09-04T06:30:00Z"))).toBe(23);
    expect(localHour(AFTER_MIDNIGHT)).toBe(0);
  });
});

describe("isLocalToday", () => {
  it("matches the local calendar day at both edges of midnight", () => {
    // A1.1/A1.2 fact: 06:30Z is still the 3rd in Los Angeles, even though the UTC slice says the 4th
    expect(isLocalToday("2026-09-03", new Date("2026-09-04T06:30:00Z"))).toBe(true);
    expect(isLocalToday("2026-09-04", new Date("2026-09-04T06:30:00Z"))).toBe(false);
    expect(isLocalToday("2026-09-04", LATE_EVENING)).toBe(true);
    expect(isLocalToday("2026-09-05", LATE_EVENING)).toBe(false);
    expect(isLocalToday("2026-09-05", AFTER_MIDNIGHT)).toBe(true);
    expect(isLocalToday("2026-09-04", AFTER_MIDNIGHT)).toBe(false);
  });

  it("is false for an invalid Date and for a malformed day, never throwing", () => {
    expect(isLocalToday("2026-09-04", new Date("not a date"))).toBe(false);
    expect(isLocalToday("garbage", LATE_EVENING)).toBe(false);
    expect(isLocalToday("", new Date(Number.NaN))).toBe(false);
  });
});
