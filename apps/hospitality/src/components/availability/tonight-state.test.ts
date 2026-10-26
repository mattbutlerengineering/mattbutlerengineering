import { describe, expect, it } from "vitest";
import type { DateRule } from "@mbe/types";
import { activeTonightChanges } from "./tonight-state.js";

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
      { ruleId: "d", kind: "block_tables", tableCount: 2 },
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
