import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  availabilityPath,
  legacyRedirect,
  parseAvailabilityEntry,
  readAvailabilityAddress,
  type AvailabilityTarget,
} from "./availability-address.js";

describe("availabilityPath", () => {
  // No new view is built yet, so every target resolves to an address today's page handles.
  const cases: readonly (readonly [AvailabilityTarget, string])[] = [
    [{ view: "hub" }, "/availability"],
    [{ view: "hours" }, "/availability?tab=schedules"],
    [{ view: "hours", service: "svc-dinner" }, "/availability?tab=schedules"],
    [{ view: "seasonal" }, "/availability?tab=schedules"],
    [{ view: "seasonal", screen: "new" }, "/availability?tab=schedules&action=addSchedule"],
    [{ view: "seasonal", screen: "edit", scheduleId: "sch-1" }, "/availability?tab=schedules"],
    [{ view: "seasonal", screen: "compare" }, "/availability?tab=schedules"],
    [{ view: "specialDates" }, "/availability?tab=special"],
    [{ view: "closures" }, "/availability?tab=special"],
    [{ view: "calendar" }, "/availability?tab=calendar"],
    [{ view: "calendar", calendarView: "week", date: "2026-12-24" }, "/availability?tab=calendar"],
    [{ view: "bookingRules" }, "/availability?tab=schedules"],
    [{ view: "history" }, "/availability"],
  ];

  it.each(cases)("resolves %o to %s", (target, path) => {
    expect(availabilityPath(target)).toBe(path);
  });

  it("covers every view", () => {
    const views = new Set(cases.map(([target]) => target.view));
    expect([...views].sort()).toEqual(
      [
        "bookingRules",
        "calendar",
        "closures",
        "history",
        "hours",
        "hub",
        "seasonal",
        "specialDates",
      ].sort()
    );
  });

  it("carries from=setup last", () => {
    expect(availabilityPath({ view: "hub", from: "setup" })).toBe("/availability?from=setup");
    expect(availabilityPath({ view: "seasonal", screen: "new", from: "setup" })).toBe(
      "/availability?tab=schedules&action=addSchedule&from=setup"
    );
  });

  it("opens a section's Close dialog through the address today's page reads", () => {
    expect(
      availabilityPath({
        view: "hub",
        close: { kind: "section", sectionId: "a b&c" },
        from: "setup",
      })
    ).toBe("/availability?closeSection=a+b%26c&from=setup");
  });

  it("drops what today's page cannot open from an address", () => {
    expect(availabilityPath({ view: "calendar", close: { kind: "tonight" }, pause: true })).toBe(
      "/availability?tab=calendar"
    );
  });
});

