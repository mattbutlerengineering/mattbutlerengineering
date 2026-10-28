import { describe, expect, it } from "vitest";
import {
  AvailabilityCheckBodySchema,
  AvailabilityCheckResultSchema,
  AvailabilityConfigProblemSchema,
  AvailabilityDaySummarySchema,
  ClosureImpactBodySchema,
  ClosureImpactSchema,
  CreateClosureBodySchema,
  DaySummaryServiceSchema,
  PreviewAvailabilityBodySchema,
  PreviewResultSchema,
  PutAvailabilityConfigBodySchema,
  SetTonightBodySchema,
} from "./availability-config-api.js";

describe("CreateClosureBodySchema", () => {
  const rule = { id: "r1", kind: "closure", targetKind: "venue", startsOn: "2026-12-24" };
  const parse = (decisions: unknown) =>
    CreateClosureBodySchema.safeParse({ expectedVersion: 0, rule, decisions });

  it("defaults to no decisions and requires the version", () => {
    expect(CreateClosureBodySchema.parse({ expectedVersion: 0, rule }).decisions).toEqual([]);
    expect(CreateClosureBodySchema.safeParse({ rule }).success).toBe(false);
  });

  it("accepts the four actions and nothing else", () => {
    for (const action of ["cancel", "move", "keep_notify", "keep_silent"]) {
      expect(parse([{ groupKey: "2026-12-24:closed", action }]).success).toBe(true);
    }
    expect(parse([{ groupKey: "2026-12-24:closed", action: "delete" }]).success).toBe(false);
  });
});

describe("ClosureImpactBodySchema", () => {
  const closure = { id: "r1", kind: "closure", targetKind: "venue", startsOn: "2026-12-24" };

  it("parses a draft date rule", () => {
    expect(ClosureImpactBodySchema.parse({ rule: closure }).rule).toMatchObject(closure);
  });

  it("requires the rule and a valid shape", () => {
    expect(ClosureImpactBodySchema.safeParse({}).success).toBe(false);
    expect(ClosureImpactBodySchema.safeParse({ rule: { ...closure, startsOn: "x" } }).success).toBe(
      false
    );
  });
});

describe("alongside (series growth edits)", () => {
  const rule = { id: "r2", kind: "closure", targetKind: "venue", startsOn: "2026-12-24" };

  it("is optional, and defaults its two lists when given", () => {
    expect(ClosureImpactBodySchema.parse({ rule }).alongside).toBeUndefined();
    expect(ClosureImpactBodySchema.parse({ rule, alongside: {} }).alongside).toEqual({
      upsert: [],
      remove: [],
    });
    const body = CreateClosureBodySchema.parse({
      expectedVersion: 0,
      rule,
      alongside: { upsert: [{ ...rule, id: "r1" }], remove: ["r0"] },
    });
    expect(body.alongside?.remove).toEqual(["r0"]);
  });
});

describe("ClosureImpactSchema", () => {
  it("accepts an empty impact (a booking-only closure has no groups)", () => {
    expect(
      ClosureImpactSchema.safeParse({ reservations: 0, covers: 0, depositsHeld: 0, groups: [] })
        .success
    ).toBe(true);
  });
});

describe("PutAvailabilityConfigBodySchema", () => {
  it("defaults empty changes and keep for scope conflicts", () => {
    expect(PutAvailabilityConfigBodySchema.parse({ expectedVersion: 0, changes: {} })).toEqual({
      expectedVersion: 0,
      changes: { upsert: {}, remove: {} },
      scopeConflicts: "keep",
    });
  });

  it("requires a non-negative integer version", () => {
    expect(
      PutAvailabilityConfigBodySchema.safeParse({ expectedVersion: -1, changes: {} }).success
    ).toBe(false);
    expect(PutAvailabilityConfigBodySchema.safeParse({ changes: {} }).success).toBe(false);
  });

  it("parses upserted rows with the row schemas", () => {
    const result = PutAvailabilityConfigBodySchema.safeParse({
      expectedVersion: 1,
      changes: { upsert: { schedules: [{ id: "s", name: "", kind: "regular", isRegular: true }] } },
    });
    expect(result.success).toBe(false);
  });
});

describe("AvailabilityConfigProblemSchema", () => {
  it("accepts a version conflict with no recorded change", () => {
    expect(
      AvailabilityConfigProblemSchema.safeParse({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Availability changed since you loaded it.",
        code: "version-conflict",
        winningChange: null,
      }).success
    ).toBe(true);
  });
});

describe("AvailabilityCheckBodySchema", () => {
  const body = { start: "2026-11-06T19:00:00.000Z", partySize: 4, channel: "phone" };

  it("accepts a phone check with an optional table", () => {
    expect(AvailabilityCheckBodySchema.safeParse(body).success).toBe(true);
    expect(AvailabilityCheckBodySchema.safeParse({ ...body, tableId: "t1" }).success).toBe(true);
  });

  it("is staff-only: the online channel is refused", () => {
    expect(AvailabilityCheckBodySchema.safeParse({ ...body, channel: "online" }).success).toBe(
      false
    );
  });

  it("accepts an optional end and rejects a malformed one", () => {
    expect(
      AvailabilityCheckBodySchema.safeParse({ ...body, end: "2026-11-06T20:30:00.000Z" }).success
    ).toBe(true);
    expect(AvailabilityCheckBodySchema.safeParse({ ...body, end: "later" }).success).toBe(false);
  });

  it("requires a positive party size", () => {
    expect(AvailabilityCheckBodySchema.safeParse({ ...body, partySize: 0 }).success).toBe(false);
  });
});

