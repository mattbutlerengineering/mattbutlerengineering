import { describe, it, expect } from "vitest";
import { isSilentAuthError, SILENT_AUTH_ERROR_SOURCES } from "./auth-error.js";

describe("isSilentAuthError", () => {
  it.each(SILENT_AUTH_ERROR_SOURCES)("treats source=%s as silent", (source) => {
    expect(isSilentAuthError(Object.assign(new Error("renew failed"), { source }))).toBe(true);
  });

  it.each(["signinCallback", "signoutCallback", "signinRedirect", "signinPopup", "unknown"])(
    "treats source=%s as interactive (not silent)",
    (source) => {
      expect(isSilentAuthError(Object.assign(new Error("boom"), { source }))).toBe(false);
    }
  );

  it("treats an error with no source as interactive", () => {
    expect(isSilentAuthError(new Error("boom"))).toBe(false);
  });

  it("treats undefined and non-object values as not silent", () => {
    expect(isSilentAuthError(undefined)).toBe(false);
    expect(isSilentAuthError(null)).toBe(false);
    expect(isSilentAuthError("signinSilent")).toBe(false);
  });
});
