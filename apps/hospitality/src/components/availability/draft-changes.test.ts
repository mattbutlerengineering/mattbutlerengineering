import { describe, it, expect } from "vitest";
import { PutAvailabilityConfigBodySchema } from "@mbe/types";
import type { DateRule } from "@mbe/types";
import {
  buildDraftChanges,
  seedServices,
  servicesEqual,
  type DraftService,
  type EditScope,
} from "./draft-changes.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

const DATE_SCOPE: EditScope = { kind: "date", date: FIXTURE_DATE };

function seeded(scope: EditScope = DATE_SCOPE, ...rules: DateRule[]) {
  const config = fixtureConfig(...rules);
  const day = resolveFixtureDay(...rules);
  return { config, services: seedServices(config, day, scope) };
}

/** The envelope a save sends must satisfy the wire contract. */
function parses(changes: unknown) {
  return PutAvailabilityConfigBodySchema.safeParse({ expectedVersion: 1, changes }).success;
}

describe("seedServices", () => {
  it("copies the resolved day's services for a date scope", () => {
    const { services } = seeded();
    expect(services.map((s) => [s.name, s.opensAt, s.closesAt])).toEqual([
      ["Lunch", 690, 900],
      ["Dinner", 1020, 1380],
    ]);
    expect(services.every((s) => s.venueServiceId !== null)).toBe(true);
  });

  it("copies the schedule's own services for a schedule scope, not the day's special hours", () => {
    const { services } = seeded({ kind: "schedule", scheduleId: "regular" }, EARLY_DINNER);
    expect(services.find((s) => s.name === "Dinner")?.closesAt).toBe(1380);
  });
});

describe("buildDraftChanges", () => {
  it("this date only: upserts one single-date special-hours rule", () => {
    const { config, services } = seeded();
    const edited = services.map((s) => (s.name === "Dinner" ? { ...s, closesAt: 1320 } : s));
    const changes = buildDraftChanges({
      config,
      scope: DATE_SCOPE,
      services: edited,
      makeId: counter(),
    });

    expect(changes.remove).toEqual({});
    expect(changes.upsert.scheduleServices).toBeUndefined();
    const [rule] = changes.upsert.dateRules ?? [];
    expect(rule).toMatchObject({
      id: "new-1",
      kind: "special_hours",
      targetKind: "venue",
      startsOn: FIXTURE_DATE,
      endsOn: FIXTURE_DATE,
    });
    expect(rule?.kind === "special_hours" && rule.payload.services).toHaveLength(2);
    expect(
      rule?.kind === "special_hours" &&
        rule.payload.services.find((s) => s.venueServiceId === "vs-dinner")?.closesAt
    ).toBe(1320);
    expect(parses(changes)).toBe(true);
  });

  it("this date only: edits the date's own special-hours rule in place", () => {
    const { config, services } = seeded(DATE_SCOPE, EARLY_DINNER);
    const changes = buildDraftChanges({ config, scope: DATE_SCOPE, services, makeId: counter() });
    expect(changes.upsert.dateRules).toHaveLength(1);
    expect(changes.upsert.dateRules?.[0]?.id).toBe(EARLY_DINNER.id);
  });

  it("selected dates: one single-date special-hours rule per date, like this date only", () => {
    const { config, services } = seeded();
    const dates = ["2026-10-30", "2026-11-02", "2026-11-05"];
    const changes = buildDraftChanges({
      config,
      scope: { kind: "dates", dates },
      services,
      makeId: counter(),
    });
    const rules = changes.upsert.dateRules ?? [];
    expect(rules.map((r) => [r.startsOn, r.endsOn, r.kind])).toEqual(
      dates.map((d) => [d, d, "special_hours"])
    );
    expect(new Set(rules.map((r) => r.id)).size).toBe(3);
    expect(changes.remove).toEqual({});
    expect(parses(changes)).toBe(true);
  });

  it("every Friday from a date: one repeating rule from that date, open-ended or until a date", () => {
    const { config, services } = seeded();
    const open = buildDraftChanges({
      config,
      scope: { kind: "weekday", from: FIXTURE_DATE, until: null },
      services,
      makeId: counter(),
    });
    expect(open.upsert.dateRules?.[0]).toMatchObject({
      kind: "special_hours",
      startsOn: FIXTURE_DATE,
      endsOn: null,
      repeat: { version: 1, weekdays: [5] },
    });
    const bounded = buildDraftChanges({
      config,
      scope: { kind: "weekday", from: FIXTURE_DATE, until: "2026-12-25" },
      services,
      makeId: counter(),
    });
    expect(bounded.upsert.dateRules?.[0]).toMatchObject({ endsOn: "2026-12-25" });
    expect(parses(open) && parses(bounded)).toBe(true);
  });

  it("everywhere a schedule is used: rewrites the schedule's services and drops removed ones", () => {
    const { config, services } = seeded({ kind: "schedule", scheduleId: "regular" });
    const edited = services
      .filter((s) => s.name !== "Lunch")
      .map((s) => ({ ...s, lastSeatingAt: 1230 }));
    const changes = buildDraftChanges({
      config,
      scope: { kind: "schedule", scheduleId: "regular" },
      services: edited,
      makeId: counter(),
    });
    expect(changes.upsert.dateRules).toBeUndefined();
    expect(changes.upsert.scheduleServices).toEqual([
      expect.objectContaining({
        id: "ss-dinner",
        scheduleId: "regular",
        venueServiceId: "vs-dinner",
        lastSeatingAt: 1230,
      }),
    ]);
    expect(changes.remove.scheduleServices).toEqual(["ss-lunch"]);
    expect(parses(changes)).toBe(true);
  });

  it("creates a venue service for a service the venue has not had before", () => {
    const { config, services } = seeded();
    const brunch: DraftService = {
      key: "k",
      venueServiceId: null,
      scheduleServiceId: null,
      name: "Brunch",
      opensAt: 540,
      lastSeatingAt: 600,
      closesAt: 660,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online", "phone"],
    };
    const changes = buildDraftChanges({
      config,
      scope: DATE_SCOPE,
      services: [brunch, ...services],
      makeId: counter(),
    });
    expect(changes.upsert.venueServices).toEqual([{ id: "new-1", name: "Brunch", position: 2 }]);
    const rule = changes.upsert.dateRules?.[0];
    expect(rule?.kind === "special_hours" && rule.payload.services[0]?.venueServiceId).toBe(
      "new-1"
    );
  });
});

describe("servicesEqual", () => {
  it("ignores row keys but sees an edited time", () => {
    const { services } = seeded();
    expect(
      servicesEqual(
        services,
        services.map((s) => ({ ...s, key: "other" }))
      )
    ).toBe(true);
    expect(
      servicesEqual(
        services,
        services.map((s) => ({ ...s, opensAt: s.opensAt + 15 }))
      )
    ).toBe(false);
  });
});
