import { describe, expect, it } from "vitest";
import {
  AvailabilityChangesPageSchema,
  AvailabilityCheckBodySchema,
  ReopenClosureBodySchema,
  AvailabilityCheckResultSchema,
  AvailabilityConfigProblemSchema,
  AvailabilityDaySummarySchema,
  CONFLICT_CHANGES_MAX,
  ClosureImpactBodySchema,
  ClosureImpactSchema,
  CreateClosureBodySchema,
  DaySummaryServiceSchema,
  PreviewAvailabilityBodySchema,
  PreviewResultSchema,
  PutAvailabilityConfigBodySchema,
  ReopenResultSchema,
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

  it("carries the series being replaced as the client read it, and keeps it optional (#8028)", () => {
    const series = { ...rule, id: "r0", repeat: { version: 1, weekdays: [4] } };
    const body = CreateClosureBodySchema.parse({
      expectedVersion: 0,
      rule,
      alongside: { upsert: [], remove: ["r0"], replaces: series },
    });
    expect(body.alongside?.replaces).toEqual(series);
    expect(ClosureImpactBodySchema.parse({ rule, alongside: {} }).alongside?.replaces).toBe(
      undefined
    );
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

describe("AvailabilityConfigProblemSchema strands_booking issues", () => {
  const problem = {
    type: "about:blank",
    title: "Unprocessable",
    status: 422,
    detail: "x",
    code: "invalid-config",
  };
  const reservation = {
    id: "r1",
    startTime: "2026-12-25T03:00:00.000Z",
    partySize: 4,
    reason: "closed",
    guestName: "Okafor",
    serviceDate: "2026-12-24",
  };

  it("carries the booking on an issue, and still parses an issue without one", () => {
    const parsed = AvailabilityConfigProblemSchema.parse({
      ...problem,
      issues: [
        { path: "reservations.r1", code: "strands_booking", message: "m", reservation },
        { path: "reservations.r2", code: "strands_booking", message: "m" },
      ],
    });
    expect(parsed.issues?.[0]?.reservation).toEqual(reservation);
    expect(parsed.issues?.[1]?.reservation).toBeUndefined();
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

describe("ReopenClosureBodySchema.seen and AvailabilityChangesPageSchema.undoable", () => {
  const rule = { id: "r1", kind: "closure", targetKind: "venue", startsOn: "2026-12-24" };

  it("takes the body of an older client, with no `seen`", () => {
    expect(ReopenClosureBodySchema.parse({ tellCancelledGuests: true }).seen).toBeUndefined();
  });

  it("takes the rule and children the caller saw, and refuses a half of them", () => {
    const seen = { rule, children: [{ ...rule, id: "k1", kind: "skip", seriesId: "r1" }] };
    expect(ReopenClosureBodySchema.parse({ tellCancelledGuests: false, seen }).seen).toEqual(seen);
    expect(
      ReopenClosureBodySchema.safeParse({ tellCancelledGuests: false, seen: { rule } }).success
    ).toBe(false);
  });

  it("names the undoable change, null for none, and is absent from an older API", () => {
    const page = { total: 0, offset: 0, items: [] };
    const undoable = {
      id: "c",
      actorId: "a",
      at: "2026-11-01T00:00:00.000Z",
      kind: "k",
      summary: "s",
    };
    expect(AvailabilityChangesPageSchema.parse(page).undoable).toBeUndefined();
    expect(AvailabilityChangesPageSchema.parse({ ...page, undoable: null }).undoable).toBeNull();
    expect(AvailabilityChangesPageSchema.parse({ ...page, undoable }).undoable).toEqual(undoable);
  });
});

describe("ReopenResultSchema.stillClosed", () => {
  const result = { version: 8, changeId: "c" };
  const by = {
    ruleId: "other",
    targetKind: "venue",
    startsOn: "2026-12-25",
    endsOn: "2026-12-25",
    dates: ["2026-12-25"],
  };

  it("is absent from an older API, and from ending Tonight", () => {
    expect(ReopenResultSchema.parse(result).stillClosed).toBeUndefined();
  });

  it("carries which closure keeps which dates closed, and whether every date stays closed", () => {
    const stillClosed = { everyDate: true, by: [by] };
    expect(ReopenResultSchema.parse({ ...result, stillClosed }).stillClosed).toEqual(stillClosed);
  });

  it("accepts nothing staying closed", () => {
    const stillClosed = { everyDate: false, by: [] };
    expect(ReopenResultSchema.parse({ ...result, stillClosed }).stillClosed).toEqual(stillClosed);
  });

  it("refuses a date that is not a service date", () => {
    const stillClosed = { everyDate: false, by: [{ ...by, dates: ["Dec 25"] }] };
    expect(ReopenResultSchema.safeParse({ ...result, stillClosed }).success).toBe(false);
  });
});

describe("AvailabilityConfigProblemSchema: changesSince", () => {
  const change = (n: number) => ({
    id: `chg-${n}`,
    actorId: "auth0|ana",
    at: "2026-10-25T18:00:00.000Z",
    kind: "config",
    summary: "s",
  });
  const conflict = (changesSince?: unknown) => ({
    type: "about:blank",
    title: "Conflict",
    status: 409,
    detail: "d",
    code: "version-conflict",
    currentVersion: 6,
    ...(changesSince ? { changesSince } : {}),
  });

  it("accepts a conflict from an older server, with no list", () => {
    expect(AvailabilityConfigProblemSchema.safeParse(conflict()).success).toBe(true);
  });

  it("accepts the newest changes with the true total", () => {
    const parsed = AvailabilityConfigProblemSchema.parse(
      conflict({ total: 25, changes: [change(2), change(1)] })
    );
    expect(parsed.changesSince?.total).toBe(25);
  });

  it("refuses a list longer than the bound", () => {
    const tooMany = Array.from({ length: CONFLICT_CHANGES_MAX + 1 }, (_, i) => change(i));
    expect(
      AvailabilityConfigProblemSchema.safeParse(conflict({ total: 99, changes: tooMany })).success
    ).toBe(false);
  });
});

describe("AvailabilityChangeSummarySchema.detail", () => {
  const base = {
    id: "chg-1",
    actorId: "auth0|ana",
    at: "2026-10-25T18:00:00.000Z",
    kind: "config",
    summary: "Availability updated: 1 added, 0 changed, 0 removed",
  };
  const parse = (detail?: unknown) =>
    AvailabilityConfigProblemSchema.parse({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "d",
      code: "version-conflict",
      winningChange: { ...base, ...(detail === undefined ? {} : { detail }) },
    }).winningChange;

  it("keeps the stable code and its data beside the English summary", () => {
    expect(parse({ code: "config_saved", added: 1, changed: 0, removed: 0 })?.detail).toEqual({
      code: "config_saved",
      added: 1,
      changed: 0,
      removed: 0,
    });
  });

  it("accepts a row with no detail, and a code from a newer server", () => {
    expect(parse()?.detail).toBeUndefined();
    expect(parse({ code: "from_the_future" })?.detail?.code).toBe("from_the_future");
  });

  it("accepts a null detail, as a row stored before codes has", () => {
    expect(parse(null)?.detail).toBeNull();
  });
});
