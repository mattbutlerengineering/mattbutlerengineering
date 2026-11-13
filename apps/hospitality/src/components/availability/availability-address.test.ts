import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  availabilityPath,
  isBookingRulesPage,
  isTodaysPage,
  legacyRedirect,
  parseAvailabilityEntry,
  readAvailabilityAddress,
  type AvailabilityTarget,
} from "./availability-address.js";

/**
 * The routes of `availability` in `main.tsx` that render a view: the hub at the index, booking
 * rules over the hub, and today's page at `calendar`. An address outside this list leads to the
 * Not Found page.
 */
const MOUNTED: readonly string[] = [
  "/availability",
  "/availability/booking-rules",
  "/availability/calendar",
];
const pathOf = (address: string): string => address.split("?")[0] ?? "";

describe("availabilityPath", () => {
  // The hub and booking rules have their own addresses. Every other view is not built yet and
  // resolves to today's page.
  const cases: readonly (readonly [AvailabilityTarget, string])[] = [
    [{ view: "hub" }, "/availability"],
    [{ view: "hours" }, "/availability/calendar?tab=schedules"],
    [{ view: "hours", service: "svc-dinner" }, "/availability/calendar?tab=schedules"],
    [{ view: "seasonal" }, "/availability/calendar?tab=schedules"],
    [
      { view: "seasonal", screen: "new" },
      "/availability/calendar?tab=schedules&action=addSchedule",
    ],
    [
      { view: "seasonal", screen: "edit", scheduleId: "sch-1" },
      "/availability/calendar?tab=schedules",
    ],
    [{ view: "seasonal", screen: "compare" }, "/availability/calendar?tab=schedules"],
    [{ view: "specialDates" }, "/availability/calendar?tab=special"],
    [{ view: "closures" }, "/availability/calendar?tab=special"],
    [{ view: "calendar" }, "/availability/calendar?tab=calendar"],
    [
      { view: "calendar", calendarView: "week", date: "2026-12-24" },
      "/availability/calendar?tab=calendar",
    ],
    [{ view: "bookingRules" }, "/availability/booking-rules"],
    [{ view: "history" }, "/availability/calendar"],
  ];

  it.each(cases)("resolves %o to %s", (target, path) => {
    expect(availabilityPath(target)).toBe(path);
  });

  it.each(cases)("resolves %o to a route that is mounted", (target) => {
    expect(MOUNTED).toContain(pathOf(availabilityPath(target)));
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
    expect(availabilityPath({ view: "bookingRules", from: "setup" })).toBe(
      "/availability/booking-rules?from=setup"
    );
    expect(availabilityPath({ view: "seasonal", screen: "new", from: "setup" })).toBe(
      "/availability/calendar?tab=schedules&action=addSchedule&from=setup"
    );
  });

  it("opens a section's Close dialog through the address today's page reads", () => {
    expect(
      availabilityPath({
        view: "hub",
        close: { kind: "section", sectionId: "a b&c" },
        from: "setup",
      })
    ).toBe("/availability/calendar?closeSection=a+b%26c&from=setup");
  });

  it("drops what today's page cannot open from an address", () => {
    expect(availabilityPath({ view: "calendar", close: { kind: "tonight" }, pause: true })).toBe(
      "/availability/calendar?tab=calendar"
    );
    // The hub hosts no dialog until C2.4, so it drops them too, and so does the drawer over it.
    expect(availabilityPath({ view: "hub", close: { kind: "tonight" }, pause: true })).toBe(
      "/availability"
    );
    expect(
      availabilityPath({ view: "bookingRules", close: { kind: "section", sectionId: "sec-1" } })
    ).toBe("/availability/booking-rules");
  });

  it("never answers the hub's own address for a search the index would redirect", () => {
    // The index redirects whatever `legacyRedirect` answers; an answer on the index would loop.
    for (const search of ["?closeSection=sec-1", "?closeSection=sec-1&from=setup"]) {
      expect(pathOf(legacyRedirect(search) ?? "")).toBe("/availability/calendar");
    }
  });
});

describe("isTodaysPage", () => {
  // The router matches a path whatever its case, so this must too.
  it.each(["/availability/calendar", "/availability/calendar/", "/Availability/Calendar"])(
    "is true for %s",
    (pathname) => {
      expect(isTodaysPage(pathname)).toBe(true);
    }
  );

  it.each(["/availability", "/availability/hours", "/availability/calendar/2026-10-30"])(
    "is false for %s",
    (pathname) => {
      expect(isTodaysPage(pathname)).toBe(false);
    }
  );
});

describe("isBookingRulesPage", () => {
  it.each([
    "/availability/booking-rules",
    "/availability/booking-rules/",
    "/Availability/Booking-Rules",
  ])("is true for %s", (pathname) => {
    expect(isBookingRulesPage(pathname)).toBe(true);
  });

  it.each(["/availability", "/availability/calendar", "/booking-rules"])(
    "is false for %s",
    (pathname) => {
      expect(isBookingRulesPage(pathname)).toBe(false);
    }
  );
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
  // architecture.md "Old addresses", as staged: each old address names a view, and lands where
  // `availabilityPath` puts that view today. Final address in the comment beside each row.
  // `/setup/hours` is a route of its own in the route table.
  const rows: readonly (readonly [string, string])[] = [
    ["?tab=schedules", "/availability/calendar?tab=schedules"], // /availability/hours
    ["?tab=calendar", "/availability/calendar?tab=calendar"], // /availability/calendar
    ["?tab=special", "/availability/calendar?tab=special"], // /availability/special-dates
    ["?action=addSchedule", "/availability/calendar?tab=schedules&action=addSchedule"], // /availability/seasonal/new
    ["?closeSection=sec-bar", "/availability/calendar?closeSection=sec-bar"], // /availability?close=section:sec-bar
  ];

  it.each(rows)("sends %s to %s", (old, next) => {
    expect(legacyRedirect(old)).toBe(next);
  });

  it.each(rows)("carries from=setup from %s", (old, next) => {
    expect(legacyRedirect(`${old}&from=setup`)).toBe(`${next}&from=setup`);
  });

  it.each(rows)("sends %s to a route that is mounted", (old) => {
    expect(MOUNTED).toContain(pathOf(legacyRedirect(old) ?? ""));
  });

  it.each(rows)("sends %s where the view it names lives today", (old, next) => {
    const views: Readonly<Record<string, AvailabilityTarget>> = {
      "?tab=schedules": { view: "hours" },
      "?tab=calendar": { view: "calendar" },
      "?tab=special": { view: "specialDates" },
      "?action=addSchedule": { view: "seasonal", screen: "new" },
      "?closeSection=sec-bar": { view: "hub", close: { kind: "section", sectionId: "sec-bar" } },
    };
    expect(availabilityPath(views[old] ?? { view: "hub" })).toBe(next);
  });

  it("produces a section that today's page reads back", () => {
    const next = legacyRedirect("?closeSection=a%20b%26c") ?? "";
    expect(parseAvailabilityEntry(next.slice(next.indexOf("?"))).closeSection).toBe("a b&c");
  });

  it("combines a tab, an action and a section", () => {
    expect(legacyRedirect("?tab=special&closeSection=sec-1&from=setup")).toBe(
      "/availability/calendar?tab=special&closeSection=sec-1&from=setup"
    );
    expect(legacyRedirect("?tab=schedules&action=addSchedule")).toBe(
      "/availability/calendar?tab=schedules&action=addSchedule"
    );
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
    expect(parseAvailabilityEntry("?action=")).toEqual({});
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
