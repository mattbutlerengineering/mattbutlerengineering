import { describe, expect, it } from "vitest";
import { addDays, decodeWeek, encodeWeek, resolveDay, validateConfig } from "@mbe/availability";
import { DEMO_WEEK_CONFIG, DEMO_WEEK_MONDAY, DEMO_WEEK_TZ } from "./demo-week.fixture.js";

const snapshot = { timezone: DEMO_WEEK_TZ, config: DEMO_WEEK_CONFIG };
const servicesOn = (offset: number) =>
  resolveDay(snapshot, addDays(DEMO_WEEK_MONDAY, offset)).services.map((s) => s.venueServiceId);

describe("DEMO_WEEK_CONFIG", () => {
  it("is a valid config", () => {
    expect(validateConfig(DEMO_WEEK_CONFIG)).toEqual([]);
  });

  it("resolves Monday with Lunch and no Dinner", () => {
    expect(servicesOn(0)).toEqual(["demo-lunch"]);
  });

  it("resolves each other weekday to the services the demo describes", () => {
    expect(servicesOn(1)).toEqual(["demo-lunch", "demo-dinner"]); // Tue
    expect(servicesOn(4)).toEqual(["demo-lunch", "demo-dinner"]); // Fri
    expect(servicesOn(5)).toEqual(["demo-brunch", "demo-dinner"]); // Sat
    expect(servicesOn(6)).toEqual(["demo-brunch", "demo-dinner"]); // Sun
  });

  it("gives Dinner a later close on Friday and Saturday only", () => {
    const closes = [0, 1, 2, 3, 4, 5, 6].map((offset) => {
      const dinner = resolveDay(snapshot, addDays(DEMO_WEEK_MONDAY, offset)).services.find(
        (s) => s.venueServiceId === "demo-dinner"
      );
      return dinner?.closesAt ?? null;
    });
    expect(closes).toEqual([null, 1380, 1380, 1380, 1440, 1440, 1380]);
  });

  it("is the canonical encoding of its own week", () => {
    const days = [0, 1, 2, 3, 4, 5, 6];
    const encoded = encodeWeek(decodeWeek(DEMO_WEEK_CONFIG.scheduleServices, days), days);
    expect(encoded).toEqual(
      DEMO_WEEK_CONFIG.scheduleServices.map(({ id: _id, scheduleId: _schedule, ...row }) => row)
    );
  });
});
