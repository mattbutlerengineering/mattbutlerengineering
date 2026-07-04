import { describe, it, expect } from "vitest";
import { validateLocationTime } from "./LocationTimeStep.js";

describe("validateLocationTime", () => {
  it("requires a timezone", () => {
    const errors = validateLocationTime({ ianaTimezone: "", currencyCode: "USD" });
    expect(errors.ianaTimezone).toBe("Timezone is required");
  });

  it("requires a currency", () => {
    const errors = validateLocationTime({ ianaTimezone: "America/New_York", currencyCode: "" });
    expect(errors.currencyCode).toBe("Currency is required");
  });

  it("returns no errors when both fields are set", () => {
    const errors = validateLocationTime({
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
    });
    expect(errors).toEqual({});
  });
});
