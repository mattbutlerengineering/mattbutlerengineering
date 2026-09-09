import { describe, it, expect } from "vitest";
import { hasAuthParams } from "./index.js";
import { hasAuthParams as oidcHasAuthParams } from "react-oidc-context";

describe("hasAuthParams", () => {
  it("is react-oidc-context's own export, re-exported rather than reimplemented", () => {
    expect(hasAuthParams).toBe(oidcHasAuthParams);
  });

  it("returns true when the search string carries code and state", () => {
    expect(hasAuthParams({ search: "?code=a&state=b", hash: "" } as Location)).toBe(true);
  });

  it("returns false when neither code/error nor state is present", () => {
    expect(hasAuthParams({ search: "", hash: "" } as Location)).toBe(false);
  });
});
