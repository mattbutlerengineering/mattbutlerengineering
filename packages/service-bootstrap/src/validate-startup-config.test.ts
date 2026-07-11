import { describe, it, expect } from "vitest";
import { buildJwksUrl, validateStartupConfig } from "./validate-startup-config.js";

describe("buildJwksUrl", () => {
  it("returns undefined when the authority is undefined", () => {
    expect(buildJwksUrl(undefined)).toBeUndefined();
  });

  it("returns undefined when the authority is an empty string", () => {
    expect(buildJwksUrl("")).toBeUndefined();
  });

  it("appends the JWKS path to an authority without a trailing slash", () => {
    expect(buildJwksUrl("https://tenant.us.auth0.com")).toBe(
      "https://tenant.us.auth0.com/.well-known/jwks.json"
    );
  });

  it("strips a single trailing slash so the JWKS URL never doubles it", () => {
    expect(buildJwksUrl("https://tenant.us.auth0.com/")).toBe(
      "https://tenant.us.auth0.com/.well-known/jwks.json"
    );
  });
});

describe("validateStartupConfig", () => {
  it("does not throw when AUTH_AUTHORITY is absent (governed by fail-closed auth gate)", () => {
    expect(() => validateStartupConfig({})).not.toThrow();
  });

  it("does not throw when AUTH_AUTHORITY is an empty string", () => {
    expect(() => validateStartupConfig({ AUTH_AUTHORITY: "" })).not.toThrow();
  });

  it("does not throw for a well-formed https authority", () => {
    expect(() =>
      validateStartupConfig({ AUTH_AUTHORITY: "https://tenant.us.auth0.com" })
    ).not.toThrow();
  });

  it("does not throw for a well-formed https authority with a trailing slash", () => {
    expect(() =>
      validateStartupConfig({ AUTH_AUTHORITY: "https://tenant.us.auth0.com/" })
    ).not.toThrow();
  });

  it("throws when AUTH_AUTHORITY does not parse as a URL", () => {
    expect(() =>
      validateStartupConfig({ AUTH_AUTHORITY: "dev-tenant.us.auth0.com" })
    ).toThrow(/AUTH_AUTHORITY/);
  });

  it("throws when AUTH_AUTHORITY is whitespace only", () => {
    expect(() => validateStartupConfig({ AUTH_AUTHORITY: "   " })).toThrow(/AUTH_AUTHORITY/);
  });

  it("throws when AUTH_AUTHORITY uses a non-http(s) scheme", () => {
    expect(() =>
      validateStartupConfig({ AUTH_AUTHORITY: "ftp://tenant.us.auth0.com" })
    ).toThrow(/AUTH_AUTHORITY/);
  });

  it("names the offending variable but never leaks the raw value (logs shape only)", () => {
    const secretish = "totally-bogus-authority-DO-NOT-LEAK";
    let caught: unknown;
    try {
      validateStartupConfig({ AUTH_AUTHORITY: secretish });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("AUTH_AUTHORITY");
    expect(message).not.toContain(secretish);
  });

  it("does not leak the raw value for a non-http scheme either", () => {
    const secretish = "gopher://SECRET-HOST-abc123";
    let caught: unknown;
    try {
      validateStartupConfig({ AUTH_AUTHORITY: secretish });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain("SECRET-HOST-abc123");
  });
});
