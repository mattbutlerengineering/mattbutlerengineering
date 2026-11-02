import { describe, expect, it } from "vitest";
import { buildManageUrl, MANAGE_PATH } from "./manage-url.js";

describe("buildManageUrl", () => {
  it("appends the manage path and token to the web origin", () => {
    expect(buildManageUrl("https://example.com", "tok_1")).toBe(
      "https://example.com/hospitality/reservations/manage?token=tok_1"
    );
  });

  it("tolerates trailing slashes on the base", () => {
    expect(buildManageUrl("https://example.com//", "tok_1")).toBe(
      `https://example.com${MANAGE_PATH}?token=tok_1`
    );
  });

  it("URL-encodes the token", () => {
    expect(buildManageUrl("https://example.com", "a b&c=d")).toContain("?token=a%20b%26c%3Dd");
  });

  it("adds an encoded rebook param when given", () => {
    expect(buildManageUrl("https://example.com", "t", "2026-12-23T19:00")).toBe(
      "https://example.com/hospitality/reservations/manage?token=t&rebook=2026-12-23T19%3A00"
    );
  });

  // #7892: eat-sheet.com is served at the root (no /hospitality basename) —
  // mirrors apps/hospitality/src/lib/host-brand.ts's basename split.
  it("drops the /hospitality basename for an eat-sheet.com base", () => {
    expect(buildManageUrl("https://eat-sheet.com", "tok_1")).toBe(
      "https://eat-sheet.com/reservations/manage?token=tok_1"
    );
  });

  it("drops the /hospitality basename for www.eat-sheet.com too", () => {
    expect(buildManageUrl("https://www.eat-sheet.com", "tok_1")).toBe(
      "https://www.eat-sheet.com/reservations/manage?token=tok_1"
    );
  });
});
