import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import type { HubRowsInput } from "./hub-rows.js";
import { hubRowTexts } from "./hub-row-text.js";
import {
  EVERY_DAY,
  TEXT,
  THURSDAYS,
  TODAY,
  dinnerRow,
  rowsOf,
  rule,
  seasonal,
  specialHours,
  venue,
  window,
} from "./hub-rows-test-helpers.js";

/** The lines of one row, as the hub prints them in en-US. */
function lines(row: 1 | 2 | 3 | 4 | 5, config: AvailabilityConfig, rest?: Partial<HubRowsInput>) {
  const text = hubRowTexts(rowsOf(config, rest), TODAY, TEXT).find((r) => r.row === row);
  return text?.lines.map((line) => line.text);
}

describe("hubRowTexts", () => {
  it("names the five rows in the order they win", () => {
    expect(hubRowTexts(rowsOf(venue()), TODAY, TEXT).map((r) => r.title)).toEqual([
      "Regular hours",
      "Seasonal hours",
      "Special dates and holidays",
      "Closures and pauses",
      "Booking rules",
    ]);
  });

  it("gives every row its empty sentence, never an empty row", () => {
    const empty = { ...venue(), scheduleServices: [] };
    expect(lines(1, empty)).toEqual(["No regular hours yet"]);
    expect(lines(2, venue())).toEqual(["None"]);
    expect(lines(3, venue())).toEqual(["No special dates."]);
    expect(lines(4, venue())).toEqual(["None"]);
    expect(lines(5, venue())).toEqual(["Not set up yet"]);
  });

  describe("row 1, regular hours", () => {
    it("lists each service with its hours and days, and says which service a line is", () => {
      const [regular] = hubRowTexts(rowsOf(venue()), TODAY, TEXT);
      expect(regular?.lines).toEqual([
        {
          text: "Dinner 5:00 PM–10:00 PM, last seating 9:00 PM every day",
          venueServiceId: "vs-dinner",
        },
      ]);
    });

    it("adds a change saved for a later date", () => {
      const later = {
        schedules: [
          { id: "regular-2", name: "Regular", kind: "regular" as const, isRegular: false },
        ],
        scheduleServices: [dinnerRow("regular-2", 1380)],
        assignments: [
          {
            id: "as-regular-2",
            scheduleId: "regular-2",
            weekdays: EVERY_DAY,
            startsOn: "2027-01-04",
            precedence: 1,
          },
        ],
      };
      expect(lines(1, venue([], later))).toEqual([
        "Dinner 5:00 PM–10:00 PM, last seating 9:00 PM every day",
        "From Jan 4: Dinner 5:00 PM–11:00 PM, last seating 10:00 PM every day",
      ]);
    });
  });

  describe("row 2, seasonal hours", () => {
    it("says where each set applies: a range, weekdays with no dates, from, until", () => {
      const config = venue(
        [],
        seasonal("summer", "Summer hours", { startsOn: "2026-06-01", endsOn: "2026-09-15" }),
        seasonal("weeknights", "Weeknights", { weekdays: [1, 2, 3, 4], precedence: 2 }),
        seasonal("winter", "Winter", { startsOn: "2026-12-01", precedence: 3 })
      );
      expect(lines(2, config)).toEqual([
        "Summer hours: Jun 1–Sep 15, every day",
        "Weeknights: Mon–Thu, no end date",
        "Winter: from Dec 1, every day",
      ]);
      expect(lines(2, venue([], seasonal("spring", "Spring", { endsOn: "2027-03-01" })))).toEqual([
        "Spring: until Mar 1, every day",
      ]);
    });

    it("lists three sets and counts the rest", () => {
      const sets = ["a", "b", "c", "d"].map((id, index) =>
        seasonal(id, id.toUpperCase(), { precedence: index + 1 })
      );
      expect(lines(2, venue([], ...sets))?.at(-1)).toBe("and 1 more");
    });

    it("says when a set is not used, or only by special dates", () => {
      expect(lines(2, venue([], seasonal("late", "Late night")))).toEqual([
        "Late night: not used yet",
      ]);
      const used = venue(
        [rule("r-use", { kind: "use_schedule", useScheduleId: "late" })],
        seasonal("late", "Late night")
      );
      expect(lines(2, used)).toEqual(["Late night: used on 1 special date"]);
    });
  });

  describe("row 3, special dates and holidays", () => {
    it("lists the next two with what each is, then the holidays not planned", () => {
      const config = venue([
        rule("r-closed", { startsOn: "2026-11-26", endsOn: "2026-11-26" }),
        specialHours("r-special", "2026-12-24"),
      ]);
      const holidays = Array.from({ length: 3 }, () => ({ state: { kind: "undecided" } as const }));
      expect(lines(3, config, { holidays })).toEqual([
        "Next: Nov 26 Closed, Dec 24 Special hours",
        "3 holidays not planned",
      ]);
    });

    it("keeps the holiday count when no special date is set", () => {
      const holidays = [{ state: { kind: "undecided" } as const }];
      expect(lines(3, venue(), { holidays })).toEqual([
        "No special dates.",
        "1 holiday not planned",
      ]);
    });
  });

  describe("row 4, closures and pauses", () => {
    const pause = (rest = {}) =>
      rule("r-pause", { targetKind: "booking", bookingTypes: ["online"], ...rest });

    it("says how long an online pause lasts", () => {
      expect(lines(4, venue([pause()]))).toEqual(["Online booking paused until tonight ends"]);
      expect(lines(4, venue([pause({ endsOn: null })]))).toEqual([
        "Online booking paused until resumed",
      ]);
      expect(lines(4, venue([pause({ endsOn: "2026-11-20" })]))).toEqual([
        "Online booking paused until Nov 20",
      ]);
    });

    it("says when a pause that has not started will", () => {
      expect(lines(4, venue([pause({ window: window(1080) })]))).toEqual([
        "Online booking pauses at 6:00 PM",
      ]);
    });

    it("names a section closed until it is reopened, and never calls an unnamed one the venue", () => {
      const patio = rule("r-patio", { targetKind: "tables", sectionId: "sec-patio", endsOn: null });
      expect(lines(4, venue([patio]))).toEqual(["Patio closed until reopened"]);
      expect(lines(4, venue([patio]), { sectionNames: new Map() })).toEqual([
        "A section closed until reopened",
      ]);
    });

    it("says what is closed now, then the next closure", () => {
      const config = venue([
        rule("r-today"),
        rule("r-next", { startsOn: "2026-11-26", endsOn: "2026-11-26" }),
      ]);
      expect(lines(4, config)).toEqual(["Closed today", "Next: Nov 26 Closed"]);
    });

    it("says a repeating closure's days and end, and a part of a day", () => {
      const mondays = rule("r-mondays", {
        targetKind: "tables",
        sectionId: "sec-patio",
        startsOn: "2026-12-01",
        endsOn: "2027-03-01",
        repeat: { version: 1, weekdays: [1] },
      });
      expect(lines(4, venue([mondays]))).toEqual([
        "Next: Dec 7 Patio closed, every Mon until Mar 1",
      ]);
      const early = rule("r-early", {
        startsOn: "2026-12-24",
        endsOn: "2026-12-24",
        window: window(960),
      });
      expect(lines(4, venue([early]))).toEqual(["Next: Dec 24 Closed, from 4:00 PM"]);
      expect(lines(4, venue([rule("r-thu", { ...THURSDAYS, window: window(0, 900) })]))).toEqual([
        "Closed every Thu until Feb 28, 12:00 AM–3:00 PM",
      ]);
    });

    it("words booking channels that are off and tables that are blocked", () => {
      const phone = rule("r-phone", { targetKind: "booking", bookingTypes: ["phone", "waitlist"] });
      expect(lines(4, venue([phone]))).toEqual(["Phone booking and Waitlist off today"]);
      const tables = rule("r-tables", { targetKind: "tables", tableIds: ["t1", "t2"] });
      expect(lines(4, venue([tables]))).toEqual(["2 tables blocked today"]);
    });

    it("lists a change made for tonight", () => {
      const early = rule("r-tonight", {
        kind: "tonight",
        payload: { version: 1, closeAt: 1260 },
      } as never);
      expect(lines(4, venue([early]))).toEqual(["Closing early tonight at 9:00 PM"]);
    });
  });

  it("row 5 reads the booking rules that are set", () => {
    const settings = { maxAdvanceBooking: 60, minAdvanceBooking: 2, maxPartySize: 8 };
    expect(lines(5, venue(), { settings })).toEqual([
      "Up to 60 days ahead · 2 hours notice · parties up to 8 online",
    ]);
  });
});
