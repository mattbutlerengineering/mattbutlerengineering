import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { AvailabilityDaySummary } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import {
  dayDifferences,
  dayLabelText,
  monthLegend,
  presentDay,
  scheduleNameText,
  toDifference,
} from "./day-summary.js";

const dayDifference = (
  ...args: Parameters<typeof dayDifferences>
): ReturnType<typeof toDifference> => toDifference(dayDifferences(...args));

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
    expect(view.accessibleDetails).toBe(`Regular hours, ${lunchLine}, ${dinnerLine}`);
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

describe("dayDifference: the one chip a month cell shows (ux.md F5)", () => {
  const REGULAR = "reg";
  const OPEN = { online: true, phone: true, waitlist: true };
  const regularDay = { ...baseSummary, scheduleId: REGULAR, label: "Regular week" };
  const sections = new Map([["sec-bar", "Bar"]]);
  const diff = (overrides: Partial<AvailabilityDaySummary>) =>
    dayDifference({ ...regularDay, ...overrides }, REGULAR, sections, t);
  const whole = { from: 0, to: 2880 };

  it("is null for a day that reads like the regular week", () => {
    expect(diff({})).toBeNull();
    expect(diff({ bookingOpen: OPEN, guestMessage: "Hi" })).toBeNull();
  });

  it("names another schedule, with nothing more", () => {
    expect(diff({ scheduleId: "wk", label: "Weeknights" })).toEqual({
      chip: "Weeknights",
      more: 0,
    });
  });

  it("ranks a service closure above the schedule's name, and counts the schedule as more", () => {
    const day = diff({
      scheduleId: "wk",
      label: "Weeknights",
      closures: [
        { ruleId: "c1", targetKind: "service", venueServiceId: "svc-1", from: 660, to: 840 },
      ],
    });
    expect(day).toEqual({ chip: "availability.calendar.chip.serviceClosed Lunch", more: 1 });
  });

  it("falls back to the venue's service names when the day no longer lists the service", () => {
    const closed = {
      ...regularDay,
      services: [],
      closures: [
        { ruleId: "c1", targetKind: "service" as const, venueServiceId: "svc-9", ...whole },
      ],
    };
    expect(dayDifference(closed, REGULAR, sections, t, new Map([["svc-9", "Brunch"]]))?.chip).toBe(
      "availability.calendar.chip.serviceClosed Brunch"
    );
    expect(dayDifference(closed, REGULAR, sections, t)?.chip).toBe(
      "availability.calendar.chip.serviceClosedUnnamed"
    );
  });

  it("ranks Closed › service › section › booking paused › Special hours › schedule name", () => {
    const service = {
      ruleId: "s",
      targetKind: "service" as const,
      venueServiceId: "svc-1",
      ...whole,
    };
    const section = { ruleId: "t", targetKind: "tables" as const, sectionId: "sec-bar", ...whole };
    const booking = {
      ruleId: "b",
      targetKind: "booking" as const,
      bookingTypes: ["online" as const],
      ...whole,
    };
    const venue = { ruleId: "v", targetKind: "venue" as const, ...whole };
    const base = { scheduleId: "wk", label: "Special hours" };
    expect(diff({ ...base, closures: [venue, service, section, booking] })).toEqual({
      chip: "availability.calendar.dayLabel.closed",
      more: 4,
    });
    expect(diff({ ...base, closures: [service, section, booking] })?.chip).toBe(
      "availability.calendar.chip.serviceClosed Lunch"
    );
    expect(diff({ ...base, closures: [section, booking] })).toEqual({
      chip: "availability.calendar.chip.sectionClosed Bar",
      more: 3 - 1,
    });
    expect(diff({ ...base, closures: [booking] })?.chip).toBe(
      "availability.calendar.chip.onlinePaused"
    );
    expect(diff({ ...base })).toEqual({
      chip: "availability.calendar.dayLabel.specialHours",
      more: 0,
    });
  });

  it("reads a paused channel from the booking flags, and several as booking paused", () => {
    expect(diff({ bookingOpen: { ...OPEN, phone: false } })?.chip).toBe(
      "availability.calendar.chip.phonePaused"
    );
    expect(diff({ bookingOpen: { online: false, phone: false, waitlist: true } })?.chip).toBe(
      "availability.calendar.chip.bookingPaused"
    );
  });

  it("reads a partial venue closure as special hours, and a closed label as Closed", () => {
    expect(
      diff({ closures: [{ ruleId: "v", targetKind: "venue", from: 1320, to: 1380 }] })?.chip
    ).toBe("availability.calendar.dayLabel.specialHours");
    expect(diff({ label: "Closed", scheduleId: "wk", serviceCount: 0 })).toEqual({
      chip: "availability.calendar.dayLabel.closed",
      more: 0,
    });
    expect(
      diff({
        label: "Closed",
        scheduleId: null,
        serviceCount: 0,
        closures: [{ ruleId: "v", targetKind: "venue", ...whole }],
      })
    ).toEqual({ chip: "availability.calendar.dayLabel.closed", more: 0 });
  });

  it("reads a weekday the regular week is closed on as part of the regular week: no chip", () => {
    expect(diff({ label: "Closed", scheduleId: null, serviceCount: 0, services: [] })).toBeNull();
  });

  it("treats a summary with no schedule id as different only when its label is not the seeded regular week", () => {
    const old = (label: string) =>
      dayDifference(
        { ...regularDay, label, scheduleId: undefined as unknown as null },
        REGULAR,
        sections,
        t
      );
    expect(old("Regular week")).toBeNull();
    expect(old("Weeknights")?.chip).toBe("Weeknights");
  });
});

