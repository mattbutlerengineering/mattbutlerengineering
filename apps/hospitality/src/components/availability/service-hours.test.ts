import { describe, expect, it } from "vitest";
import { defaultT as t } from "../../i18n/default-t.js";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import {
  namedServiceHoursText,
  serviceCloseChangeText,
  serviceHoursText,
} from "./service-hours.js";

const format = {
  formatLocalTime: (hhmm: string) => {
    const [h = "0", m = "00"] = hhmm.split(":");
    const hour = Number(h);
    return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${hour < 12 ? "AM" : "PM"}`;
  },
} as unknown as VenueFormat;
const ctx = { t, format };

describe("serviceHoursText", () => {
  it("reads open to close, then the last seating", () => {
    expect(serviceHoursText({ opensAt: 690, lastSeatingAt: 840, closesAt: 900 }, ctx)).toBe(
      "11:30 AM–3:00 PM, last seating 2:00 PM"
    );
  });

  it("drops the last seating clause when it is the close", () => {
    expect(serviceHoursText({ opensAt: 690, lastSeatingAt: 900, closesAt: 900 }, ctx)).toBe(
      "11:30 AM–3:00 PM"
    );
  });

  it("reads a close past midnight as 12:00 AM, the next day", () => {
    const text = serviceHoursText({ opensAt: 1020, lastSeatingAt: 1380, closesAt: 1440 }, ctx);
    expect(text).toBe("5:00 PM–12:00 AM (next day), last seating 11:00 PM");
  });
});

describe("serviceCloseChangeText", () => {
  it("names the days, the close and the last seating", () => {
    expect(serviceCloseChangeText("Fri, Sat", { closesAt: 1440, lastSeatingAt: 1380 }, ctx)).toBe(
      "Fri, Sat until 12:00 AM (next day), last seating 11:00 PM"
    );
  });

  it("leaves out the last seating when it is the close", () => {
    expect(serviceCloseChangeText("Fri", { closesAt: 1380, lastSeatingAt: 1380 }, ctx)).toBe(
      "Fri until 11:00 PM"
    );
  });
});

describe("namedServiceHoursText", () => {
  it("puts the service's name before its hours", () => {
    expect(
      namedServiceHoursText("Lunch", { opensAt: 690, lastSeatingAt: 840, closesAt: 900 }, ctx)
    ).toBe("Lunch 11:30 AM–3:00 PM, last seating 2:00 PM");
  });
});
