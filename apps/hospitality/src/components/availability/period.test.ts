import { describe, it, expect } from "vitest";
import type { AvailabilityDaySummary } from "@mbe/types";
import { defaultT } from "../../i18n/default-t.js";
import { weekSummary } from "./period.js";

const OPEN = { online: true, phone: true, waitlist: true };
const DATES = [
  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
  "2026-11-01",
];

function week(
  overrides: Record<string, Partial<AvailabilityDaySummary>> = {}
): AvailabilityDaySummary[] {
  return DATES.map((serviceDate) => ({
    serviceDate,
    label: "Weeknight",
    scheduleId: "s1",
    serviceCount: 2,
    closures: [],
    bookingOpen: OPEN,
    ...overrides[serviceDate],
  }));
}

const summary = (days: AvailabilityDaySummary[]) => weekSummary("2026-10-28", days, defaultT);
const wholeDay = (ruleId: string, targetKind: "venue" | "booking" | "tables" | "service") => ({
  ruleId,
  targetKind,
  from: 0,
  to: 2880,
});

describe("weekSummary", () => {
  it("keeps a day open when a whole-day booking closure turns online booking off", () => {
    const days = week({
      "2026-10-30": {
        closures: [wholeDay("r1", "booking")],
        bookingOpen: { ...OPEN, online: false },
      },
    });
    expect(summary(days)).toBe("This week: open 7 days · 1 closure · online booking off some days");
  });

  it("says online booking is off when every open day has it off", () => {
    const days = week().map((d) => ({ ...d, bookingOpen: { ...OPEN, online: false } }));
    expect(summary(days)).toBe("This week: open 7 days · 0 closures · online booking off");
  });

  it("never says online booking is on when no day is open", () => {
    const days = week().map((d) => ({ ...d, serviceCount: 0, label: "Closed" }));
    expect(summary(days)).toBe("This week: open 0 days · 0 closures · online booking off");
  });

  it("keeps a day open under a whole-day tables block", () => {
    const days = week({ "2026-10-30": { closures: [wholeDay("r1", "tables")] } });
    expect(summary(days)).toContain("open 7 days");
  });

  it("keeps a day open when one service is closed and another still runs", () => {
    const days = week({
      "2026-10-30": { serviceCount: 1, closures: [wholeDay("r1", "service")] },
    });
    expect(summary(days)).toContain("open 7 days");
  });

  it("counts a closure spanning two days once", () => {
    const days = week({
      "2026-10-30": { serviceCount: 0, closures: [wholeDay("r1", "venue")] },
      "2026-10-31": { serviceCount: 0, closures: [wholeDay("r1", "venue")] },
    });
    expect(summary(days)).toBe("This week: open 5 days · 1 closure · online booking on");
  });
});
