import { describe, expect, it } from "vitest";
import { validateProfile } from "./settings-example.js";

describe("validateProfile", () => {
  it("accepts a name and a normal email", () => {
    expect(
      validateProfile({ fullName: "Marcus Winters", email: "m.winters@grandlakehotel.com" })
    ).toEqual({});
  });

  it("requires a name and rejects an email that is not an address", () => {
    const errors = validateProfile({ fullName: "   ", email: "not an email 😀" });
    expect(errors.fullName).toMatch(/required/i);
    expect(errors.email).toMatch(/valid email/i);
  });

  it("requires an email when the field is blank and keeps a present name", () => {
    const errors = validateProfile({ fullName: "Ada Lovelace", email: "" });
    expect(errors.fullName).toBeUndefined();
    expect(errors.email).toMatch(/required/i);
  });
});
