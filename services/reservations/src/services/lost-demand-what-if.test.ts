import { describe, it, expect, vi } from "vitest";
import type { AvailabilityConfig, PreviewAvailabilityParsed } from "@mbe/types";
import {
  SEATING_WINDOW_MINUTES,
  buildSeatingDraft,
  estimateNewSeating,
  type WhatIfDeps,
  type SearchRow,
} from "./lost-demand-what-if.js";
import type { PreviewOutcome } from "./availability-config.js";
import { planPreview } from "./availability-preview.js";

const DINNER = 17 * 60;
const baseConfig: AvailabilityConfig = {
  schedules: [{ id: "s1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs1", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss1",
      scheduleId: "s1",
      venueServiceId: "vs1",
      opensAt: DINNER,
      lastSeatingAt: 21 * 60,
      closesAt: 22 * 60 + 30,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [{ id: "a1", scheduleId: "s1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 }],
  dateRules: [],
};

// 2026-11-24 is a Tuesday (2); 2026-12-01 is the next one.
const NOW = new Date("2026-11-24T20:00:00.000Z");
const NINE_THIRTY = 21 * 60 + 30;

function okPreview(added: number[]): PreviewOutcome {
  return {
    kind: "ok",
    result: {
      version: 1,
      days: [{ serviceDate: "2026-12-01", added, removed: [] }],
      focusDay: {} as never,
      stranded: { total: 0, offset: 0, items: [] },
    },
  };
}

function deps(over: Partial<WhatIfDeps> & { rows?: SearchRow[] } = {}): WhatIfDeps {
  const { rows = [], ...rest } = over;
  return {
    getConfig: vi.fn(async () => ({ config: baseConfig })),
    today: vi.fn(async () => "2026-11-24"),
    readSearches: vi.fn(async () => rows),
    preview: vi.fn(async () => okPreview([NINE_THIRTY])),
    ...rest,
  };
}

const params = { venueId: "v1", weekday: 2, minute: NINE_THIRTY, now: NOW };

describe("buildSeatingDraft", () => {
  it("extends the nearest service and lists the existing times plus the candidate", () => {
    const draft = buildSeatingDraft(baseConfig, "2026-12-01", NINE_THIRTY);
    expect(draft.kind).toBe("draft");
    if (draft.kind !== "draft") return;
    const rule = draft.changes.upsert.dateRules?.[0];
    expect(rule).toMatchObject({
      kind: "special_hours",
      startsOn: "2026-12-01",
      endsOn: null,
      repeat: { version: 1, weekdays: [2] },
    });
    const svc = rule?.kind === "special_hours" ? rule.payload.services[0] : undefined;
    expect(svc?.lastSeatingAt).toBe(NINE_THIRTY);
    expect(svc?.closesAt).toBeGreaterThanOrEqual(NINE_THIRTY + 60);
    expect(svc?.seating).toEqual({
      version: 1,
      fixed: expect.arrayContaining([DINNER, 21 * 60, NINE_THIRTY]),
    });
  });

  it("is closed when the weekday has no service", () => {
    const closed = { ...baseConfig, assignments: [] };
    expect(buildSeatingDraft(closed, "2026-12-01", NINE_THIRTY)).toEqual({ kind: "closed" });
  });
});

describe("buildSeatingDraft through the real availability preview", () => {
  const run = (minute: number) => {
    const draft = buildSeatingDraft(baseConfig, "2026-12-01", minute);
    if (draft.kind !== "draft") throw new Error("expected a draft");
    return planPreview({
      state: {
        stored: baseConfig,
        effective: baseConfig,
        source: "rows",
        version: 1,
        timezone: "America/Los_Angeles",
        operatingHours: null,
      },
      body: {
        draft: { changes: draft.changes, scopeConflicts: "keep" },
        scope: { from: "2026-12-01" },
        focusDate: "2026-12-01",
        strandedOffset: 0,
        compareWith: "saved",
        partySize: 2,
      },
      bookings: [],
      tableIds: new Set(),
      now: NOW,
    });
  };

  it("adds exactly the candidate time on the Tuesday and nothing on other days", () => {
    const plan = run(NINE_THIRTY);
    expect(plan.kind).toBe("ok");
    if (plan.kind !== "ok") return;
    expect(plan.result.days[0]).toMatchObject({ serviceDate: "2026-12-01", added: [NINE_THIRTY] });
    const wednesday = plan.result.days.find((d) => d.serviceDate === "2026-12-02");
    expect(wednesday?.added).toEqual([]);
    const nextTuesday = plan.result.days.find((d) => d.serviceDate === "2026-12-08");
    expect(nextTuesday?.added).toEqual([NINE_THIRTY]);
  });

  it("adds nothing when the time is already listed", () => {
    const plan = run(20 * 60);
    expect(plan.kind === "ok" && plan.result.days[0]?.added).toEqual([]);
  });
});

describe("estimateNewSeating", () => {
  it("counts Tuesday searches inside the window and ignores other weekdays and hours", async () => {
    const d = deps({
      rows: [
        { date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 2, searches: 4 },
        { date: "2026-11-17", requestedMinute: 21 * 60 + 5, partySize: 4, searches: 3 },
        { date: "2026-11-17", requestedMinute: 19 * 60, partySize: 2, searches: 9 },
        { date: "2026-11-20", requestedMinute: NINE_THIRTY, partySize: 2, searches: 7 },
      ],
    });
    const result = await estimateNewSeating(params, d);
    expect(result.outcome).toBe("estimated");
    expect(result.searches).toBe(7);
    expect(result.windowStart).toBe(NINE_THIRTY - SEATING_WINDOW_MINUTES);
    expect(result.windowEnd).toBe(NINE_THIRTY + SEATING_WINDOW_MINUTES);
    expect(result.from).toBe("2026-10-28");
    expect(result.to).toBe("2026-11-24");
  });

  it("keeps whole-day (-1) misses apart, never in the hour", async () => {
    const d = deps({
      rows: [
        { date: "2026-11-24", requestedMinute: -1, partySize: 2, searches: 5 },
        { date: "2026-11-23", requestedMinute: -1, partySize: 2, searches: 8 },
        { date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 2, searches: 1 },
      ],
    });
    const result = await estimateNewSeating(params, d);
    expect(result.searches).toBe(1);
    expect(result.anyTimeSearches).toBe(5);
  });

  it("honours the party range", async () => {
    const d = deps({
      rows: [
        { date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 2, searches: 4 },
        { date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 6, searches: 3 },
      ],
    });
    const result = await estimateNewSeating({ ...params, minParty: 5, maxParty: 8 }, d);
    expect(result.searches).toBe(3);
    expect(result.minParty).toBe(5);
    expect(result.maxParty).toBe(8);
  });

  it("drops party sizes the previewed seating would not list (no table fits)", async () => {
    const preview = vi.fn(async (_v: string, body: PreviewAvailabilityParsed) =>
      okPreview(body.partySize > 4 ? [] : [NINE_THIRTY])
    );
    const d = deps({
      preview,
      rows: [
        { date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 2, searches: 4 },
        { date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 8, searches: 3 },
      ],
    });
    const result = await estimateNewSeating(params, d);
    expect(result.searches).toBe(4);
    expect(preview).toHaveBeenCalledTimes(2);
  });

  it("reports already_offered when the preview adds nothing for any party", async () => {
    const d = deps({
      preview: vi.fn(async () => okPreview([])),
      rows: [{ date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 2, searches: 4 }],
    });
    const result = await estimateNewSeating(params, d);
    expect(result.outcome).toBe("already_offered");
    expect(result.searches).toBe(0);
  });

  it("reports blocked when the preview refuses the draft", async () => {
    const d = deps({
      preview: vi.fn(async () => ({ kind: "invalid", issues: [] }) as PreviewOutcome),
      rows: [{ date: "2026-11-24", requestedMinute: NINE_THIRTY, partySize: 2, searches: 4 }],
    });
    expect((await estimateNewSeating(params, d)).outcome).toBe("blocked");
  });

  it("reports closed without previewing when the weekday has no service", async () => {
    const d = deps({
      getConfig: vi.fn(async () => ({ config: { ...baseConfig, assignments: [] } })),
    });
    const result = await estimateNewSeating(params, d);
    expect(result.outcome).toBe("closed");
    expect(d.preview).not.toHaveBeenCalled();
  });

  it("a time near midnight stays on the same service day window", async () => {
    const d = deps({
      preview: vi.fn(async () => okPreview([23 * 60 + 45])),
      rows: [{ date: "2026-11-24", requestedMinute: 23 * 60 + 50, partySize: 2, searches: 2 }],
    });
    const result = await estimateNewSeating({ ...params, minute: 23 * 60 + 45 }, d);
    expect(result.windowEnd).toBe(24 * 60);
    expect(result.searches).toBe(2);
  });
});
