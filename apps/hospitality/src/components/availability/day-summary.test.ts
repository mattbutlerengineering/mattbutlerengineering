import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { AvailabilityDaySummary } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { dayLabelText, presentDay, scheduleNameText } from "./day-summary.js";

const t = ((key: string, values?: Record<string, string>) =>
  values ? `${key} ${Object.values(values).join("|")}` : key) as unknown as TFunction;
const format = {
  formatLocalTime: (time: string) => time,
  formatCalendarDate: () => "Friday, October 30",
} as unknown as VenueFormat;

const baseSummary: AvailabilityDaySummary = {
  serviceDate: "2026-10-30",
  label: "Regular hours",
  scheduleId: "sch-1",
  serviceCount: 2,
  closures: [],
  bookingOpen: { online: true, phone: true, waitlist: true },
  services: [
    { venueServiceId: "svc-1", name: "Lunch", opensAt: 660, lastSeatingAt: 810, closesAt: 840 },
    { venueServiceId: "svc-2", name: "Dinner", opensAt: 1080, lastSeatingAt: 1290, closesAt: 1320 },
  ],
};

describe("the server's en-US words (#7980)", () => {
  it("translates the three labels the API writes itself", () => {
    expect(dayLabelText("Closed", t)).toBe("availability.calendar.dayLabel.closed");
    expect(dayLabelText("Special hours", t)).toBe("availability.calendar.dayLabel.specialHours");
    expect(dayLabelText("Open", t)).toBe("availability.calendar.dayLabel.open");
  });

  it("translates the seeded schedule name, and leaves a Manager's own name alone", () => {
    expect(scheduleNameText("Regular week", t)).toBe("availabilitySchedules.regularMarker");
    expect(dayLabelText("Regular week", t)).toBe("availabilitySchedules.regularMarker");
    expect(scheduleNameText("Summer patio", t)).toBe("Summer patio");
    expect(dayLabelText("Summer patio", t)).toBe("Summer patio");
  });

  it("speaks and shows the translated label", () => {
    const view = presentDay(
      "2026-10-30",
      { ...baseSummary, label: "Closed", serviceCount: 0, services: [] },
      false,
      t,
      format
    );
    expect(view.label).toBe("availability.calendar.dayLabel.closed");
    expect(view.accessibleDetails).toBe("availability.calendar.dayLabel.closed");
  });

  it("marks a closed and a special-hours day apart from a schedule's day, whatever the language", () => {
    const tone = (label: string) =>
      presentDay("2026-10-30", { ...baseSummary, label }, false, t, format).tone;
    expect(tone("Closed")).toBe("closed");
    expect(tone("Special hours")).toBe("special");
    expect(tone("Regular week")).toBeNull();
    expect(tone("Summer patio")).toBeNull();
    expect(presentDay("2026-10-30", undefined, false, t, format).tone).toBeNull();
  });
});

/** The mock `t` above nests: name, then "open–close, last seating" built the service-hours way. */
const lunchLine =
  "availability.serviceHours.named Lunch|" +
  "availability.serviceHours.withLastSeating availability.serviceHours.range 11:00|14:00|13:30";
const dinnerLine =
  "availability.serviceHours.named Dinner|" +
  "availability.serviceHours.withLastSeating availability.serviceHours.range 18:00|22:00|21:30";

describe("presentDay services", () => {
  it("emits a service line per service when detailed, in the shared service-hours wording", () => {
    const view = presentDay("2026-10-30", baseSummary, true, t, format);
    expect(view.services).toEqual([
      { key: "svc-1", text: lunchLine },
      { key: "svc-2", text: dinnerLine },
    ]);
  });

  it("speaks the services in order in the accessible details, with no count to repeat them", () => {
    const view = presentDay("2026-10-30", baseSummary, true, t, format);
    expect(view.servicesSummary).toBeNull();
    expect(view.accessibleDetails).toBe(
      `Regular hours, ${lunchLine}, ${dinnerLine}`
    );
  });

  it("keeps the count in week view for an older API that sends no service lines", () => {
    const { services: _services, ...old } = baseSummary;
    expect(presentDay("2026-10-30", old, true, t, format).servicesSummary).toBe(
      "availability.calendar.services 2"
    );
  });

  it("names the services in month view, one service or several, and speaks each name", () => {
    const view = presentDay("2026-10-30", baseSummary, false, t, format);
    expect(view.services).toEqual([]);
    expect(view.servicesSummary).toBe("Lunch · Dinner");
    expect(view.accessibleDetails).toBe("Regular hours, Lunch, Dinner");
    const lunchOnly = {
      ...baseSummary,
      serviceCount: 1,
      services: baseSummary.services!.slice(0, 1),
    };
    expect(presentDay("2026-10-30", lunchOnly, false, t, format).servicesSummary).toBe("Lunch");
    const closed = { ...baseSummary, label: "Closed", serviceCount: 0, services: [] };
    expect(presentDay("2026-10-30", closed, false, t, format).servicesSummary).toBeNull();
    // An older API with no service lines still gets the count, from two services up.
    const { services: _services, ...old } = baseSummary;
    expect(presentDay("2026-10-30", old, false, t, format).servicesSummary).toBe(
      "availability.calendar.services 2"
    );
  });

  it("omits service lines when there is no summary", () => {
    const view = presentDay("2026-10-30", undefined, true, t, format);
    expect(view.services).toEqual([]);
  });
});

