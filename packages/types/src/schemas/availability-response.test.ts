import { describe, expect, it } from "vitest";
import {
  DateAvailabilitySchema,
  PublicAvailabilityResponseSchema,
} from "./availability-response.js";
import { publicAvailabilityResponseJsonSchema } from "./json-schema.js";

const slot = {
  time: "2026-11-05T01:00:00.000Z",
  available: true,
  tables: [{ id: "t1", name: "T1", capacity: 4, minCovers: 1, maxCovers: null }],
};

describe("PublicAvailabilityResponseSchema", () => {
  it("accepts the pre-engine shape unchanged (slots only)", () => {
    expect(PublicAvailabilityResponseSchema.parse({ data: [slot] })).toEqual({ data: [slot] });
  });

  it("accepts a closure message and a booking pause with an optional phone", () => {
    const body = {
      data: [],
      closure: { message: "Closed for a private event" },
      bookingPaused: { message: "Online booking is paused right now.", phone: "555-1234" },
    };
    expect(PublicAvailabilityResponseSchema.parse(body)).toEqual(body);
    const noPhone = { data: [], bookingPaused: { message: "Not taking reservations right now." } };
    expect(PublicAvailabilityResponseSchema.parse(noPhone)).toEqual(noPhone);
  });

  it("rejects a closure without a message", () => {
    expect(PublicAvailabilityResponseSchema.safeParse({ data: [], closure: {} }).success).toBe(
      false
    );
  });

  it("derives a response JSON schema that lists every field, so none is stripped", () => {
    const props = (publicAvailabilityResponseJsonSchema as { properties: Record<string, unknown> })
      .properties;
    expect(Object.keys(props).sort()).toEqual(["bookingPaused", "closure", "data"]);
  });
});

describe("DateAvailabilitySchema", () => {
  it("carries an optional per-date closure message", () => {
    const day = {
      date: "2026-12-24",
      hasAvailability: false,
      slotCount: 0,
      closure: { message: "Closed for the holiday" },
    };
    expect(DateAvailabilitySchema.parse(day)).toEqual(day);
    expect(
      DateAvailabilitySchema.parse({ date: "2026-12-23", hasAvailability: true, slotCount: 3 })
    ).not.toHaveProperty("closure");
  });
});