describe("monthLegend: the legend above the month grid", () => {
  const cell = (date: string, ...differences: string[]) => ({ date, differences });
  const range = (from: number, to: number, ...differences: string[]) =>
    Array.from({ length: to - from + 1 }, (_, i) =>
      cell(`2026-12-${String(from + i).padStart(2, "0")}`, ...differences)
    );
  // December 2026: Tue 1 .. Thu 31; the Mon–Thu of each full week is Weeknights.
  const december = range(1, 31).map((c) => {
    const weekday = (new Date(`${c.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    return weekday <= 3 ? cell(c.date, "Weeknights") : c;
  });
  const shortDay = {
    formatCalendarDate: (date: string) =>
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T00:00:00Z`).getUTCDay()],
  } as unknown as VenueFormat;

  it("says the month is the regular week when nothing differs", () => {
    expect(monthLegend([cell("2026-12-01"), cell("2026-12-02")], t, shortDay)).toEqual({
      heading: "availability.calendar.legend.regular",
      items: [],
    });
  });

  it("gives a weekly pattern its weekdays, and a one-off its day count, even when the one-off sits on a pattern day", () => {
    const withEve = december.map((c) =>
      c.date === "2026-12-24" ? cell(c.date, "Lunch closed", "Weeknights") : c
    );
    const { heading, items } = monthLegend(withEve, t, shortDay);
    expect(heading).toBe("availability.calendar.legend.thisMonth");
    expect(items).toEqual([
      "availability.calendar.legend.weekdays Weeknights|Mon–Thu",
      "availability.calendar.legend.days Lunch closed|1",
    ]);
  });

  it("is not weekly for adjacent dates in a single week, nor for a range", () => {
    const eve = monthLegend(
      [...range(21, 23), ...range(24, 25, "Closed"), ...range(26, 27)],
      t,
      shortDay
    );
    expect(eve.items).toEqual(["availability.calendar.legend.days Closed|2"]);
    const week = monthLegend(range(21, 27, "Closed"), t, shortDay);
    expect(week.items).toEqual(["availability.calendar.legend.days Closed|7"]);
  });

  it("is weekly when the chip is on the same weekdays in two or more weeks, and in every week that has them", () => {
    const cells = [...range(1, 6), ...range(7, 13)].map((c) =>
      ["2026-12-01", "2026-12-08"].includes(c.date) ? cell(c.date, "Closed") : c
    );
    expect(monthLegend(cells, t, shortDay).items).toEqual([
      "availability.calendar.legend.weekdays Closed|Tue",
    ]);
    const missing = cells.map((c) => (c.date === "2026-12-08" ? cell(c.date) : c));
    expect(monthLegend([...missing, cell("2026-12-15", "Closed")], t, shortDay).items).toEqual([
      "availability.calendar.legend.days Closed|2",
    ]);
  });

  it("counts days when the chip is not on the same weekdays every week it appears in", () => {
    const uneven = monthLegend(
      [
        cell("2026-12-01", "Closed"),
        cell("2026-12-02"),
        cell("2026-12-08", "Closed"),
        cell("2026-12-09", "Closed"),
      ],
      t,
      shortDay
    );
    expect(uneven.items).toEqual(["availability.calendar.legend.days Closed|3"]);
  });

  it("counts a chip wherever it appears, as the pattern does, not only where it is first", () => {
    const { items } = monthLegend(
      [
        cell("2026-12-01", "Weeknights"),
        cell("2026-12-22"),
        cell("2026-12-03", "Weeknights"),
        cell("2026-12-24", "Lunch closed", "Weeknights"),
      ],
      t,
      shortDay
    );
    expect(items).toContain("availability.calendar.legend.days Weeknights|3");
  });
});
