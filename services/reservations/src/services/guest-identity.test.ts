/**
 * Unit tests for the extracted guest identity resolution and dietary merging modules.
 * These are pure-function tests — no database calls.
 */
import { describe, it, expect } from "vitest";
import { applyDietaryRestrictions, buildGuestUpdateData } from "./guest-identity.js";

// Minimal shape matching what resolveGuestIdentity returns and buildGuestUpdateData consumes
type MinimalGuest = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  dietaryRestrictions: string[] | null;
};

function makeGuest(overrides: Partial<MinimalGuest> = {}): MinimalGuest {
  return {
    id: "guest-1",
    name: "Jane Doe",
    email: "guest@example.com",
    phone: "+15551234567",
    dietaryRestrictions: null,
    ...overrides,
  };
}

describe("applyDietaryRestrictions", () => {
  it("returns null when both existing and incoming are null/empty", () => {
    expect(applyDietaryRestrictions(null, null)).toBeNull();
    expect(applyDietaryRestrictions([], [])).toBeNull();
    expect(applyDietaryRestrictions(null, [])).toBeNull();
    expect(applyDietaryRestrictions([], null)).toBeNull();
  });

  it("returns existing when incoming is empty", () => {
    expect(applyDietaryRestrictions(["gluten-free"], null)).toEqual(["gluten-free"]);
    expect(applyDietaryRestrictions(["gluten-free"], [])).toEqual(["gluten-free"]);
  });

  it("returns incoming when existing is empty", () => {
    expect(applyDietaryRestrictions(null, ["vegan"])).toEqual(["vegan"]);
    expect(applyDietaryRestrictions([], ["vegan"])).toEqual(["vegan"]);
  });

  it("unions arrays without duplicates", () => {
    const result = applyDietaryRestrictions(["gluten-free"], ["dairy-free"]);
    expect(result).toEqual(["gluten-free", "dairy-free"]);
  });

  it("deduplicates when incoming is already in existing", () => {
    const result = applyDietaryRestrictions(["vegan", "gluten-free"], ["vegan"]);
    expect(result).toEqual(["vegan", "gluten-free"]);
  });

  it("preserves order — existing first, new items appended", () => {
    const result = applyDietaryRestrictions(["a", "b"], ["c", "a"]);
    expect(result).toEqual(["a", "b", "c"]);
  });
});

describe("buildGuestUpdateData", () => {
  it("returns empty object when nothing changes", () => {
    const guest = makeGuest({ name: "Jane Doe", phone: "+15551234567" });
    const result = buildGuestUpdateData(guest, {
      name: "Jane Doe",
      phone: "+15551234567",
    });
    expect(result).toEqual({});
  });

  it("includes name when it differs", () => {
    const guest = makeGuest({ name: "Old Name" });
    const result = buildGuestUpdateData(guest, { name: "New Name" });
    expect(result).toMatchObject({ name: "New Name" });
  });

  it("includes phone when it differs and incoming phone provided", () => {
    const guest = makeGuest({ phone: "+10000000000" });
    const result = buildGuestUpdateData(guest, { name: "Jane Doe", phone: "+19999999999" });
    expect(result).toMatchObject({ phone: "+19999999999" });
  });

  it("does not include phone when incoming has no phone", () => {
    const guest = makeGuest({ phone: "+10000000000" });
    const result = buildGuestUpdateData(guest, { name: "Jane Doe" });
    expect(result).not.toHaveProperty("phone");
  });

  it("includes email when it differs and incoming email provided", () => {
    const guest = makeGuest({ email: "old@example.com" });
    const result = buildGuestUpdateData(guest, { name: "Jane Doe", email: "new@example.com" });
    expect(result).toMatchObject({ email: "new@example.com" });
  });

  it("does not include email when incoming has no email", () => {
    const guest = makeGuest({ email: "old@example.com" });
    const result = buildGuestUpdateData(guest, { name: "Jane Doe" });
    expect(result).not.toHaveProperty("email");
  });

  it("includes dietaryRestrictions when new restrictions are added", () => {
    const guest = makeGuest({ dietaryRestrictions: ["gluten-free"] });
    const result = buildGuestUpdateData(guest, {
      name: "Jane Doe",
      dietaryRestrictions: ["dairy-free"],
    });
    expect(result).toMatchObject({
      dietaryRestrictions: ["gluten-free", "dairy-free"],
    });
  });

  it("does not include dietaryRestrictions when incoming is already a subset", () => {
    const guest = makeGuest({ dietaryRestrictions: ["vegan", "gluten-free"] });
    const result = buildGuestUpdateData(guest, {
      name: "Jane Doe",
      dietaryRestrictions: ["vegan"],
    });
    expect(result).not.toHaveProperty("dietaryRestrictions");
  });

  it("does not include dietaryRestrictions when not provided in incoming", () => {
    const guest = makeGuest({ dietaryRestrictions: ["gluten-free"] });
    const result = buildGuestUpdateData(guest, { name: "Jane Doe" });
    expect(result).not.toHaveProperty("dietaryRestrictions");
  });
});
