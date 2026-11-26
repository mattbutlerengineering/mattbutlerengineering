import { describe, expect, it } from "vitest";
import { assertSurfaceScopeParity, type TokenGroup } from "./color-tokens.js";

const token = (value: string) => ({ $value: value, $type: "color" });

function scopes(darkTinted: Record<string, ReturnType<typeof token>>): TokenGroup {
  return {
    "surface-scope": {
      tinted: {
        light: { surface: token("#e9dfcf"), "focus-ring": token("#8f6a14") },
        dark: darkTinted,
      },
    },
  };
}

describe("assertSurfaceScopeParity", () => {
  it("accepts a scope whose light and dark keys match", () => {
    expect(() =>
      assertSurfaceScopeParity(
        scopes({ surface: token("#3b3022"), "focus-ring": token("#d4a23a") })
      )
    ).not.toThrow();
  });

  it("rejects a scope missing a dark key", () => {
    expect(() => assertSurfaceScopeParity(scopes({ surface: token("#3b3022") }))).toThrow(
      /tinted.*Missing in dark: focus-ring/
    );
  });

  it("rejects scopes that declare different keys from each other", () => {
    const file: TokenGroup = {
      "surface-scope": {
        tinted: {
          light: { surface: token("#e9dfcf"), border: token("#7a746c") },
          dark: { surface: token("#3b3022"), border: token("#ffffff") },
        },
        velvet: {
          light: { surface: token("#4a3a5c") },
          dark: { surface: token("#3b2f4a") },
        },
      },
    };
    expect(() => assertSurfaceScopeParity(file)).toThrow(/velvet/);
  });
});
