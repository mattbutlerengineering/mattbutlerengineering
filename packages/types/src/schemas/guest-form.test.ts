import { describe, it, expect } from "vitest";
import { AddGuestFormSchema, hasGuestContact } from "./guest-form.js";
import { FindOrCreateGuestBodySchema } from "./reservation-requests.js";

describe("AddGuestFormSchema", () => {
  it("rejects a name-only guest (the API requires email or phone)", () => {
    const result = AddGuestFormSchema.safeParse({ name: "Ana", email: "", phone: "", notes: "" });
    expect(result.success).toBe(false);
  });

  it("accepts name + email", () => {
    expect(
      AddGuestFormSchema.safeParse({ name: "Ana", email: "a@b.co", phone: "", notes: "" }).success
    ).toBe(true);
  });

  it("accepts name + phone", () => {
    expect(
      AddGuestFormSchema.safeParse({ name: "Ana", email: "", phone: "+1 555 000 1111", notes: "" })
        .success
    ).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(
      AddGuestFormSchema.safeParse({ name: "", email: "a@b.co", phone: "", notes: "" }).success
    ).toBe(false);
  });
});

describe("hasGuestContact", () => {
  it("is false for blank/absent email and phone, true otherwise", () => {
    expect(hasGuestContact({})).toBe(false);
    expect(hasGuestContact({ email: " ", phone: "" })).toBe(false);
    expect(hasGuestContact({ phone: "5550001111" })).toBe(true);
  });
});

describe("FindOrCreateGuestBodySchema", () => {
  it("accepts notes", () => {
    const parsed = FindOrCreateGuestBodySchema.parse({
      venueId: "v1",
      name: "Ana",
      email: "a@b.co",
      notes: "nut allergy",
    });
    expect(parsed.notes).toBe("nut allergy");
  });
});