describe("readAvailabilityAddress", () => {
  const read = (search: string) => readAvailabilityAddress({ search });
  const none = { close: null, pause: false, from: null };

  it("reads nothing from an empty or unrelated search", () => {
    expect(read("")).toEqual(none);
    expect(read("?tab=special&x=1")).toEqual(none);
  });

  it("reads each kind of close target", () => {
    expect(read("?close=tonight").close).toEqual({ kind: "tonight" });
    expect(read("?close=2026-12-24").close).toEqual({ kind: "date", date: "2026-12-24" });
    expect(read("?close=2026-12-24..2026-12-26").close).toEqual({
      kind: "range",
      from: "2026-12-24",
      to: "2026-12-26",
    });
    expect(read("?close=dates:2026-12-24,2026-12-31").close).toEqual({
      kind: "dates",
      dates: ["2026-12-24", "2026-12-31"],
    });
    expect(read(`?close=${encodeURIComponent("section:a b&c")}`).close).toEqual({
      kind: "section",
      sectionId: "a b&c",
    });
  });

  it.each([
    "nonsense",
    "",
    "2026-13-01",
    "2026-02-30",
    "2026-12-24..",
    "2026-12-26..2026-12-24",
    "2026-12-24..tomorrow",
    "dates:",
    "dates:2026-12-24,nope",
    "section:",
    "%E0%A4%A",
  ])("reads the unparseable close target %j as no dialog", (value) => {
    expect(read(`?close=${value}`).close).toBeNull();
  });

  it("reads 20 dates, and reads 21 dates as no dialog", () => {
    const dates = Array.from({ length: 21 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
    expect(read(`?close=dates:${dates.slice(0, 20).join(",")}`).close).toEqual({
      kind: "dates",
      dates: dates.slice(0, 20),
    });
    expect(read(`?close=dates:${dates.join(",")}`).close).toBeNull();
  });

  it("reads the pause flag only from pause=1", () => {
    expect(read("?pause=1").pause).toBe(true);
    expect(read("?pause=true").pause).toBe(false);
    expect(read("?pause=").pause).toBe(false);
  });

  it("reads from=setup and ignores any other from", () => {
    expect(read("?from=setup").from).toBe("setup");
    expect(read("?from=elsewhere").from).toBeNull();
  });

  it("keeps the valid fields when another is garbage", () => {
    expect(read("?close=nope&pause=1&from=setup")).toEqual({
      close: null,
      pause: true,
      from: "setup",
    });
  });
});

describe("legacyRedirect", () => {
  // architecture.md "Old addresses". `/setup/hours` already lands on `/availability` in the route table.
  const rows: readonly (readonly [string, string])[] = [
    ["?tab=schedules", "/availability/hours"],
    ["?tab=calendar", "/availability/calendar"],
    ["?tab=special", "/availability/special-dates"],
    ["?action=addSchedule", "/availability/seasonal/new"],
    ["?closeSection=sec-bar", "/availability?close=section%3Asec-bar"],
  ];

  it.each(rows)("sends %s to %s", (old, next) => {
    expect(legacyRedirect(old)).toBe(next);
  });

  it.each(rows)("carries from=setup from %s", (old, next) => {
    const joiner = next.includes("?") ? "&" : "?";
    expect(legacyRedirect(`${old}&from=setup`)).toBe(`${next}${joiner}from=setup`);
  });

  it("produces a close target that reads back", () => {
    const next = legacyRedirect("?closeSection=a%20b%26c") ?? "";
    expect(readAvailabilityAddress({ search: next.slice(next.indexOf("?")) }).close).toEqual({
      kind: "section",
      sectionId: "a b&c",
    });
  });

  it("combines a tab, an action and a section", () => {
    expect(legacyRedirect("?tab=special&closeSection=sec-1&from=setup")).toBe(
      "/availability/special-dates?close=section%3Asec-1&from=setup"
    );
    expect(legacyRedirect("?tab=schedules&action=addSchedule")).toBe("/availability/seasonal/new");
  });

  it("is null when the search holds no old param", () => {
    expect(legacyRedirect("")).toBeNull();
    expect(legacyRedirect("?from=setup")).toBeNull();
    expect(legacyRedirect("?close=tonight&pause=1")).toBeNull();
    expect(legacyRedirect("?tab=nope&action=deleteEverything&closeSection=")).toBeNull();
  });
});

// Read by today's page until the route table replaces it (ported from availability-entry.test.ts).
describe("parseAvailabilityEntry", () => {
  it("accepts a valid tab, closeSection, action and from", () => {
    expect(
      parseAvailabilityEntry("?tab=schedules&closeSection=sec-1&action=addSchedule&from=setup")
    ).toEqual({ tab: "schedules", closeSection: "sec-1", action: "addSchedule", from: "setup" });
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
    expect(parseAvailabilityEntry("?action=deleteEverything&tab=special")).toEqual({
      tab: "special",
    });
  });

  it("keeps the valid params when others are garbage", () => {
    expect(parseAvailabilityEntry("?tab=special&from=%E0%A4%A")).toEqual({ tab: "special" });
  });

  it("accepts URLSearchParams", () => {
    expect(parseAvailabilityEntry(new URLSearchParams({ from: "setup" }))).toEqual({
      from: "setup",
    });
  });

  it("reads back what availabilityPath builds", () => {
    const path = availabilityPath({
      view: "seasonal",
      screen: "new",
      close: { kind: "section", sectionId: "a b&c" },
      from: "setup",
    });
    expect(parseAvailabilityEntry(path.slice(path.indexOf("?")))).toEqual({
      tab: "schedules",
      closeSection: "a b&c",
      action: "addSchedule",
      from: "setup",
    });
  });
});

describe("the address module is the only place an Availability address is written", () => {
  const SRC = join(import.meta.dirname, "..", "..");
  const sourceFiles = (dir: string): readonly string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });

  it("no other source file holds the path as a string", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith("availability-address.ts"))
      .filter((file) => /["'`]\/availability/.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
