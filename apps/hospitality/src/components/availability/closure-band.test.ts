import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { closureBandText } from "./closure-band.js";

// Echo the key and its interpolated values, so the test pins which message is chosen.
const t = ((key: string, values?: Record<string, string>) =>
  values ? `${key} ${Object.values(values).join("|")}` : key) as unknown as TFunction;
const format = { formatLocalTime: (time: string) => time } as unknown as VenueFormat;

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
