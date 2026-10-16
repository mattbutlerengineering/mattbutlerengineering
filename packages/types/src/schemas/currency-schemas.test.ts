import { describe, it, expect } from "vitest";
import {
  CreateDepositBodySchema,
  CreateVenueBodySchema,
  UpdateVenueBodySchema,
} from "./reservation-requests.js";

const VENUE = { name: "V", slug: "v", ianaTimezone: "America/Toronto" };

describe("venue currencyCode", () => {
  it.each(["USD", "cad", "JPY"])("accepts %s", (code) => {
    expect(CreateVenueBodySchema.safeParse({ ...VENUE, currencyCode: code }).success).toBe(true);
    expect(UpdateVenueBodySchema.safeParse({ currencyCode: code }).success).toBe(true);
  });

  it.each(["", "US", "USDD", "U$D", "12 "])("rejects %j", (code) => {
    expect(CreateVenueBodySchema.safeParse({ ...VENUE, currencyCode: code }).success).toBe(false);
    expect(UpdateVenueBodySchema.safeParse({ currencyCode: code }).success).toBe(false);
  });

  it("still defaults to USD on create", () => {
    expect(CreateVenueBodySchema.parse(VENUE).currencyCode).toBe("USD");
  });
});

describe("CreateDepositBodySchema", () => {
  it("leaves currency unset when omitted (the server uses the venue's)", () => {
    expect(CreateDepositBodySchema.parse({ reservationId: "r", amountCents: 100 }).currency).toBe(
      undefined
    );
  });
});
