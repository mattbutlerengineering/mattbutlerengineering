import { describe, it, expect } from "vitest";
import type { DateRule } from "@mbe/types";
import {
  fixtureConfig,
  EARLY_DINNER,
  PARTY_CLOSURE,
  FIXTURE_DATE,
} from "./resolved-day-fixtures.js";
import {
  buildClearChanges,
  buildUseScheduleChanges,
  buildUseDayHoursChanges,
  ownSingleDateRules,
} from "./selection-actions.js";

const OTHER = "2026-10-31";
const ids = () => {
  let n = 0;
  return () => `new-${n++}`;
};

describe("ownSingleDateRules", () => {
  it("finds the venue's own one-date hours rules among the dates, not closures", () => {
    const config = fixtureConfig(EARLY_DINNER, PARTY_CLOSURE);
    expect(ownSingleDateRules(config, [FIXTURE_DATE, OTHER]).map((r) => r.id)).toEqual([
      "r-special",
    ]);
    expect(ownSingleDateRules(config, [OTHER])).toEqual([]);
  });

  it("leaves a range rule alone, since removing it would change other dates", () => {
    const range: DateRule = { ...EARLY_DINNER, id: "r-range", endsOn: OTHER };
    expect(ownSingleDateRules(fixtureConfig(range), [FIXTURE_DATE])).toEqual([]);
  });
});

describe("buildClearChanges", () => {
  it("removes only the own hours rules", () => {
    const config = fixtureConfig(EARLY_DINNER, PARTY_CLOSURE);
    expect(buildClearChanges(config, [FIXTURE_DATE])).toEqual({
      upsert: {},
      remove: { dateRules: ["r-special"] },
    });
  });
});

describe("buildUseScheduleChanges", () => {
  it("adds a use_schedule rule per date and replaces an existing own rule", () => {
    const config = fixtureConfig(EARLY_DINNER);
    const changes = buildUseScheduleChanges(config, [FIXTURE_DATE, OTHER], "regular", ids());
    expect(changes.remove.dateRules).toEqual(["r-special"]);
    expect(changes.upsert.dateRules).toMatchObject([
      {
        id: "new-0",
        kind: "use_schedule",
        useScheduleId: "regular",
        startsOn: FIXTURE_DATE,
        endsOn: FIXTURE_DATE,
        targetKind: "venue",
      },
      { id: "new-1", kind: "use_schedule", useScheduleId: "regular", startsOn: OTHER },
    ]);
  });
});

describe("buildUseDayHoursChanges", () => {
  it("writes the given services as special hours on each date, replacing own rules", () => {
    const config = fixtureConfig(EARLY_DINNER);
    const changes = buildUseDayHoursChanges({
      config,
      services: [
        {
          key: "vs-lunch",
          venueServiceId: "vs-lunch",
          scheduleServiceId: null,
          name: "Lunch",
          opensAt: 690,
          lastSeatingAt: 840,
          closesAt: 900,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ],
      dates: [FIXTURE_DATE, OTHER],
      makeId: ids(),
    });
    expect(changes.remove.dateRules).toEqual(["r-special"]);
    expect(changes.upsert.dateRules).toHaveLength(2);
    expect(changes.upsert.dateRules?.map((r) => r.id)).not.toContain("r-special");
  });
});
