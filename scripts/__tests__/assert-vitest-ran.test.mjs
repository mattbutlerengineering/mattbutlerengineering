import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSuitesRan } from "../assert-vitest-ran.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CI_WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

describe("assertSuitesRan (#5369)", () => {
  it("passes when every test executed and none were skipped", () => {
    const result = assertSuitesRan({
      numTotalTests: 26,
      numPassedTests: 26,
      numFailedTests: 0,
      numPendingTests: 0,
    });
    expect(result).toEqual({ ok: true, numTotalTests: 26, numPassedTests: 26 });
  });

  it("fails when describe.skipIf skipped every test — the exact shape a missing DATABASE_URL produces", () => {
    // Measured directly against this repo's two RLS integration suites with
    // DATABASE_URL unset: numTotalTests stays 26, numPassedTests drops to 0,
    // numPendingTests becomes 26, and vitest's own `success` field is still
    // `true` — the report itself has no red flag except this count.
    const result = assertSuitesRan({
      numTotalTests: 26,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 26,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/skipped\/pending/);
  });

  it("fails when a partial run leaves some tests pending", () => {
    const result = assertSuitesRan({
      numTotalTests: 26,
      numPassedTests: 20,
      numFailedTests: 0,
      numPendingTests: 6,
    });
    expect(result.ok).toBe(false);
  });

  it("fails when the report shows zero tests at all", () => {
    const result = assertSuitesRan({
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/zero tests/);
  });

  it("fails when a real test failure is present", () => {
    const result = assertSuitesRan({
      numTotalTests: 26,
      numPassedTests: 23,
      numFailedTests: 3,
      numPendingTests: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/failed/);
  });

  it("fails closed on a missing/malformed report", () => {
    expect(assertSuitesRan(undefined).ok).toBe(false);
    expect(assertSuitesRan({}).ok).toBe(false);
  });
});

describe("ci.yml — RLS integration job wiring (#5369)", () => {
  it("runs both RLS integration suites against a non-superuser owner role", () => {
    expect(CI_WORKFLOW).toContain("src/routes/rls-owner-enforcement.integration.test.ts");
    expect(CI_WORKFLOW).toContain("src/routes/rls-isolation.integration.test.ts");
    expect(CI_WORKFLOW).toContain("CREATEROLE");
  });

  it("proves the suites ran via the pure assert-vitest-ran.mjs script, not exit code alone", () => {
    expect(CI_WORKFLOW).toContain("scripts/assert-vitest-ran.mjs");
  });

  it("is wired into ci-gate's needs, so a failure there blocks merges", () => {
    const gateSection = CI_WORKFLOW.slice(CI_WORKFLOW.indexOf("ci-gate:"));
    expect(gateSection).toContain("rls-integration");
  });
});
