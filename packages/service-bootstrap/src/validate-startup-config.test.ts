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
    expect(() => validateStartupConfig({ AUTH_AUTHORITY: "dev-tenant.us.auth0.com" })).toThrow(
      /AUTH_AUTHORITY/
    );
  });

  it("throws when AUTH_AUTHORITY is whitespace only", () => {
    expect(() => validateStartupConfig({ AUTH_AUTHORITY: "   " })).toThrow(/AUTH_AUTHORITY/);
  });

  it("throws when AUTH_AUTHORITY uses a non-http(s) scheme", () => {
    expect(() => validateStartupConfig({ AUTH_AUTHORITY: "ftp://tenant.us.auth0.com" })).toThrow(
      /AUTH_AUTHORITY/
    );
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

describe("validateStartupConfig — SENTRY_DSN", () => {
  // The blackout this guard exists to end: initSentry returns early and
  // silently when the DSN is absent, so a service with no error reporting and
  // a service that simply has not errored yet produce identical evidence.
  // Boot is the last place the difference is still observable.
  it("refuses to boot in production when SENTRY_DSN is unset", () => {
    expect(() => validateStartupConfig({ NODE_ENV: "production" })).toThrow(/SENTRY_DSN/);
  });

  it("refuses to boot in production when SENTRY_DSN is empty", () => {
    expect(() => validateStartupConfig({ NODE_ENV: "production", SENTRY_DSN: "" })).toThrow(
      /SENTRY_DSN/
    );
  });

  it("refuses to boot in production when SENTRY_DSN is whitespace only", () => {
    expect(() => validateStartupConfig({ NODE_ENV: "production", SENTRY_DSN: "   " })).toThrow(
      /SENTRY_DSN/
    );
  });

  it("boots in production once SENTRY_DSN is present", () => {
    expect(() =>
      validateStartupConfig({
        NODE_ENV: "production",
        SENTRY_DSN: "https://key@o1.ingest.sentry.io/2",
      })
    ).not.toThrow();
  });

  it("never names the DSN value in the error, only that it is missing", () => {
    // Same stance as the AUTH_AUTHORITY errors above: shape, never content.
    let message = "";
    try {
      validateStartupConfig({ NODE_ENV: "production", SENTRY_DSN: "  " });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("SENTRY_DSN");
    expect(message).not.toContain("  ");
  });

  it("leaves development and test alone so local runs need no DSN", () => {
    expect(() => validateStartupConfig({ NODE_ENV: "development" })).not.toThrow();
    expect(() => validateStartupConfig({ NODE_ENV: "test" })).not.toThrow();
    expect(() => validateStartupConfig({})).not.toThrow();
  });
});
