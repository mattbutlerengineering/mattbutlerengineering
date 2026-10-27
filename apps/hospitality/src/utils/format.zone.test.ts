import { describe, it, expect } from "vitest";
import { sameTimeZone } from "./format.js";

describe("sameTimeZone", () => {
  it("treats IANA aliases of one zone as the same", () => {
    expect(sameTimeZone("Asia/Kolkata", "Asia/Calcutta")).toBe(true);
    expect(sameTimeZone("US/Eastern", "America/New_York")).toBe(true);
  });

  it("tells different zones apart", () => {
    expect(sameTimeZone("America/Los_Angeles", "America/New_York")).toBe(false);
  });

  it("falls back to the raw strings when a zone is not recognised", () => {
    expect(sameTimeZone("Not/AZone", "Not/AZone")).toBe(true);
    expect(sameTimeZone("Not/AZone", "America/New_York")).toBe(false);
  });
});
