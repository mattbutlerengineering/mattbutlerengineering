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
});
