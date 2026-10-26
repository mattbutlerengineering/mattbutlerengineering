import { describe, it, expect } from "vitest";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { DINNER_CONFIG, DINNER_TZ } from "./dinner-config.fixture.js";
import { serviceDayCalendarDate } from "./service-day-start.js";

const WHOLE_DAY_CLOSURE = {
  id: "r-close",
  kind: "closure",
  targetKind: "venue",
  startsOn: "2026-05-10",
} as DateRule;

describe("serviceDayCalendarDate", () => {
  it("keeps an evening time on the service day", () => {
    expect(serviceDayCalendarDate(DINNER_CONFIG, DINNER_TZ, "2026-05-10", "19:00")).toBe(
      "2026-05-10"
    );
  });

  it("moves an after-midnight time of a past-midnight service to the next date", () => {
    expect(serviceDayCalendarDate(DINNER_CONFIG, DINNER_TZ, "2026-05-10", "00:30")).toBe(
      "2026-05-11"
    );
  });

  it("stays on the service day when no config has loaded", () => {
    expect(serviceDayCalendarDate(null, DINNER_TZ, "2026-05-10", "00:30")).toBe("2026-05-10");
  });

  it("classifies from the planned day, so a closed day still places 00:30 on the next date", () => {
    const closed: AvailabilityConfig = { ...DINNER_CONFIG, dateRules: [WHOLE_DAY_CLOSURE] };
    expect(serviceDayCalendarDate(closed, DINNER_TZ, "2026-05-10", "00:30")).toBe("2026-05-11");
  });
});
