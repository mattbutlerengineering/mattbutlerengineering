import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { dateAnswer } from "./date-answer.js";
import { dateSentence } from "./date-sentence.js";
import {
  TEXT,
  TODAY,
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
