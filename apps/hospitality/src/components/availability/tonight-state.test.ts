import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { activeTonightChanges, tonightChipText, type TonightChange } from "./tonight-state.js";

const NOW = new Date("2026-10-29T20:00:00Z");
const TODAY = "2026-10-29";
const FUTURE = "2026-10-30T11:00:00.000Z";

function tonight(id: string, extra: Record<string, unknown>): DateRule {
  return {
    id,
    kind: "tonight",
    targetKind: "venue",
    startsOn: TODAY,
    endsOn: TODAY,
    expiresAt: FUTURE,
    payload: { version: 1, pacing: { covers: 8 } },
    ...extra,
  } as DateRule;
}

describe("activeTonightChanges", () => {
  it("names each kind of Tonight change", () => {
    const rules = [
      tonight("a", {
        targetKind: "booking",
        bookingTypes: ["online"],
        payload: { version: 1, stop: { from: 0, to: 2880 } },
      }),
      tonight("b", { payload: { version: 1, closeAt: 1290 } }),
      tonight("c", { payload: { version: 1, stop: { from: 1170, to: 1200 } } }),
      tonight("d", {
        targetKind: "tables",
        tableIds: ["t1", "t2"],
        payload: { version: 1, stop: { from: 0, to: 2880 } },
      }),
      tonight("e", {}),
    ];
    expect(activeTonightChanges(rules, TODAY, NOW)).toEqual([
      { ruleId: "a", kind: "pause_online" },
      { ruleId: "b", kind: "close_early", closeAt: 1290 },
      { ruleId: "c", kind: "stop_window", from: 1170, to: 1200 },
      { ruleId: "d", kind: "block_tables", tableCount: 2, from: 0, to: 2880 },
      { ruleId: "e", kind: "pacing", covers: 8 },
    ]);
  });

  it("ignores expired rules, other days and other rule kinds", () => {
    const rules = [
      tonight("old", { expiresAt: "2026-10-29T19:59:00.000Z" }),
      tonight("other", { startsOn: "2026-10-28", endsOn: "2026-10-28" }),
      { id: "x", kind: "closure", targetKind: "venue", startsOn: TODAY, endsOn: TODAY } as DateRule,
    ];
    expect(activeTonightChanges(rules, TODAY, NOW)).toEqual([]);
  });
});

describe("tonightChipText", () => {
  // Echo the key and its values, so the test pins which message is chosen.
  const t = ((key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join("|")}` : key) as unknown as TFunction;
  const format = { formatLocalTime: (time: string) => time } as unknown as VenueFormat;
  const text = (change: TonightChange) => tonightChipText(change, t, format);

  it("words each kind of change", () => {
    expect(text({ ruleId: "a", kind: "pause_online" })).toBe("availability.tonight.chip.pause");
    expect(text({ ruleId: "b", kind: "close_early", closeAt: 1290 })).toBe(
      "availability.tonight.chip.closeEarly 21:30"
    );
    expect(text({ ruleId: "c", kind: "stop_window", from: 1170, to: 1200 })).toBe(
      "availability.tonight.chip.stopWindow 19:30|20:00"
    );
    expect(text({ ruleId: "d", kind: "pacing", covers: 8 })).toBe(
      "availability.tonight.chip.pacing 8"
    );
  });

  it("words blocked tables by their window: rest of tonight, from a time, or between times", () => {
    const base = { ruleId: "e", kind: "block_tables", tableCount: 2 } as const;
    expect(text({ ...base, from: 0, to: 2880 })).toBe("availability.tonight.chip.blocked 2");
    expect(text({ ...base, from: 1170, to: 2880 })).toBe(
      "availability.tonight.chip.blockedFrom 2|19:30"
    );
    expect(text({ ...base, from: 1170, to: 1200 })).toBe(
      "availability.tonight.chip.blockedWindow 2|19:30|20:00"
    );
  });
});
