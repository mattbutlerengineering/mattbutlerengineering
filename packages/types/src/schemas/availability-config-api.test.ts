import { describe, expect, it } from "vitest";
import {
  AvailabilityCheckBodySchema,
  AvailabilityCheckResultSchema,
  AvailabilityConfigProblemSchema,
  ClosureImpactBodySchema,
  ClosureImpactSchema,
  PutAvailabilityConfigBodySchema,
} from "./availability-config-api.js";

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
