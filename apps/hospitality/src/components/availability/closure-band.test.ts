import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import type { AvailabilityDaySummary } from "@mbe/types";
import { closureBandText } from "./closure-band.js";

// Echo the key and its interpolated values, so the test pins which message is chosen.
const t = ((key: string, values?: Record<string, string>) =>
  values ? `${key} ${Object.values(values).join("|")}` : key) as unknown as TFunction;
const format = { formatLocalTime: (time: string) => time } as unknown as VenueFormat;

type Closure = AvailabilityDaySummary["closures"][number];

const WHOLE_DAY = { from: 0, to: 2880 };
const WINDOW = { from: 1320, to: 1380 };

describe("closureBandText", () => {
  it("calls a venue closure closed", () => {
    expect(closureBandText({ ruleId: "r", targetKind: "venue", ...WHOLE_DAY }, t, format)).toEqual({
      key: "r",
      text: "availability.calendar.closedAllDay",
      name: "availability.calendar.closedAllDayName",
    });
    expect(closureBandText({ ruleId: "r", targetKind: "venue", ...WINDOW }, t, format).text).toBe(
      "availability.calendar.closedBand 22:00|23:00"
    );
  });

  it("does not call a booking pause closed", () => {
    expect(
      closureBandText({ ruleId: "r", targetKind: "booking", ...WHOLE_DAY }, t, format)
    ).toEqual({
      key: "r",
      text: "availability.calendar.bookingOffAllDay",
      name: "availability.calendar.bookingOffAllDayName",
    });
    expect(closureBandText({ ruleId: "r", targetKind: "booking", ...WINDOW }, t, format).text).toBe(
      "availability.calendar.bookingOffBand 22:00|23:00"
    );
  });

  it.each([
    ["online", "Online"],
    ["phone", "Phone"],
    ["waitlist", "Waitlist"],
  ] as const)("names the %s channel a booking pause turns off", (channel, cap) => {
    const closure = {
      ruleId: "r",
      targetKind: "booking",
      bookingTypes: [channel],
    } satisfies Partial<Closure>;
    expect(closureBandText({ ...closure, ...WHOLE_DAY }, t, format)).toEqual({
      key: "r",
      text: `availability.calendar.bookingOff${cap}AllDay`,
      name: `availability.calendar.bookingOff${cap}AllDayName`,
    });
    expect(closureBandText({ ...closure, ...WINDOW }, t, format)).toEqual({
      key: "r",
      text: `availability.calendar.bookingOff${cap}Band 22:00|23:00`,
      name: `availability.calendar.bookingOff${cap}BandName 22:00|23:00`,
    });
  });

  it("keeps the generic wording for several channels or an API that omits them", () => {
    const base: Closure = { ruleId: "r", targetKind: "booking", ...WHOLE_DAY };
    const generic = "availability.calendar.bookingOffAllDay";
    expect(closureBandText({ ...base, bookingTypes: ["online", "phone"] }, t, format).text).toBe(
      generic
    );
    expect(closureBandText({ ...base, bookingTypes: [] }, t, format).text).toBe(generic);
    expect(closureBandText(base, t, format).text).toBe(generic);
  });

  it("names a service closure as a service, not the venue", () => {
    expect(
      closureBandText({ ruleId: "r", targetKind: "service", ...WHOLE_DAY }, t, format).text
    ).toBe("availability.calendar.serviceClosedAllDay");
    expect(closureBandText({ ruleId: "r", targetKind: "service", ...WINDOW }, t, format).name).toBe(
      "availability.calendar.serviceClosedBandName 22:00|23:00"
    );
  });

  it("names a table closure as tables blocked", () => {
    expect(
      closureBandText({ ruleId: "r", targetKind: "tables", ...WHOLE_DAY }, t, format).text
    ).toBe("availability.calendar.tablesBlockedAllDay");
    expect(closureBandText({ ruleId: "r", targetKind: "tables", ...WINDOW }, t, format).text).toBe(
      "availability.calendar.tablesBlockedBand 22:00|23:00"
    );
  });
});
