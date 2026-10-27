import { describe, expect, it } from "vitest";
import { actorNameOf } from "./actor-name.js";

describe("actorNameOf", () => {
  it("returns the trimmed display name", () => {
    expect(actorNameOf({ name: "  Ana Ruiz " })).toBe("Ana Ruiz");
  });

  it.each([undefined, null, "", "   "])("returns null for %j", (name) => {
    expect(actorNameOf({ name })).toBeNull();
  });

  it("returns null for a missing user", () => {
    expect(actorNameOf(undefined)).toBeNull();
  });

  it("never stores an email address", () => {
    expect(actorNameOf({ name: "ana@example.com" })).toBeNull();
  });

  it("caps an overlong name", () => {
    expect(actorNameOf({ name: "a".repeat(500) })?.length).toBe(120);
  });
});
