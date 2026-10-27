import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { AvailabilityDaySummary } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { presentDay } from "./day-summary.js";

const t = ((key: string, values?: Record<string, string>) =>
  values ? `${key} ${Object.values(values).join("|")}` : key) as unknown as TFunction;
const format = {
  formatLocalTime: (time: string) => time,
  formatCalendarDate: () => "Friday",
} as unknown as VenueFormat;

const summary = (
  closures: AvailabilityDaySummary["closures"],
  online = false
): AvailabilityDaySummary => ({
  serviceDate: "2026-11-06",
  label: "Regular week",
  scheduleId: "sch-1",
  serviceCount: 1,
  closures,
  bookingOpen: { online, phone: true, waitlist: true },
});

const PAUSE_ONLINE: AvailabilityDaySummary["closures"][number] = {
  ruleId: "r",
  targetKind: "booking",
  from: 0,
  to: 2880,
  bookingTypes: ["online"],
};

describe("presentDay", () => {
  it("says online booking is off once when the band already names the channel", () => {
    const view = presentDay("2026-11-06", summary([PAUSE_ONLINE]), false, t, format);
    expect(view.bands.map((b) => b.name)).toEqual([
      "availability.calendar.bookingOffOnlineAllDayName",
    ]);
    expect(view.onlineOff).toBe(false);
    expect(view.accessibleDetails).toBe(
      "Regular week, availability.calendar.bookingOffOnlineAllDayName"
    );
  });

  it("keeps the online-off text when the band does not name online", () => {
    const { bookingTypes: _unused, ...legacy } = PAUSE_ONLINE;
    const view = presentDay("2026-11-06", summary([legacy]), false, t, format);
    expect(view.onlineOff).toBe(true);
    expect(view.accessibleDetails).toContain("availability.calendar.onlineOffName");
    const phone = { ...PAUSE_ONLINE, bookingTypes: ["phone" as const] };
    expect(presentDay("2026-11-06", summary([phone]), false, t, format).onlineOff).toBe(true);
    const both = { ...PAUSE_ONLINE, bookingTypes: ["online" as const, "phone" as const] };
    expect(presentDay("2026-11-06", summary([both]), false, t, format).onlineOff).toBe(true);
  });

  it("keeps the online-off text when online is off with no closure", () => {
    expect(presentDay("2026-11-06", summary([]), false, t, format).onlineOff).toBe(true);
  });
});