const weekFormat = {
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
    const view = presentDay("2026-11-06", summary([PAUSE_ONLINE]), false, t, weekFormat);
    expect(view.bands.map((b) => b.name)).toEqual([
      "availability.calendar.bookingOffOnlineAllDayName",
    ]);
    expect(view.onlineOff).toBe(false);
    expect(view.accessibleDetails).toBe(
      "availabilitySchedules.regularMarker, availability.calendar.bookingOffOnlineAllDayName"
    );
  });

  it("keeps the online-off text when the band does not name online", () => {
    const { bookingTypes: _unused, ...legacy } = PAUSE_ONLINE;
    const view = presentDay("2026-11-06", summary([legacy]), false, t, weekFormat);
    expect(view.onlineOff).toBe(true);
    expect(view.accessibleDetails).toContain("availability.calendar.onlineOffName");
    const phone = { ...PAUSE_ONLINE, bookingTypes: ["phone" as const] };
    expect(presentDay("2026-11-06", summary([phone]), false, t, weekFormat).onlineOff).toBe(true);
    const both = { ...PAUSE_ONLINE, bookingTypes: ["online" as const, "phone" as const] };
    expect(presentDay("2026-11-06", summary([both]), false, t, weekFormat).onlineOff).toBe(true);
  });

  it("keeps the online-off text when online is off with no closure", () => {
    expect(presentDay("2026-11-06", summary([]), false, t, weekFormat).onlineOff).toBe(true);
  });
});

describe("the Services filter (#7981)", () => {
  const dinner = { id: "svc-2", name: "Dinner" };

  it("reads a day for the one service: its name, its line, its count", () => {
    const view = presentDay("2026-10-30", baseSummary, false, t, format, dinner);
    expect(view.servicesSummary).toBe("Dinner");
    const detailed = presentDay("2026-10-30", baseSummary, true, t, format, dinner);
    expect(detailed.services.map((l) => l.key)).toEqual(["svc-2"]);
    expect(detailed.accessibleDetails).not.toContain("Lunch");
  });

  it("keeps only the closure bands that touch the service", () => {
    const withClosure: AvailabilityDaySummary = {
      ...baseSummary,
      closures: [{ ruleId: "r1", targetKind: "service", from: 1200, to: 1320 }],
    };
    expect(presentDay("2026-10-30", withClosure, false, t, format, dinner).bands).toHaveLength(1);
    const lunch = { id: "svc-1", name: "Lunch" };
    expect(presentDay("2026-10-30", withClosure, false, t, format, lunch).bands).toHaveLength(0);
  });

  it("says a day the service does not run has no such service, as closed", () => {
    const lunchOnly: AvailabilityDaySummary = {
      ...baseSummary,
      serviceCount: 1,
      services: baseSummary.services?.slice(0, 1),
    };
    const view = presentDay("2026-10-30", lunchOnly, false, t, format, dinner);
    expect(view.label).toBe("availability.calendar.serviceNotRunning Dinner");
    expect(view.tone).toBe("closed");
    expect(view.servicesSummary).toBeNull();
  });

  it("leaves a closed day saying Closed, not No Dinner", () => {
    const closed: AvailabilityDaySummary = {
      ...baseSummary,
      label: "Closed",
      serviceCount: 0,
      services: [],
    };
    const view = presentDay("2026-10-30", closed, false, t, format, dinner);
    expect(view.label).toBe("availability.calendar.dayLabel.closed");
  });

  it("is the same as no filter when there is none", () => {
    expect(presentDay("2026-10-30", baseSummary, false, t, format, null)).toEqual(
      presentDay("2026-10-30", baseSummary, false, t, format)
    );
  });
});
