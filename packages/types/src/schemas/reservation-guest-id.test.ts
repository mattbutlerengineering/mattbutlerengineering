import { describe, expect, it } from "vitest";
import {
  ConfirmHoldBodySchema,
  CreateReservationBodySchema,
  WalkInBodySchema,
} from "./reservation-requests.js";

// An empty-string guestId is falsy, so route gates keyed on `if (guestId)` skip
// it and it reaches the guest_id foreign key. Reject it at the boundary.

const CREATE_BASE = {
  date: "2026-02-15",
  startTime: "2026-02-15T18:00:00.000Z",
  endTime: "2026-02-15T20:00:00.000Z",
  partySize: 4,
  tableId: "table-123",
};
const WALK_IN_BASE = { partySize: 2, tableId: "table-123", venueId: "venue-1" };

const CASES = [
  ["WalkInBodySchema", WalkInBodySchema, WALK_IN_BASE],
  ["CreateReservationBodySchema", CreateReservationBodySchema, CREATE_BASE],
  ["ConfirmHoldBodySchema", ConfirmHoldBodySchema, {}],
] as const;

describe.each(CASES)("%s guestId", (_name, schema, base) => {
  it("rejects an empty string", () => {
    expect(schema.safeParse({ ...base, guestId: "" }).success).toBe(false);
  });

  it("accepts a real id", () => {
    expect(schema.safeParse({ ...base, guestId: "guest-1" }).success).toBe(true);
  });

  it("accepts an omitted guestId", () => {
    expect(schema.safeParse(base).success).toBe(true);
  });
});
