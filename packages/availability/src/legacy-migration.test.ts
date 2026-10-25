import { describe, expect, it } from "vitest";
import { normalizeLegacyHours } from "./legacy-hours.js";
import { buildLegacyConfig } from "./legacy-migration.js";
import { projectLegacyOperatingHours } from "./legacy-projection.js";
import { validateConfig } from "./validate-config.js";

const WEEKDAY_SHAPE = {
  monday: { open: "11:00", close: "22:00" },
  tuesday: { open: "11:00", close: "22:00" },
  wednesday: { open: "11:00", close: "22:00" },
  thursday: { open: "11:00", close: "23:00" },
  friday: { open: "11:00", close: "23:00" },
  saturday: { open: "10:00", close: "22:00" },
  sunday: { open: "00:00", close: "00:00", closed: true },
};

const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const hoursOf = (raw: unknown) => {
  const result = normalizeLegacyHours(raw);
  if (!result.ok) throw new Error(`normalise failed: ${result.reason}`);
  return result.hours;
};

const build = (raw: unknown, extra: object = {}) =>
  buildLegacyConfig({ hours: hoursOf(raw), today: "2026-11-01", newId: counter(), ...extra });

describe("normalizeLegacyHours", () => {
  it("reads the weekday-keyed shape", () => {
    const result = normalizeLegacyHours(WEEKDAY_SHAPE);
    expect(result).toMatchObject({ ok: true, shape: "weekday" });
    if (result.ok) {
      expect(result.hours.weekly.monday).toEqual([{ open: 660, close: 1320 }]);
      expect(result.hours.weekly.sunday).toEqual([]);
    }
  });

  it("reads the seed array shape with 0 = Sunday and treats close <= open as past midnight", () => {
    const result = normalizeLegacyHours([
      { dayOfWeek: 0, openTime: "16:00", closeTime: "23:00", isClosed: false },
      { dayOfWeek: 1, openTime: "00:00", closeTime: "00:00", isClosed: true },
      { dayOfWeek: 5, openTime: "16:00", closeTime: "01:00", isClosed: false },
    ]);
    expect(result).toMatchObject({ ok: true, shape: "seed_array" });
    if (result.ok) {
      expect(result.hours.weekly.sunday).toEqual([{ open: 960, close: 1380 }]);
      expect(result.hours.weekly.monday).toEqual([]);
      expect(result.hours.weekly.friday).toEqual([{ open: 960, close: 1500, wrapped: true }]);
    }
  });

  it("reads the v2 shape with named windows and overrides", () => {
    const result = normalizeLegacyHours({
      version: 2,
      weekly: { friday: [{ name: "Dinner", open: "17:00", close: "22:00" }] },
      overrides: [{ date: "2026-12-25", closed: true, note: "Christmas" }],
    });
    expect(result).toMatchObject({ ok: true, shape: "v2" });
    if (result.ok) {
      expect(result.hours.weekly.friday).toEqual([{ name: "Dinner", open: 1020, close: 1320 }]);
      expect(result.hours.overrides).toEqual([
        { date: "2026-12-25", windows: [], note: "Christmas" },
      ]);
    }
  });

  it("reports an unknown version, an unknown shape and missing hours instead of guessing", () => {
    expect(normalizeLegacyHours({ version: 3, weekly: {} })).toMatchObject({
      ok: false,
      reason: "unknown_version",
    });
    expect(normalizeLegacyHours({ hello: "world" })).toMatchObject({
      ok: false,
      reason: "unknown_shape",
    });
    expect(normalizeLegacyHours([{ foo: 1 }])).toMatchObject({
      ok: false,
      reason: "unknown_shape",
    });
    expect(normalizeLegacyHours("9-5")).toMatchObject({ ok: false, reason: "unknown_shape" });
    expect(normalizeLegacyHours(null)).toEqual({ ok: false, reason: "no_hours" });
  });

  it("fails loud on a time it cannot read for an open day instead of reading it as closed", () => {
    for (const bad of ["09:00:00", "9:5", "25:00", "soon", undefined]) {
      const result = normalizeLegacyHours({
        monday: { open: bad, close: "22:00" },
        tuesday: { open: "11:00", close: "22:00" },
      });
      expect(result, String(bad)).toMatchObject({ ok: false, reason: "unreadable_time" });
      expect(!result.ok && "detail" in result && result.detail).toContain("monday");
    }
    expect(
      normalizeLegacyHours([{ dayOfWeek: 1, openTime: "9:5", closeTime: "17:00", isClosed: false }])
    ).toMatchObject({ ok: false, reason: "unreadable_time" });
    expect(
      normalizeLegacyHours({ version: 2, weekly: { friday: [{ open: "x", close: "22:00" }] } })
    ).toMatchObject({ ok: false, reason: "unreadable_time" });
  });

  it("fails a v2 venue whose override date is not YYYY-MM-DD instead of dropping a closure", () => {
    for (const date of ["2026-12-25T00:00:00Z", "12/25/2026", "2026-13-01", 20261225, undefined]) {
      const result = normalizeLegacyHours({
        version: 2,
        weekly: {},
        overrides: [{ date, closed: true }],
      });
      expect(result, String(date)).toMatchObject({ ok: false, reason: "unreadable_date" });
    }
    expect(normalizeLegacyHours({ version: 2, weekly: {}, overrides: "2026-12-25" })).toMatchObject(
      { ok: false, reason: "unreadable_date" }
    );
  });

  it("fails a v2 venue with a malformed day or window instead of reading it as closed", () => {
    const cases: unknown[] = [
      { version: 2, weekly: { monday: "11:00-22:00" } },
      { version: 2, weekly: { monday: [null] } },
      { version: 2, weekly: { monday: [{ open: "11:00", close: "22:00" }, "x"] } },
      { version: 2, weekly: {}, overrides: [{ date: "2026-12-25", windows: "all day" }] },
      { version: 2, weekly: {}, overrides: [{ date: "2026-12-25" }] },
    ];
    for (const raw of cases) {
      expect(normalizeLegacyHours(raw), JSON.stringify(raw)).toMatchObject({
        ok: false,
        reason: "unreadable_time",
      });
    }
    // An absent day is still just closed.
    expect(normalizeLegacyHours({ version: 2, weekly: {} })).toMatchObject({ ok: true });
  });

  it("treats any truthy `closed` as closed, as the legacy code does", () => {
    const result = normalizeLegacyHours({
      monday: { open: "bad", close: "bad", closed: 1 },
      tuesday: { open: "11:00", close: "22:00", closed: "yes" },
      wednesday: { open: "11:00", close: "22:00", closed: false },
    });
    expect(result.ok && result.hours.weekly.monday).toEqual([]);
    expect(result.ok && result.hours.weekly.tuesday).toEqual([]);
    expect(result.ok && result.hours.weekly.wednesday).toHaveLength(1);
  });

  it("reads a missing day as closed, as the legacy code does", () => {
    const result = normalizeLegacyHours({ tuesday: { open: "11:00", close: "22:00" } });
    expect(result.ok && result.hours.weekly.monday).toEqual([]);
  });
});

