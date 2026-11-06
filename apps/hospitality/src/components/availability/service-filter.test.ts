import { describe, it, expect } from "vitest";
import type { AvailabilityConfig, AvailabilityDaySummary } from "@mbe/types";
import { filterDaySummary, filterableServices, resolveServiceFilter } from "./service-filter.js";

const OPEN = { online: true, phone: true, waitlist: true };
const LUNCH = {
  venueServiceId: "lunch",
  name: "Lunch",
  opensAt: 690,
  lastSeatingAt: 810,
  closesAt: 870,
};
const DINNER = {
  venueServiceId: "dinner",
  name: "Dinner",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1380,
};

function day(overrides: Partial<AvailabilityDaySummary> = {}): AvailabilityDaySummary {
  return {
    serviceDate: "2026-10-30",
    label: "Weekend",
    scheduleId: "s1",
    serviceCount: 2,
    closures: [],
    bookingOpen: OPEN,
    services: [LUNCH, DINNER],
    ...overrides,
  };
}

const venueServices = (
  ...rows: Array<{ id: string; name: string; position: number; archivedAt?: string | null }>
) => ({ venueServices: rows }) as unknown as AvailabilityConfig;

describe("filterableServices", () => {
  it("lists the active services in position order when there are two or more", () => {
    const config = venueServices(
      { id: "dinner", name: "Dinner", position: 1 },
      { id: "lunch", name: "Lunch", position: 0 },
      { id: "old", name: "Brunch", position: 2, archivedAt: "2026-01-01T00:00:00Z" }
    );
    expect(filterableServices(config)).toEqual([
      { id: "lunch", name: "Lunch" },
      { id: "dinner", name: "Dinner" },
    ]);
  });

  it("offers nothing to a venue with one service, or an archived second one", () => {
    expect(filterableServices(venueServices({ id: "a", name: "Dinner", position: 0 }))).toEqual([]);
    expect(
      filterableServices(
        venueServices(
          { id: "a", name: "Dinner", position: 0 },
          { id: "b", name: "Lunch", position: 1, archivedAt: "2026-01-01T00:00:00Z" }
        )
      )
    ).toEqual([]);
  });
});

describe("resolveServiceFilter", () => {
  const services = [
    { id: "lunch", name: "Lunch" },
    { id: "dinner", name: "Dinner" },
  ];
  it("finds the chosen service", () => {
    expect(resolveServiceFilter(services, "dinner")).toEqual({ id: "dinner", name: "Dinner" });
  });
  it("is null for All, or a service the venue no longer lists", () => {
    expect(resolveServiceFilter(services, null)).toBeNull();
    expect(resolveServiceFilter(services, "gone")).toBeNull();
    expect(resolveServiceFilter([], "dinner")).toBeNull();
  });
});

describe("filterDaySummary", () => {
  it("keeps one service and recounts", () => {
    const out = filterDaySummary(day(), "dinner");
    expect(out.services).toEqual([DINNER]);
    expect(out.serviceCount).toBe(1);
  });

  it("drops a service closure that falls outside the service, keeps one that overlaps", () => {
    const lunchClosure = { ruleId: "r1", targetKind: "service" as const, from: 700, to: 800 };
    const lateClosure = { ruleId: "r2", targetKind: "service" as const, from: 1300, to: 1380 };
    const input = day({ closures: [lunchClosure, lateClosure] });
    expect(filterDaySummary(input, "lunch").closures).toEqual([lunchClosure]);
    expect(filterDaySummary(input, "dinner").closures).toEqual([lateClosure]);
  });

  it("keeps a whole-day closure on every service", () => {
    const whole = { ruleId: "r3", targetKind: "booking" as const, from: 0, to: 2880 };
    expect(filterDaySummary(day({ closures: [whole] }), "lunch").closures).toEqual([whole]);
  });

  it("empties a day the service does not run, closures included", () => {
    const input = day({
      services: [LUNCH],
      serviceCount: 1,
      closures: [{ ruleId: "r1", targetKind: "service", from: 700, to: 800 }],
    });
    const out = filterDaySummary(input, "dinner");
    expect(out.services).toEqual([]);
    expect(out.serviceCount).toBe(0);
    expect(out.closures).toEqual([]);
  });

  it("leaves a day from an older API, which sends no service lines, as it is", () => {
    const input = day({ services: undefined });
    expect(filterDaySummary(input, "dinner")).toBe(input);
  });

  it("does not change its input", () => {
    const input = day();
    filterDaySummary(input, "dinner");
    expect(input.services).toEqual([LUNCH, DINNER]);
    expect(input.serviceCount).toBe(2);
  });
});
