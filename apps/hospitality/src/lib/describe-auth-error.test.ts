import { describe, it, expect } from "vitest";
import { describeAuthError } from "./describe-auth-error.js";

describe("describeAuthError", () => {
  it("categorizes OIDC access_denied via the error code field", () => {
    const error = Object.assign(new Error("The user is not permitted"), {
      error: "access_denied",
    });
    const result = describeAuthError(error);
    expect(result.title).toBe("Access denied");
    expect(result.body).toContain("doesn't have access");
    expect(result.canRetry).toBe(false);
  });

  it("categorizes access denied mentioned in the message", () => {
    const result = describeAuthError(new Error("access_denied: not allowed"));
    expect(result.title).toBe("Access denied");
    expect(result.canRetry).toBe(false);
  });

  it("categorizes a state mismatch as an expired sign-in link", () => {
    const result = describeAuthError(new Error("No matching state found in storage"));
    expect(result.title).toBe("That sign-in link expired");
    expect(result.canRetry).toBe(true);
  });

  it("categorizes an invalid nonce as an expired sign-in link", () => {
    const result = describeAuthError(new Error("Invalid nonce in id_token"));
    expect(result.title).toBe("That sign-in link expired");
    expect(result.canRetry).toBe(true);
  });

  it("categorizes fetch failures as unreachable sign-in service", () => {
    const result = describeAuthError(new TypeError("Failed to fetch"));
    expect(result.title).toBe("Can't reach the sign-in service");
    expect(result.canRetry).toBe(true);
  });

  it("categorizes network errors as unreachable sign-in service", () => {
    const result = describeAuthError(new Error("Network Error"));
    expect(result.title).toBe("Can't reach the sign-in service");
    expect(result.canRetry).toBe(true);
  });

  it("categorizes timeouts as unreachable sign-in service", () => {
    const result = describeAuthError(new Error("Request timed out"));
    expect(result.title).toBe("Can't reach the sign-in service");
    expect(result.canRetry).toBe(true);
  });

  it("falls back to a generic retryable description", () => {
    const result = describeAuthError(new Error("something exotic happened"));
    expect(result.title).toBe("Sign-in hit a snag");
    expect(result.body.length).toBeGreaterThan(0);
    expect(result.canRetry).toBe(true);
  });

  it("falls back safely on an empty message", () => {
    const result = describeAuthError(new Error(""));
    expect(result.title).toBe("Sign-in hit a snag");
    expect(result.canRetry).toBe(true);
  });
});
