import { describe, expect, it } from "vitest";
import {
  AvailabilityConfigProblemSchema,
  PutAvailabilityConfigBodySchema,
} from "./availability-config-api.js";

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
