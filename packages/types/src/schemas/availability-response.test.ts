import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { TimeSlot } from "../availability.js";
import {
  DateAvailabilitySchema,
  PublicAvailabilityResponseSchema,
  TimeSlotSchema,
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

describe("TimeSlotSchema service", () => {
  const dinner = { id: "vs-dinner", name: "Dinner" };

  it("accepts a slot labelled with its venue service", () => {
    const body = { data: [{ ...slot, service: dinner }] };
    expect(PublicAvailabilityResponseSchema.parse(body)).toEqual(body);
  });

  it("still accepts a slot with no service", () => {
    expect(TimeSlotSchema.parse(slot)).not.toHaveProperty("service");
  });

  it("rejects a service without a name, or with an empty name", () => {
    expect(TimeSlotSchema.safeParse({ ...slot, service: { id: "vs-dinner" } }).success).toBe(false);
    expect(
      TimeSlotSchema.safeParse({ ...slot, service: { id: "vs-dinner", name: "" } }).success
    ).toBe(false);
  });

  it("lists service (id + name) in the response JSON schema, so Fastify does not strip it", () => {
    type Obj = { properties: Record<string, Obj>; items: Obj };
    const service = (publicAvailabilityResponseJsonSchema as unknown as Obj).properties.data!.items
      .properties.service!;
    expect(Object.keys(service.properties).sort()).toEqual(["id", "name"]);
  });

  it("types the interface and the schema identically", () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
    const same: Same<TimeSlot, z.infer<typeof TimeSlotSchema>> = true;
    expect(same).toBe(true);
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