describe("buildLegacyConfig", () => {
  it("writes a regular schedule with one service per window and the legacy interval and buffer", () => {
    const result = build(WEEKDAY_SHAPE, { slotIntervalMinutes: 30, lastSeatingBuffer: 60 });
    if (!result.ok) throw new Error(result.detail);
    const regular = result.config.schedules.find((s) => s.isRegular)!;
    const monday = result.config.scheduleServices.find((s) => s.scheduleId === regular.id)!;
    expect(monday).toMatchObject({
      opensAt: 660,
      closesAt: 1320,
      lastSeatingAt: 1260, // closesAt − 60
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online", "phone"],
    });
    expect(validateConfig(result.config)).toEqual([]);
  });

  it("uses the legacy defaults of 15 minutes and a 90-minute buffer", () => {
    const result = build(WEEKDAY_SHAPE);
    if (!result.ok) throw new Error(result.detail);
    expect(result.config.scheduleServices[0]).toMatchObject({
      lastSeatingAt: 1320 - 90,
      seating: { version: 1, interval: 15 },
    });
  });

  it("assigns only the open weekdays (0 = Sunday); a closed weekday gets no assignment", () => {
    const result = build(WEEKDAY_SHAPE);
    if (!result.ok) throw new Error(result.detail);
    const assigned = result.config.assignments.flatMap((a) => a.weekdays);
    expect(assigned.sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(assigned).not.toContain(0);
  });

  it("puts weekdays with different hours on their own alternate schedule", () => {
    const result = build(WEEKDAY_SHAPE);
    if (!result.ok) throw new Error(result.detail);
    expect(result.config.schedules.map((s) => [s.kind, s.isRegular])).toEqual([
      ["regular", true],
      ["alternate", false],
      ["alternate", false],
    ]);
    // Mon-Wed share the largest group and are the regular week.
    const regular = result.config.assignments[0]!;
    expect(regular.weekdays).toEqual([1, 2, 3]);
  });

  it("gives an all-closed venue a regular schedule with no services or assignments", () => {
    const result = build({ monday: { open: "09:00", close: "17:00", closed: true } });
    if (!result.ok) throw new Error(result.detail);
    expect(result.config.schedules).toHaveLength(1);
    expect(result.config.assignments).toEqual([]);
    expect(validateConfig(result.config)).toEqual([]);
  });

  it("drops a window the legacy loop could never seat and counts it", () => {
    const result = build({ monday: { open: "20:00", close: "21:00" } });
    if (!result.ok) throw new Error(result.detail);
    expect(result.config.scheduleServices).toEqual([]);
    expect(result.notes.droppedWindows).toBe(1);
  });

  it("migrates only future v2 overrides: special hours and closures", () => {
    const result = build({
      version: 2,
      weekly: { friday: [{ name: "Dinner", open: "17:00", close: "23:00" }] },
      overrides: [
        { date: "2026-10-01", closed: true },
        { date: "2026-12-25", closed: true, note: "Christmas" },
        { date: "2026-12-31", windows: [{ name: "Dinner", open: "20:00", close: "21:00" }] },
        { date: "2027-01-01", windows: [{ name: "Dinner", open: "17:00", close: "21:00" }] },
      ],
    });
    if (!result.ok) throw new Error(result.detail);
    expect(result.notes).toMatchObject({ skippedPastOverrides: 1, migratedOverrides: 3 });
    const kinds = result.config.dateRules.map((r) => [r.kind, r.startsOn]);
    expect(kinds).toEqual([
      ["closure", "2026-12-25"],
      ["closure", "2026-12-31"], // no seating fits before the 90-minute buffer: closed
      ["special_hours", "2027-01-01"],
    ]);
    const dinner = result.config.venueServices.find((s) => s.name === "Dinner")!;
    const special = result.config.dateRules[2]!;
    expect(special.kind === "special_hours" && special.payload.services[0]?.venueServiceId).toBe(
      dinner.id
    );
  });

  it("lists past-midnight windows and rejects an implausibly long one", () => {
    const result = build([{ dayOfWeek: 5, openTime: "16:00", closeTime: "01:00" }]);
    if (!result.ok) throw new Error(result.detail);
    expect(result.notes.pastMidnightWindows).toEqual([
      { day: "friday", open: 960, close: 1500, span: 540 },
    ]);
    // 09:00 -> 08:00 is a 23-hour "service": almost certainly a typo.
    expect(build({ monday: { open: "09:00", close: "08:00" } })).toMatchObject({
      ok: false,
      reason: "implausible_span",
    });
  });

  it("reports a bad interval or buffer rather than writing rows", () => {
    expect(build(WEEKDAY_SHAPE, { slotIntervalMinutes: 0 })).toMatchObject({
      ok: false,
      reason: "invalid_interval",
    });
    expect(build(WEEKDAY_SHAPE, { lastSeatingBuffer: -5 })).toMatchObject({
      ok: false,
      reason: "invalid_buffer",
    });
  });

  it("reports overlapping v2 windows as an invalid config", () => {
    const result = build({
      version: 2,
      weekly: {
        monday: [
          { name: "Lunch", open: "11:00", close: "15:00" },
          { name: "Dinner", open: "14:00", close: "22:00" },
        ],
      },
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid_config" });
  });

  it("builds the same config from the weekday and seed-array shapes of the same hours", () => {
    const seedArray = [
      { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
      ...(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const).map(
        (day, i) => ({
          dayOfWeek: i + 1,
          openTime: WEEKDAY_SHAPE[day].open,
          closeTime: WEEKDAY_SHAPE[day].close,
          isClosed: false,
        })
      ),
    ];
    expect(build(seedArray)).toEqual(build(WEEKDAY_SHAPE));
  });
});

describe("projectLegacyOperatingHours", () => {
  it("round-trips the weekday shape", () => {
    const result = build(WEEKDAY_SHAPE);
    if (!result.ok) throw new Error(result.detail);
    expect(projectLegacyOperatingHours(result.config)).toEqual({
      ...WEEKDAY_SHAPE,
      sunday: { open: "00:00", close: "00:00", closed: true },
    });
  });

  it("uses first open and last close across a day's services", () => {
    const result = build({
      version: 2,
      weekly: {
        friday: [
          { name: "Lunch", open: "11:00", close: "14:00" },
          { name: "Dinner", open: "17:00", close: "22:30" },
        ],
      },
    });
    if (!result.ok) throw new Error(result.detail);
    expect(projectLegacyOperatingHours(result.config).friday).toEqual({
      open: "11:00",
      close: "22:30",
    });
  });

  it("wraps a close past midnight to its clock time", () => {
    const result = build([{ dayOfWeek: 5, openTime: "16:00", closeTime: "01:00" }]);
    if (!result.ok) throw new Error(result.detail);
    expect(projectLegacyOperatingHours(result.config).friday).toEqual({
      open: "16:00",
      close: "01:00",
    });
  });
});
