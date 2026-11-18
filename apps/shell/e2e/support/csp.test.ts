import { describe, it, expect } from "vitest";
import {
  KNOWN_PRE_EXISTING_CSP_VIOLATIONS,
  scriptSrc,
  unexpectedViolations,
  weakensScripts,
} from "./csp.js";
import { buildCspDirectives } from "@mbe/edge-worker/csp.js";

describe("weakensScripts", () => {
  it("is false for the policy the real edge builds", () => {
    expect(weakensScripts(buildCspDirectives("0".repeat(32)))).toBe(false);
  });
  it("flags unsafe-eval and unsafe-inline in script-src only", () => {
    expect(weakensScripts("script-src 'self' 'unsafe-eval'")).toBe(true);
    expect(weakensScripts("script-src 'self' 'unsafe-inline'")).toBe(true);
    expect(weakensScripts("script-src 'self'; style-src 'unsafe-inline'")).toBe(false);
  });
  it("finds the script-src directive", () => {
    expect(scriptSrc("default-src 'self'; script-src 'self' 'nonce-a'")).toBe(
      "script-src 'self' 'nonce-a'"
    );
    expect(scriptSrc("default-src 'self'")).toBe("");
  });
});

describe("unexpectedViolations", () => {
  const evalViolation = { directive: "script-src", source: "/hospitality/assets/json-render-1.js" };
  it("reports every violation when nothing is known pre-existing", () => {
    expect(KNOWN_PRE_EXISTING_CSP_VIOLATIONS).toEqual([]);
    expect(unexpectedViolations([evalViolation])).toEqual([evalViolation]);
  });
  it("allows only a violation named by directive and source", () => {
    const known = [{ directive: "script-src", sourceFileIncludes: "json-render" }];
    expect(unexpectedViolations([evalViolation], known)).toEqual([]);
    const other = { directive: "script-src", source: "/rialto/assets/x.js" };
    expect(unexpectedViolations([evalViolation, other], known)).toEqual([other]);
  });
});
