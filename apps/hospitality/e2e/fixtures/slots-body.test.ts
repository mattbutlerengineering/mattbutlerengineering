import { describe, expect, it } from "vitest";
import { buildSlotsBody } from "../api-mocks.js";

// The public venue config keeps the fixture venue's zone; the booking widget groups by it.
const VENUE_TZ = "America/New_York";
const NOW = new Date("2026-06-15T17:30:00Z");

const venueDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: VENUE_TZ });
const slotsOn = (day: string) =>
  (JSON.parse(buildSlotsBody(NOW, day)) as { data: { time: string }[] }).data;

describe("buildSlotsBody re-dates the slots onto the picked day", () => {
  it.each([
    ["a summer (EDT) day", "2026-07-04"],
    ["a winter (EST) day", "2026-12-01"],
  ])("on %s, puts same-day slots on the day and one slot past venue midnight", (_, day) => {
    const days = slotsOn(day).map((slot) => venueDay(slot.time));
    const nextDay = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(days.filter((d) => d === day).length).toBeGreaterThan(1);
    expect(days.filter((d) => d === nextDay)).toHaveLength(1);
    expect(days.every((d) => d === day || d === nextDay)).toBe(true);
  });

  it("keeps each slot's time offset from the start of the day", () => {
    const anchor = slotsOn("2026-05-17").map((slot) => slot.time.slice(11));
    const moved = slotsOn("2026-07-04").map((slot) => slot.time.slice(11));
    expect(moved).toEqual(anchor);
  });

  it("defaults to the next 17 May, the day the change-booking spec's reservation is on", () => {
    expect(buildSlotsBody(NOW)).toBe(buildSlotsBody(NOW, "2027-05-17"));
  });
});
