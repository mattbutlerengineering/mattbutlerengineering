import { describe, expect, it } from "vitest";
import { availabilityPath, parseAvailabilityEntry } from "./availability-entry.js";

describe("parseAvailabilityEntry", () => {
  it("accepts a valid tab, closeSection and from", () => {
    expect(parseAvailabilityEntry("?tab=schedules&closeSection=sec-1&from=setup")).toEqual({
      tab: "schedules",
      closeSection: "sec-1",
      from: "setup",
    });
  });

  it("accepts each tab value", () => {
    for (const tab of ["calendar", "special", "schedules"] as const) {
      expect(parseAvailabilityEntry(`tab=${tab}`).tab).toBe(tab);
    }
  });

  it("ignores invalid and unknown values without throwing", () => {
    expect(parseAvailabilityEntry("?tab=nope&closeSection=&from=elsewhere&x=1")).toEqual({});
    expect(parseAvailabilityEntry("")).toEqual({});
    expect(parseAvailabilityEntry("?tab=schedules&tab=special")).toEqual({ tab: "schedules" });
  });

  it("keeps the valid params when others are garbage", () => {
    expect(parseAvailabilityEntry("?tab=special&from=%E0%A4%A")).toEqual({ tab: "special" });
  });

  it("accepts URLSearchParams", () => {
    expect(parseAvailabilityEntry(new URLSearchParams({ from: "setup" }))).toEqual({
      from: "setup",
    });
  });
});

describe("availabilityPath", () => {
  it("is the bare route for an empty entry", () => {
    expect(availabilityPath({})).toBe("/availability");
  });

  it("round-trips through parseAvailabilityEntry", () => {
    const entry = { tab: "schedules", closeSection: "a b&c", from: "setup" } as const;
    const path = availabilityPath(entry);
    expect(path.startsWith("/availability?")).toBe(true);
    expect(parseAvailabilityEntry(path.slice(path.indexOf("?")))).toEqual(entry);
  });
});
