import { describe, expect, it } from "vitest";
import type { ClosedByRule, ClosureOverlap } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { defaultT } from "../../i18n/default-t.js";
import { formatCalendarDate, formatLocalTime } from "../../utils/format.js";
import { overlapLines } from "./closure-overlap-text.js";

const FORMAT = {
  locale: "en-US",
  formatCalendarDate: (date: string, options: Intl.DateTimeFormatOptions) =>
    formatCalendarDate(date, options, "en-US"),
  formatLocalTime: (hhmm: string) => formatLocalTime(hhmm, "en-US"),
} as VenueFormat;

const DEC_24 = "2026-12-24";
const FROM_SIX = { version: 1 as const, from: 18 * 60, to: 2880 };

function line(by: Partial<ClosedByRule>): string {
  const rule: ClosedByRule = {
    ruleId: "r",
    targetKind: "venue",
    startsOn: DEC_24,
    endsOn: DEC_24,
    dates: [DEC_24],
    ...by,
  };
  const overlap: ClosureOverlap = { everyDate: true, by: [rule] };
  return overlapLines(overlap, "already", [], defaultT, FORMAT)[0]!;
}

describe("overlapLines: a closure from a time (#9930)", () => {
  it("says a venue closure from a time closes early", () => {
    expect(line({ window: FROM_SIX })).toBe(
      "Already closed on Thu, Dec 24: Whole venue · Closing early · 6:00 PM."
    );
  });

  it("says a service or tables closure from a time closes early", () => {
    expect(line({ targetKind: "service", venueServiceId: "gone", window: FROM_SIX })).toBe(
      "Already closed on Thu, Dec 24: A service · Closing early · 6:00 PM."
    );
    expect(line({ targetKind: "tables", window: FROM_SIX })).toBe(
      "Already closed on Thu, Dec 24: Some tables · Closing early · 6:00 PM."
    );
  });

  it("keeps From for a booking pause from a time", () => {
    expect(line({ targetKind: "booking", bookingTypes: ["online"], window: FROM_SIX })).toBe(
      "Already closed on Thu, Dec 24: Booking: Online · From 6:00 PM."
    );
  });
});