describe("AvailabilityCheckResultSchema", () => {
  it("carries limits for a soft verdict and a reason for a hard one", () => {
    expect(AvailabilityCheckResultSchema.safeParse({ kind: "ok" }).success).toBe(true);
    expect(
      AvailabilityCheckResultSchema.safeParse({
        kind: "soft",
        limits: ["pacing"],
        message: "This booking is over the pacing limit.",
      }).success
    ).toBe(true);
    expect(
      AvailabilityCheckResultSchema.safeParse({
        kind: "hard",
        reason: "closed",
        message: "The venue is closed at this time.",
      }).success
    ).toBe(true);
    expect(AvailabilityCheckResultSchema.safeParse({ kind: "soft", message: "x" }).success).toBe(
      false
    );
  });
});

describe("PreviewAvailabilityBodySchema", () => {
  const base = { draft: { changes: {} }, focusDate: "2026-11-01" };

  it("defaults the conflict mode and page offset, and takes a range open at the end", () => {
    expect(PreviewAvailabilityBodySchema.parse({ ...base, scope: { from: "2026-11-01" } })).toEqual(
      {
        draft: { changes: { upsert: {}, remove: {} }, scopeConflicts: "keep" },
        scope: { from: "2026-11-01" },
        focusDate: "2026-11-01",
        strandedOffset: 0,
        compareWith: "saved",
        partySize: 2,
      }
    );
  });

  it("takes a comparison base and a party size, and refuses others", () => {
    const body = { ...base, scope: ["2026-11-06"] };
    const parsed = PreviewAvailabilityBodySchema.parse({
      ...body,
      compareWith: "regularWeek",
      partySize: 6,
    });
    expect(parsed).toMatchObject({ compareWith: "regularWeek", partySize: 6 });
    for (const bad of [{ compareWith: "yesterday" }, { partySize: 0 }, { partySize: 21 }]) {
      expect(PreviewAvailabilityBodySchema.safeParse({ ...body, ...bad }).success).toBe(false);
    }
  });

  it("takes a list of dates but not an empty one", () => {
    expect(
      PreviewAvailabilityBodySchema.safeParse({ ...base, scope: ["2026-11-06"] }).success
    ).toBe(true);
    expect(PreviewAvailabilityBodySchema.safeParse({ ...base, scope: [] }).success).toBe(false);
  });
});

describe("DaySummaryServiceSchema", () => {
  const service = {
    venueServiceId: "vs-1",
    name: "Dinner",
    opensAt: 1080,
    lastSeatingAt: 1260,
    closesAt: 1320,
  };

  it("parses a service and requires every field", () => {
    expect(DaySummaryServiceSchema.safeParse(service).success).toBe(true);
    const { name: _name, ...withoutName } = service;
    expect(DaySummaryServiceSchema.safeParse(withoutName).success).toBe(false);
  });
});

describe("AvailabilityDaySummarySchema", () => {
  it("carries the services that run that day via the shared service schema", () => {
    const summary = {
      serviceDate: "2026-11-01",
      label: "Regular",
      scheduleId: "s1",
      serviceCount: 1,
      closures: [],
      bookingOpen: { online: true, phone: true, waitlist: true },
      services: [
        {
          venueServiceId: "vs-1",
          name: "Dinner",
          opensAt: 1080,
          lastSeatingAt: 1260,
          closesAt: 1320,
        },
      ],
    };
    const result = AvailabilityDaySummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
    expect(DaySummaryServiceSchema.safeParse(summary.services[0]).success).toBe(true);
  });

  it("parses a summary with no services field, from an old API during the deploy window", () => {
    const summary = {
      serviceDate: "2026-11-01",
      label: "Regular",
      scheduleId: "s1",
      serviceCount: 1,
      closures: [],
      bookingOpen: { online: true, phone: true, waitlist: true },
    };
    expect(AvailabilityDaySummarySchema.safeParse(summary).success).toBe(true);
  });
});

describe("PreviewResultSchema.focusDay", () => {
  it("uses the shared day-summary schema (services included, not bolted on separately)", () => {
    const focusDay = {
      serviceDate: "2026-11-01",
      label: "Regular",
      scheduleId: "s1",
      serviceCount: 1,
      closures: [],
      bookingOpen: { online: true, phone: true, waitlist: true },
      services: [
        {
          venueServiceId: "vs-1",
          name: "Dinner",
          opensAt: 1080,
          lastSeatingAt: 1260,
          closesAt: 1320,
        },
      ],
    };
    const result = PreviewResultSchema.safeParse({
      version: 1,
      days: [],
      focusDay,
      stranded: { total: 0, offset: 0, items: [] },
    });
    expect(result.success).toBe(true);
  });
});

describe("SetTonightBodySchema", () => {
  const base = { expectedVersion: 1, ruleId: "t-1" };

  it("takes each Tonight change and defaults decisions to none", () => {
    const changes = [
      { type: "pause_online" },
      { type: "close_early", closeAt: 1260 },
      { type: "stop_window", from: 1170, to: 1200 },
      { type: "block_tables", tableIds: ["t-1"] },
      { type: "pacing", covers: 12 },
    ];
    for (const change of changes) {
      expect(SetTonightBodySchema.parse({ ...base, change }).decisions).toEqual([]);
    }
  });

  it("refuses an unknown change, an empty table block and stray fields", () => {
    const parse = (change: unknown) => SetTonightBodySchema.safeParse({ ...base, change }).success;
    expect(parse({ type: "close_venue" })).toBe(false);
    expect(parse({ type: "block_tables", tableIds: [] })).toBe(false);
    expect(parse({ type: "pause_online", closeAt: 5 })).toBe(false);
  });
});
