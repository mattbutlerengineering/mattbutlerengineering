import { describe, expect, it } from "vitest";
import { GUEST_MESSAGE_MAX_LENGTH } from "@mbe/types";
import { closuresRow } from "./hub/hub-closures.js";
import {
  pauseOnlineProblem,
  pauseOnlineRule,
  pauseUntilMax,
  type PauseDraft,
} from "./pause-online-draft.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const TODAY = "2026-12-01";
const draft = (over: Partial<PauseDraft> = {}): PauseDraft => ({
  choice: "tonight",
  until: "",
  guestMessage: "",
  ...over,
});
const rule = (over: Partial<PauseDraft> = {}) => pauseOnlineRule(draft(over), "id-1", TODAY);

describe("pauseOnlineRule", () => {
  it("Tonight is an online-only closure of the service date alone, all day", () => {
    expect(rule()).toEqual({
      id: "id-1",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: TODAY,
      endsOn: TODAY,
      window: null,
    });
  });

  it("Until I resume has no end", () => {
    expect(rule({ choice: "untilResume" })).toMatchObject({ startsOn: TODAY, endsOn: null });
  });

  it("Until a date runs from today through that date", () => {
    expect(rule({ choice: "untilDate", until: "2026-12-05" })).toMatchObject({
      startsOn: TODAY,
      endsOn: "2026-12-05",
    });
  });

  it("Until a date builds nothing with no date, or a date before today", () => {
    expect(rule({ choice: "untilDate" })).toBeNull();
    expect(rule({ choice: "untilDate", until: "2026-11-30" })).toBeNull();
  });

  it("ignores a date left over from another choice", () => {
    expect(rule({ choice: "tonight", until: "2026-12-05" })).toMatchObject({ endsOn: TODAY });
  });

  it("carries the guest message, trimmed, and leaves an empty one out", () => {
    expect(rule({ guestMessage: "  Back soon  " })).toMatchObject({ guestMessage: "Back soon" });
    expect(rule({ guestMessage: "   " })).not.toHaveProperty("guestMessage");
  });

  it("never repeats, so it is the pause hub row 4 names, with the end the choice gave it", () => {
    const pauseOf = (over: Partial<PauseDraft>) =>
      closuresRow({
        config: fixtureConfig(rule(over)!),
        sectionNames: new Map(),
        timezone: "America/Los_Angeles",
        today: TODAY,
        nowMinute: 12 * 60,
      }).pause;
    expect(pauseOf({})).toMatchObject({ source: "closure", inForce: true, endsOn: TODAY });
    expect(pauseOf({ choice: "untilResume" })).toMatchObject({ source: "closure", endsOn: null });
    expect(pauseOf({ choice: "untilDate", until: "2026-12-05" })).toMatchObject({
      source: "closure",
      endsOn: "2026-12-05",
    });
  });
});

describe("pauseOnlineProblem", () => {
  it("is nothing for Tonight and Until I resume", () => {
    expect(pauseOnlineProblem(draft(), TODAY)).toBeNull();
    expect(pauseOnlineProblem(draft({ choice: "untilResume" }), TODAY)).toBeNull();
  });

  it("asks for the date of Until a date", () => {
    expect(pauseOnlineProblem(draft({ choice: "untilDate" }), TODAY)).toBe("until");
    expect(
      pauseOnlineProblem(draft({ choice: "untilDate", until: "2026-12-05" }), TODAY)
    ).toBeNull();
  });

  it("refuses a guest message over the limit", () => {
    const guestMessage = "x".repeat(GUEST_MESSAGE_MAX_LENGTH + 1);
    expect(pauseOnlineProblem(draft({ guestMessage }), TODAY)).toBe("guestMessage");
  });

  it("allows an end up to 366 days out, the API's cap on a dated closure, and no further", () => {
    expect(pauseUntilMax(TODAY)).toBe("2027-12-02");
    const until = (date: string) =>
      pauseOnlineProblem(draft({ choice: "untilDate", until: date }), TODAY);
    expect(until("2027-12-02")).toBeNull();
    expect(until("2027-12-03")).toBe("until");
    expect(
      pauseOnlineRule(draft({ choice: "untilDate", until: "2027-12-03" }), "id", TODAY)
    ).toBeNull();
  });
});
