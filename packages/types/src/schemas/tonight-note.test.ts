import { describe, expect, it } from "vitest";
import { TONIGHT_NOTE_MAX_LENGTH, UpdateVenueBodySchema } from "./reservation-requests.js";

describe("UpdateVenueBodySchema.settings.tonightNote", () => {
  it("accepts a note of exactly the max length", () => {
    const note = "x".repeat(TONIGHT_NOTE_MAX_LENGTH);
    const parsed = UpdateVenueBodySchema.safeParse({ settings: { tonightNote: note } });
    expect(parsed.success).toBe(true);
  });

  it("rejects a note over 200 characters with a clear message", () => {
    const parsed = UpdateVenueBodySchema.safeParse({
      settings: { tonightNote: "x".repeat(TONIGHT_NOTE_MAX_LENGTH + 1) },
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("200");
  });

  it("allows an empty note (clears it)", () => {
    expect(UpdateVenueBodySchema.safeParse({ settings: { tonightNote: "" } }).success).toBe(true);
  });
});
