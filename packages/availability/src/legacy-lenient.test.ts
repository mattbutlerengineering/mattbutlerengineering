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
