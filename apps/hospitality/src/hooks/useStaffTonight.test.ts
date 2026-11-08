import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const reads = vi.hoisted(() => ({ config: {} as unknown, days: {} as unknown }));

vi.mock("./useAvailability.js", () => ({
  useAvailabilityConfig: () => reads.config,
  useAvailabilityDays: () => reads.days,
}));
vi.mock("./useNow.js", () => ({ useNow: () => new Date("2026-11-08T20:00:00Z") }));
vi.mock("./useVenueFormat.js", () => ({
  useVenueFormat: () => ({ timeZone: "America/New_York" }),
}));
vi.mock("../utils/current-service-date.js", () => ({ currentServiceDate: () => "2026-11-08" }));

import { useStaffTonight } from "./useStaffTonight.js";

const read = (over: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(async () => ({ error: null })),
  ...over,
});

const RULE = { id: "r1", kind: "tonight", startsOn: "2026-11-08" };
const SUMMARY = {
  serviceDate: "2026-11-08",
  label: "Regular week",
  scheduleId: "s1",
  serviceCount: 1,
  closures: [],
  bookingOpen: { online: true, phone: true, waitlist: false },
};

describe("useStaffTonight", () => {
  beforeEach(() => {
    reads.config = read({ data: { config: { dateRules: [RULE] } } });
    reads.days = read({ data: [SUMMARY] });
  });

  it("keeps its existing fields and adds the day's summary", () => {
    const { result } = renderHook(() => useStaffTonight("v1"));
    expect(result.current).toMatchObject({
      serviceDate: "2026-11-08",
      rules: [RULE],
      waitlistClosed: true,
      summary: SUMMARY,
      readStatus: "ready",
    });
  });

  it("is loading until the config and the day have arrived", () => {
    reads.config = read({ isLoading: true });
    expect(renderHook(() => useStaffTonight("v1")).result.current.readStatus).toBe("loading");
    reads.config = read({ data: { config: { dateRules: [] } } });
    reads.days = read({ isLoading: true });
    const { result } = renderHook(() => useStaffTonight("v1"));
    expect(result.current.readStatus).toBe("loading");
    expect(result.current.summary).toBeNull();
  });

  it("reports a failed day read and retries it", () => {
    const days = read({ error: new Error("boom") });
    reads.days = days;
    const { result } = renderHook(() => useStaffTonight("v1"));
    expect(result.current.readStatus).toBe("error");
    result.current.refetch();
    expect(days.refetch).toHaveBeenCalledTimes(1);
  });

  it("reports a failed config read and retries it", () => {
    const config = read({ error: new Error("boom") });
    reads.config = config;
    const { result } = renderHook(() => useStaffTonight("v1"));
    expect(result.current.readStatus).toBe("error");
    result.current.refetch();
    expect(config.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the data when a refresh fails over a summary already loaded", () => {
    reads.days = read({ data: [SUMMARY], error: new Error("boom") });
    expect(renderHook(() => useStaffTonight("v1")).result.current.readStatus).toBe("ready");
  });
});
