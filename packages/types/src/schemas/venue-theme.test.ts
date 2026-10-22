import { describe, expect, it } from "vitest";
import { VenueThemeSchema } from "./venue.js";

describe("VenueThemeSchema", () => {
  const base = { accent: "#7a1f3d", accentHover: "#8c2a4a", source: "manual" } as const;

  it("accepts the required fields and optional surfaces/text", () => {
    expect(VenueThemeSchema.safeParse(base).success).toBe(true);
    expect(
      VenueThemeSchema.safeParse({
        ...base,
        surface: "#fff",
        surfaceElevated: "#f5f5f5",
        textPrimary: "#111111",
        source: "extracted",
      }).success
    ).toBe(true);
  });

  it("rejects non-hex colours", () => {
    expect(VenueThemeSchema.safeParse({ ...base, accent: "red" }).success).toBe(false);
    expect(VenueThemeSchema.safeParse({ ...base, accentHover: "rgb(0,0,0)" }).success).toBe(false);
    expect(VenueThemeSchema.safeParse({ ...base, surface: "#12345" }).success).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(VenueThemeSchema.safeParse({ ...base, source: "guess" }).success).toBe(false);
  });
});
