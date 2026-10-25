import { describe, expect, it } from "vitest";
import { normalizeLegacyHours } from "./legacy-hours.js";
import { buildLegacyConfig } from "./legacy-migration.js";

/**
 * Lenient mode is for the live listing fallback only (#7503): the legacy
 * listing read each weekday on its own, so one unreadable day closed that day
 * and nothing else. Strict mode (the backfill) still fails the whole venue.
 */

const OPEN = { open: "17:00", close: "22:00" };

describe("normalizeLegacyHours, lenient", () => {
  it("closes only the unreadable day and reports it", () => {
    const raw = { monday: { open: "", close: "22:00" }, tuesday: OPEN };
    expect(normalizeLegacyHours(raw).ok).toBe(false);

    const result = normalizeLegacyHours(raw, { lenient: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.hours.weekly.monday).toEqual([]);
    expect(result.hours.weekly.tuesday).toEqual([{ open: 1020, close: 1320 }]);
    expect(result.unreadableDays).toEqual([expect.stringContaining("monday")]);
  });

  it("reads HH:MM:SS as HH:MM, as the legacy split(':') did", () => {
    const raw = { tuesday: { open: "17:00:00", close: "22:30:00" } };
    expect(normalizeLegacyHours(raw).ok).toBe(false);

    const result = normalizeLegacyHours(raw, { lenient: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.hours.weekly.tuesday).toEqual([{ open: 1020, close: 1350 }]);
    expect(result.unreadableDays).toBeUndefined();
  });

  it("closes a seed-array day whose row cannot be read", () => {
    const raw = [
      { dayOfWeek: 1, openTime: "nope", closeTime: "22:00", isClosed: false },
      { dayOfWeek: 2, openTime: "17:00", closeTime: "22:00", isClosed: false },
    ];
    const result = normalizeLegacyHours(raw, { lenient: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.hours.weekly.monday).toEqual([]);
    expect(result.hours.weekly.tuesday).toHaveLength(1);
    expect(result.unreadableDays).toHaveLength(1);
  });

  it("still fails an unknown shape or version", () => {
    expect(normalizeLegacyHours({ version: 9 }, { lenient: true }).ok).toBe(false);
    expect(normalizeLegacyHours("x", { lenient: true }).ok).toBe(false);
  });
});

describe("buildLegacyConfig, lenient", () => {
  const input = (lenient: boolean) => {
    const hours = normalizeLegacyHours(
      { monday: { open: "09:00", close: "08:00" }, tuesday: OPEN },
      { lenient }
    );
    if (!hours.ok) throw new Error(hours.reason);
    let n = 0;
    return { hours: hours.hours, today: "2026-11-01", newId: () => `id-${(n += 1)}`, lenient };
  };

  it("closes a day with an implausible past-midnight span and keeps the rest", () => {
    expect(buildLegacyConfig(input(false))).toMatchObject({
      ok: false,
      reason: "implausible_span",
    });

    const built = buildLegacyConfig(input(true));
    if (!built.ok) throw new Error(built.reason);
    // Only Tuesday (stored index 2) is assigned; Monday is closed.
    expect(built.config.assignments.map((a) => a.weekdays)).toEqual([[2]]);
    expect(built.notes.unreadableDays).toEqual([expect.stringContaining("monday")]);
  });
});

describe("lenient settings: coerced the way the legacy loop read them", () => {
  // Tuesday 11:00-22:00; default buffer 90 -> last seating 20:30 (1230).
  const TUESDAY = normalizeLegacyHours({ tuesday: { open: "11:00", close: "22:00" } });
  if (!TUESDAY.ok) throw new Error(TUESDAY.reason);
  const build = (
    settings: { slotIntervalMinutes?: number; lastSeatingBuffer?: number },
    lenient: boolean
  ) => {
    let n = 0;
    return buildLegacyConfig({
      hours: TUESDAY.hours,
      ...settings,
      today: "2026-11-01",
      newId: () => `id-${(n += 1)}`,
      lenient,
    });
  };
  const service = (settings: Parameters<typeof build>[0]) => {
    const built = build(settings, true);
    if (!built.ok) throw new Error(built.reason);
    return { service: built.config.scheduleServices[0]!, coercions: built.notes.coercions };
  };

  it("strict mode still refuses every one of these settings", () => {
    for (const settings of [
      { slotIntervalMinutes: 300 },
      { slotIntervalMinutes: 7.5 },
      { lastSeatingBuffer: 30.5 },
      { lastSeatingBuffer: -15 },
    ]) {
      expect(build(settings, false).ok, JSON.stringify(settings)).toBe(false);
    }
  });

  it("an interval above the engine's maximum becomes the same seatings, as fixed times", () => {
    const { service: s, coercions } = service({ slotIntervalMinutes: 300 });
    expect(s.seating).toEqual({ version: 1, fixed: [660, 960] }); // 11:00, 16:00
    expect(coercions).toEqual([expect.stringContaining("slotIntervalMinutes 300")]);
  });

  it("a non-integer interval falls back to the default 15", () => {
    const { service: s, coercions } = service({ slotIntervalMinutes: 7.5 });
    expect(s.seating).toEqual({ version: 1, interval: 15 });
    expect(coercions).toEqual([expect.stringContaining("slotIntervalMinutes 7.5")]);
  });

  it("a fractional buffer rounds up, as legacy's integer seatings <= close - buffer did", () => {
    const { service: s, coercions } = service({ lastSeatingBuffer: 30.5 });
    expect(s.lastSeatingAt).toBe(1320 - 31);
    expect(coercions).toEqual([expect.stringContaining("lastSeatingBuffer 30.5")]);
  });

  it("a negative buffer is treated as 0", () => {
    const { service: s, coercions } = service({ lastSeatingBuffer: -15 });
    expect(s.lastSeatingAt).toBe(1320);
    expect(coercions).toEqual([expect.stringContaining("lastSeatingBuffer -15")]);
  });

  it("valid settings are not coerced", () => {
    expect(service({ slotIntervalMinutes: 30, lastSeatingBuffer: 60 }).coercions).toBeUndefined();
  });
});

describe("normalizeLegacyHours, lenient: a stray version 1 key", () => {
  const raw = { version: 1, tuesday: { open: "17:00", close: "22:00" } };

  it("strict mode reports an unknown version", () => {
    expect(normalizeLegacyHours(raw)).toMatchObject({ ok: false, reason: "unknown_version" });
  });

  it("lenient mode reads the weekday keys, as the legacy listing ignored the key", () => {
    const result = normalizeLegacyHours(raw, { lenient: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.shape).toBe("weekday");
    expect(result.hours.weekly.tuesday).toEqual([{ open: 1020, close: 1320 }]);
    expect(result.coercions).toEqual([expect.stringContaining("version 1")]);
  });

  it("still refuses another version in lenient mode", () => {
    const v9 = { version: 9, tuesday: { open: "17:00", close: "22:00" } };
    expect(normalizeLegacyHours(v9, { lenient: true }).ok).toBe(false);
  });
});
