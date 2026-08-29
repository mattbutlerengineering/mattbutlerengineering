import { describe, it, expect } from "vitest";
import { isSafeReturnTo, deriveReturnTo, extractReturnTo } from "./return-to.js";

describe("isSafeReturnTo", () => {
  it("accepts an app-relative path with a query string", () => {
    expect(isSafeReturnTo("/reservations?date=2026-09-01")).toBe(true);
  });

  it("accepts the root path", () => {
    expect(isSafeReturnTo("/")).toBe(true);
  });

  it("accepts a path with a hash", () => {
    expect(isSafeReturnTo("/guests#top")).toBe(true);
  });

  it("rejects a protocol-relative URL (//evil.com)", () => {
    expect(isSafeReturnTo("//evil.com")).toBe(false);
  });

  it("rejects an absolute URL (https://evil.com)", () => {
    expect(isSafeReturnTo("https://evil.com")).toBe(false);
  });

  it("rejects a backslash protocol-relative variant (/\\evil.com)", () => {
    expect(isSafeReturnTo("/\\evil.com")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isSafeReturnTo("")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isSafeReturnTo(null)).toBe(false);
    expect(isSafeReturnTo(undefined)).toBe(false);
    expect(isSafeReturnTo(42)).toBe(false);
    expect(isSafeReturnTo({ returnTo: "/x" })).toBe(false);
  });

  it("rejects a relative path without a leading slash", () => {
    expect(isSafeReturnTo("reservations")).toBe(false);
  });
});

describe("deriveReturnTo", () => {
  const redirectUri = "https://app.example.com/hospitality/callback";

  it("strips the app base path derived from the redirect URI", () => {
    const location = {
      pathname: "/hospitality/reservations",
      search: "?date=2026-09-01",
      hash: "",
    };
    expect(deriveReturnTo(location, redirectUri)).toBe("/reservations?date=2026-09-01");
  });

  it("preserves the hash fragment", () => {
    const location = { pathname: "/hospitality/guests", search: "", hash: "#top" };
    expect(deriveReturnTo(location, redirectUri)).toBe("/guests#top");
  });

  it("returns / when the location is exactly the app base path", () => {
    const location = { pathname: "/hospitality", search: "", hash: "" };
    expect(deriveReturnTo(location, redirectUri)).toBe("/");
  });

  it("keeps the query when at the base path", () => {
    const location = { pathname: "/hospitality", search: "?tab=1", hash: "" };
    expect(deriveReturnTo(location, redirectUri)).toBe("/?tab=1");
  });

  it("leaves paths outside the base path untouched", () => {
    const location = { pathname: "/other/page", search: "", hash: "" };
    expect(deriveReturnTo(location, redirectUri)).toBe("/other/page");
  });

  it("does not strip a base path that only prefix-matches a longer segment", () => {
    const location = { pathname: "/hospitalityfoo/page", search: "", hash: "" };
    expect(deriveReturnTo(location, redirectUri)).toBe("/hospitalityfoo/page");
  });

  it("handles a root-mounted app (redirect URI /callback)", () => {
    const location = { pathname: "/reservations", search: "?date=x", hash: "" };
    expect(deriveReturnTo(location, "https://app.example.com/callback")).toBe(
      "/reservations?date=x"
    );
  });

  it("falls back to / when the derived value is not a safe path", () => {
    const location = { pathname: "/hospitality//evil.com", search: "", hash: "" };
    expect(deriveReturnTo(location, redirectUri)).toBe("/");
  });

  it("falls back to the raw path when the redirect URI is unparseable", () => {
    const location = { pathname: "/reservations", search: "", hash: "" };
    expect(deriveReturnTo(location, "")).toBe("/reservations");
  });
});

describe("extractReturnTo", () => {
  it("returns the returnTo when the state carries a safe path", () => {
    expect(extractReturnTo({ returnTo: "/reservations?date=x" })).toBe("/reservations?date=x");
  });

  it("returns undefined for an unsafe returnTo", () => {
    expect(extractReturnTo({ returnTo: "https://evil.com" })).toBeUndefined();
    expect(extractReturnTo({ returnTo: "//evil.com" })).toBeUndefined();
  });

  it("returns undefined for missing or malformed state", () => {
    expect(extractReturnTo(undefined)).toBeUndefined();
    expect(extractReturnTo(null)).toBeUndefined();
    expect(extractReturnTo("string-state")).toBeUndefined();
    expect(extractReturnTo({})).toBeUndefined();
  });
});
