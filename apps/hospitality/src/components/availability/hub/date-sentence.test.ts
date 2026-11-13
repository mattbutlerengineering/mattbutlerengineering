import { beforeAll, describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import type { VenueFormat } from "../../../hooks/useVenueFormat.js";
import esMX from "../../../i18n/catalogs/es-MX.json";
import { localeRuntime } from "../../../i18n/runtime.js";
import { formatCalendarDate, formatLocalTime } from "../../../utils/format.js";
import { dateAnswer } from "./date-answer.js";
import { dateSentence } from "./date-sentence.js";
import type { HubTextContext } from "./hub-text.js";
import {
  TEXT,
  TODAY,
  lunchAndDinner,
  rule,
  seasonal,
  specialHours,
  venue,
  window,
} from "./hub-rows-test-helpers.js";

const TIMEZONE = "America/Los_Angeles";

function sentence(config: AvailabilityConfig, date: string): string {
  const answer = dateAnswer(config, TIMEZONE, date);
  if (!answer) throw new Error("expected an answer");
  return dateSentence(answer, TEXT);
}

const WINTER = seasonal("winter", "Winter hours", {
  startsOn: "2026-12-01",
  endsOn: "2027-02-28",
});

describe("dateSentence", () => {
  it("reads regular hours alone, with no rule beneath", () => {
    expect(sentence(venue(), "2026-12-24")).toBe(
      "Thu, Dec 24: Dinner 5:00 PM–10:00 PM. Decided by your regular hours."
    );
  });

  it("names seasonal hours by their name, over regular hours", () => {
    expect(sentence(venue([], WINTER), "2026-12-24")).toBe(
      "Thu, Dec 24: Dinner 5:00 PM–11:00 PM. Decided by Winter hours, which wins over your regular hours."
    );
  });

  it("reads a special date over regular hours (the hub sketch)", () => {
    expect(sentence(venue([specialHours("r-special", "2026-12-24")]), "2026-12-24")).toBe(
      "Thu, Dec 24: Dinner 4:00 PM–8:00 PM. Decided by your special date, which wins over your regular hours."
    );
  });

  it("reads a closure from a time over a special date (walkthrough 7)", () => {
    const config = venue(
      [
        specialHours("r-special", "2026-12-24"),
        rule("r-close", { startsOn: "2026-12-24", endsOn: "2026-12-24", window: window(1080) }),
      ],
      WINTER
    );
    expect(sentence(config, "2026-12-24")).toBe(
      "Thu, Dec 24: Dinner 4:00 PM–8:00 PM, closed from 6:00 PM. Decided by a closure, which wins over your special date."
    );
  });

  it("reads a whole-day closure as closed", () => {
    const config = venue([rule("r-close", { startsOn: "2026-11-26", endsOn: "2026-11-26" })]);
    expect(sentence(config, "2026-11-26")).toBe(
      "Thu, Nov 26: closed. Decided by a closure, which wins over your regular hours."
    );
  });

  it("reads a closure for part of the day between its times", () => {
    const config = venue([
      rule("r-close", { startsOn: "2026-12-24", endsOn: "2026-12-24", window: window(1080, 1140) }),
    ]);
    expect(sentence(config, "2026-12-24")).toContain(
      "Dinner 5:00 PM–10:00 PM, closed 6:00 PM–7:00 PM."
    );
  });

  it("reads a change made for tonight", () => {
    const early = rule("r-tonight", {
      kind: "tonight",
      payload: { version: 1, closeAt: 1260 },
    } as never);
    expect(sentence(venue([early]), TODAY)).toMatch(/Decided by a change made for tonight/);
  });

  it("says no hours cover a date no rule covers", () => {
    expect(sentence(venue(), "2025-12-24")).toBe("Wed, Dec 24: closed. No hours cover this date.");
  });
});

const DEC_24 = "2026-12-24";
const onDec24 = { startsOn: DEC_24, endsOn: DEC_24 };
const dinnerOnly = { targetKind: "service", venueServiceId: "vs-dinner" } as const;

describe("dateSentence: a closure of one service for part of the day", () => {
  it("names the service it closes, from its time", () => {
    const config = lunchAndDinner([
      rule("r-dinner", { ...onDec24, ...dinnerOnly, window: window(1080) }),
    ]);
    expect(sentence(config, DEC_24)).toBe(
      "Thu, Dec 24: Lunch 11:30 AM–3:00 PM, Dinner 5:00 PM–10:00 PM, Dinner closed from 6:00 PM. Decided by a closure, which wins over your regular hours."
    );
  });

  it("names the service it closes, between its times", () => {
    const config = lunchAndDinner([
      rule("r-dinner", { ...onDec24, ...dinnerOnly, window: window(1080, 1140) }),
    ]);
    expect(sentence(config, DEC_24)).toContain(
      "Dinner 5:00 PM–10:00 PM, Dinner closed 6:00 PM–7:00 PM."
    );
  });

  it("reads closed when two closures take the only service between them", () => {
    const config = venue([
      rule("r-first", { ...onDec24, ...dinnerOnly, window: window(960, 1140) }),
      rule("r-second", { ...onDec24, ...dinnerOnly, window: window(1140) }),
    ]);
    expect(sentence(config, DEC_24)).toBe(
      "Thu, Dec 24: closed. Decided by a closure, which wins over your regular hours."
    );
  });

  it("reads a tonight stop and a closure from a time on the same date", () => {
    const stop = rule("r-stop", {
      kind: "tonight",
      payload: { version: 1, stop: { from: 1260, to: 2880 } },
    } as never);
    const config = lunchAndDinner([
      rule("r-dinner", { ...dinnerOnly, window: window(1080) }),
      stop,
    ]);
    expect(sentence(config, TODAY)).toBe(
      "Thu, Nov 12: Lunch 11:30 AM–3:00 PM, Dinner 5:00 PM–10:00 PM, Dinner closed 6:00 PM–9:00 PM, closed from 9:00 PM. Decided by a change made for tonight, which wins over a closure."
    );
  });
});

describe("dateSentence: two venue-wide closures on one date", () => {
  it("reads closed when two that meet cover the whole service", () => {
    const config = venue([
      rule("r-first", { ...onDec24, window: window(960, 1140) }),
      rule("r-second", { ...onDec24, window: window(1140) }),
    ]);
    expect(sentence(config, DEC_24)).toBe(
      "Thu, Dec 24: closed. Decided by a closure, which wins over your regular hours."
    );
  });

  it("names every band that cuts the open hours, in order", () => {
    const config = venue([
      rule("r-early", { ...onDec24, window: window(1050, 1080) }),
      rule("r-late", { ...onDec24, window: window(1200) }),
    ]);
    expect(sentence(config, DEC_24)).toContain(
      "Dinner 5:00 PM–10:00 PM, closed 5:30 PM–6:00 PM, closed from 8:00 PM."
    );
  });
});

describe("dateSentence: in es-MX", () => {
  beforeAll(() => {
    localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
  });
  const ES: HubTextContext = {
    t: localeRuntime.i18n.getFixedT("es-MX"),
    format: {
      locale: "es-MX",
      formatCalendarDate: (date: string, options: Intl.DateTimeFormatOptions) =>
        formatCalendarDate(date, options, "es-MX"),
      formatLocalTime: (hhmm: string) => formatLocalTime(hhmm, "es-MX"),
    } as VenueFormat,
  };

  it("ends a clause that ends in a time with one period, not two", () => {
    const answer = dateAnswer(venue(), TIMEZONE, DEC_24);
    if (!answer) throw new Error("expected an answer");
    const text = dateSentence(answer, ES);
    expect(text).toMatch(/p\.\s?m\. Lo decide/);
    expect(text).not.toContain("..");
  });
});
