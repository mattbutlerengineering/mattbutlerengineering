import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// #7245: source guards for the playground axe run. The spec itself needs Auth0
// secrets and only runs in CI, so these pin the mechanisms it depends on.
const APP_DIR = resolve(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(resolve(APP_DIR, rel), "utf8");

describe("playground a11y contrast (#7245)", () => {
  it("audits under reduced motion so card fade-in is not sampled mid-animation", () => {
    const spec = read("e2e/playground.spec.ts");
    const emulate = spec.indexOf('emulateMedia({ reducedMotion: "reduce" })');
    expect(emulate).toBeGreaterThan(-1);
    expect(emulate).toBeLessThan(spec.indexOf("new AxeBuilder"));
  });

  it("keeps the critical/serious filter", () => {
    expect(read("e2e/playground.spec.ts")).toMatch(
      /impact === "critical" \|\| v\.impact === "serious"/
    );
  });

  it("header ghost buttons use the secondary text token (>= 4.5:1)", () => {
    const rule = read("src/components/AppShell.module.css").match(
      /\.actions \.headerGhost:not\(:hover\)\s*\{([^}]*)\}/
    );
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--rialto-text-secondary\)/);
  });

  it("inspector empty state uses the secondary text token on the recessed surface", () => {
    const rule = read("src/components/JsonInspector.module.css").match(/\.empty\s*\{([^}]*)\}/);
    expect(rule![1]).toMatch(/color:\s*var\(--rialto-text-secondary\)/);
  });
});
