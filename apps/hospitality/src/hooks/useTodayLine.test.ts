import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  staff: {} as unknown,
  sections: { data: [] as unknown },
  now: new Date("2026-11-08T20:00:00Z"),
}));

vi.mock("./useStaffTonight.js", () => ({ useStaffTonight: () => mocks.staff }));
vi.mock("./useFloorPlans.js", () => ({ useVenueFloorPlanSections: () => mocks.sections }));
vi.mock("./useNow.js", () => ({ useNow: () => mocks.now }));

import { useTodayLine } from "./useTodayLine.js";

const SUMMARY = {
  serviceDate: "2026-11-08",
  label: "Regular week",
  scheduleId: "s1",
  serviceCount: 1,
  closures: [{ ruleId: "c1", targetKind: "tables", sectionId: "sec-1", from: 0, to: 2880 }],
  bookingOpen: { online: true, phone: true, waitlist: true },
  services: [
    { venueServiceId: "vs-d", name: "Dinner", opensAt: 1020, lastSeatingAt: 1260, closesAt: 1320 },
  ],
};

function staff(over: Record<string, unknown> = {}) {
  return {
    serviceDate: "2026-11-08",
    config: { venueServices: [{ id: "vs-d", name: "Dinner" }] },
    rules: [{ id: "c1", kind: "closure", targetKind: "tables", startsOn: "2026-11-08" }],
    summary: SUMMARY,
    readStatus: "ready",
    refetch: vi.fn(),
    ...over,
  };
}

describe("useTodayLine", () => {
  beforeEach(() => {
    mocks.staff = staff();
    mocks.sections = { data: [{ id: "sec-1", name: "Patio" }] };
  });

  it("is ready with the model, naming sections from the floor plan", () => {
    const { result } = renderHook(() => useTodayLine("v1", false));
    expect(result.current.status).toBe("ready");
    expect(result.current.model?.hours).toEqual([
      { name: "Dinner", opensAt: 1020, closesAt: 1320 },
    ]);
    expect(result.current.model?.items).toEqual([{ kind: "serviceClosed", name: "Patio" }]);
  });

  it("is loading with no model until the day has arrived", () => {
    mocks.staff = staff({ summary: null, readStatus: "loading" });
    const { result } = renderHook(() => useTodayLine("v1", false));
    expect(result.current).toMatchObject({ status: "loading", model: null });
  });

  it("is error with no model when the read failed, and retry refetches", () => {
    const refetch = vi.fn();
    mocks.staff = staff({ summary: null, readStatus: "error", refetch });
    const { result } = renderHook(() => useTodayLine("v1", false));
    expect(result.current).toMatchObject({ status: "error", model: null });
    result.current.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("passes the banner flag through, so the line leaves online out", () => {
    mocks.staff = staff({
      summary: {
        ...SUMMARY,
        closures: [
          { ruleId: "c1", targetKind: "booking", bookingTypes: ["online"], from: 0, to: 2880 },
        ],
      },
    });
    expect(renderHook(() => useTodayLine("v1", false)).result.current.model?.items).toHaveLength(1);
    expect(renderHook(() => useTodayLine("v1", true)).result.current.model?.items).toEqual([]);
  });
});
