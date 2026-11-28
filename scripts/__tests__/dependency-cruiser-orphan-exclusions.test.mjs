/**
 * `pnpm check:boundaries`'s no-orphans rule only recognizes one test-setup
 * naming convention (`setupTests.ts`) in its pathNot allowlist. Files wired
 * up only as a string in a vitest `setupFiles` array (never imported by
 * other source) under a different name false-positive as orphans — e.g.
 * packages/hospitality-sidenav/src/test-setup.ts. See .dependency-cruiser.cjs.
 */

import { describe, it, expect } from "vitest";

import depCruiserConfig from "../../.dependency-cruiser.cjs";

function noOrphansPathNotPatterns() {
  const rule = depCruiserConfig.forbidden.find((r) => r.name === "no-orphans");
  return rule.from.pathNot.map((p) => new RegExp(p));
}

describe("no-orphans pathNot allowlist", () => {
  it("excludes a vitest setupFiles entry named test-setup.ts", () => {
    const patterns = noOrphansPathNotPatterns();
    const target = "packages/hospitality-sidenav/src/test-setup.ts";

    expect(patterns.some((re) => re.test(target))).toBe(true);
  });
});
