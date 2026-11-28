import { describe, expect, it } from "vitest";
import type { TraceReason, TracedTime } from "@mbe/types";
import esMX from "../../i18n/catalogs/es-MX.json";
import frCA from "../../i18n/catalogs/fr-CA.json";
import { localeRuntime } from "../../i18n/runtime.js";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import {
  commonReasonCode,
  destinationOf,
  destinationPath,
  groupByService,
  reasonText,
  summaryText,
} from "./explain-day.js";

localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
localeRuntime.i18n.addResourceBundle("fr-CA", "translation", frCA, true, true);

const en = localeRuntime.i18n.getFixedT("en-US");
const es = localeRuntime.i18n.getFixedT("es-MX");
const fr = localeRuntime.i18n.getFixedT("fr-CA");

const format = {
  locale: "en-US",
  formatLocalTime: (hhmm: string) => hhmm,
  formatInstant: () => "Fri, Dec 4, 9:00 AM",
  formatCalendarDate: () => "December 4",
} as unknown as VenueFormat;

const at = (minute: number, rest: Partial<TracedTime> = {}): TracedTime => ({
  serviceId: "svc-dinner",
  serviceName: "Dinner",
  minute,
  time: "19:00",
  startsAt: null,
  outcome: "bookable",
  ...rest,
});

const removed = (reason: TraceReason, minute = 1140): TracedTime =>
  at(minute, { outcome: "removed", reason });

const PACING: TraceReason = {
  code: "pacing",
  scope: "venue",
  limit: 3,
  windowMinutes: 15,
  covers: 3,
  partySize: 2,
};

describe("reasonText", () => {
  it("names pacing with its numbers and the time", () => {
    expect(reasonText(PACING, removed(PACING), en, format)).toBe(
      "Pacing: 3 of 3 covers already booked at 19:00, so a party of 2 would go over."
    );
  });

  it("names the service when the pacing limit is the service's", () => {
    const reason: TraceReason = { ...PACING, scope: "service" };
    expect(reasonText(reason, removed(reason), en, format)).toMatch(/^Dinner pacing: 3 of 3/);
  });

  it("says a closure window, or all day for a whole-day closure", () => {
    const window: TraceReason = {
      code: "closure",
      ruleId: "r1",
      targetKind: "service",
      from: 1080,
      to: 1200,
    };
    expect(reasonText(window, removed(window), en, format)).toBe(
      "Closure: Dinner is closed from 18:00 to 20:00."
    );
    const whole: TraceReason = { ...window, targetKind: "venue", from: 0, to: 2880 };
    expect(reasonText(whole, removed(whole), en, format)).toBe(
      "Closure: the venue is closed all day."
    );
  });

  it("reads the channel in the viewer's language", () => {
    const reason: TraceReason = { code: "booking_paused", channel: "phone" };
    expect(reasonText(reason, removed(reason), en, format)).toBe("Pause: phone booking is paused.");
    expect(reasonText(reason, removed(reason), es, format)).toBe(
      "Pausa: la reserva por teléfono está en pausa."
    );
    expect(reasonText(reason, removed(reason), fr, format)).toBe(
      "Pause : la réservation par téléphone est en pause."
    );
  });

  it("has copy in every locale for every reason code", () => {
    const reasons: TraceReason[] = [
      { code: "booking_paused", channel: "online" },
      { code: "channel_not_offered", channel: "online" },
      { code: "closure", ruleId: "r", targetKind: "tables", from: 0, to: 60 },
      { code: "nonexistent_local_time" },
      { code: "no_suitable_table", partySize: 9 },
      { code: "before_earliest", earliest: "2026-12-04T17:00:00.000Z" },
      { code: "after_latest_date", latestLocalDate: "2026-12-04" },
      { code: "no_free_table", suitableTables: 4 },
      PACING,
      { ...PACING, scope: "service" },
    ];
    for (const t of [en, es, fr]) {
      for (const reason of reasons) {
        const text = reasonText(reason, removed(reason), t, format);
        expect(text).not.toMatch(/availabilityExplain|\{\{/);
      }
    }
  });
});

describe("summaryText", () => {
  it("counts bookable times and names the most common reason", () => {
    const times = [at(1020), removed(PACING, 1080), removed(PACING, 1140)];
    expect(summaryText(times, 2, en)).toBe(
      "1 time bookable for a party of 2. The most common reason times are missing is pacing."
    );
  });

  it("stops at the count when nothing was removed", () => {
    expect(summaryText([at(1020), at(1080)], 4, en)).toBe("2 times bookable for a party of 4.");
  });
});

describe("commonReasonCode", () => {
  it("is the reason most removed times share, first seen on a tie", () => {
    const closure: TraceReason = { code: "nonexistent_local_time" };
    expect(commonReasonCode([removed(closure), removed(PACING), removed(PACING)])).toBe("pacing");
    expect(commonReasonCode([removed(closure), removed(PACING)])).toBe("nonexistent_local_time");
    expect(commonReasonCode([at(1020)])).toBeNull();
  });
});

describe("groupByService", () => {
  it("groups in the order the trace lists the services", () => {
    const lunch = at(720, { serviceId: "svc-lunch", serviceName: "Lunch" });
    const groups = groupByService([lunch, at(1020), at(1080)]);
    expect(groups.map((g) => [g.serviceName, g.times.length])).toEqual([
      ["Lunch", 1],
      ["Dinner", 2],
    ]);
  });
});

describe("destinations", () => {
  it("sends each reason to the screen that edits its rule", () => {
    expect(destinationOf(PACING)).toBe("bookingRules");
    expect(destinationOf({ code: "booking_paused", channel: "online" })).toBe("closures");
    expect(destinationOf({ code: "no_free_table", suitableTables: 1 })).toBe("floorPlan");
    expect(destinationOf({ code: "channel_not_offered", channel: "phone" })).toBe("regularHours");
  });

  it("builds the address through the Availability address module", () => {
    const time = { serviceId: "svc-dinner" };
    expect(destinationPath("bookingRules", time, "2026-12-04")).toBe("/availability/booking-rules");
    expect(destinationPath("closures", time, "2026-12-04")).toBe("/availability/closures");
    expect(destinationPath("regularHours", time, "2026-12-04")).toBe(
      "/availability/hours?service=svc-dinner"
    );
    expect(destinationPath("calendar", time, "2026-12-04")).toBe(
      "/availability/calendar?date=2026-12-04"
    );
    expect(destinationPath("floorPlan", time, "2026-12-04")).toBe("/availability/floor-plans");
  });
});
