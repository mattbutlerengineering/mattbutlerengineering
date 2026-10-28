import { describe, it, expect } from "vitest";
import { DEFAULT_MANAGE_BASE_URL, resolveManageBaseUrl } from "./manage-base-url.js";

describe("resolveManageBaseUrl", () => {
  it("uses MANAGE_BASE_URL when set, so guest links follow the configured public host", () => {
    expect(resolveManageBaseUrl({ MANAGE_BASE_URL: "https://eat-sheet.com" })).toBe(
      "https://eat-sheet.com"
    );
  });

  it("strips trailing slashes so links never double them", () => {
    expect(resolveManageBaseUrl({ MANAGE_BASE_URL: "https://eat-sheet.com//" })).toBe(
      "https://eat-sheet.com"
    );
  });

  it.each([undefined, "", "   "])("falls back to the default for %j", (value) => {
    expect(resolveManageBaseUrl({ MANAGE_BASE_URL: value })).toBe(DEFAULT_MANAGE_BASE_URL);
  });
});
