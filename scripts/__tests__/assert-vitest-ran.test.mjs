import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
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
  it("runs the RLS integration suites against a non-superuser owner role", () => {
    expect(CI_WORKFLOW).toContain("src/routes/rls-owner-enforcement.integration.test.ts");
    expect(CI_WORKFLOW).toContain("src/routes/rls-isolation.integration.test.ts");
    // PR 2's route-sweep suite: a real buildApp() against the same owner
    // role, injecting every registered route under RLS_CONTEXT_MODE=throw.
    expect(CI_WORKFLOW).toContain("src/routes/rls-route-sweep.integration.test.ts");
    expect(CI_WORKFLOW).toContain("CREATEROLE");
  });

  it("runs EVERY DATABASE_URL-gated suite in the service, not just the ones that were noticed", () => {
    // The whole point of this job is that a `describe.skipIf(!DATABASE_URL)`
    // suite reads as passing while running nothing. A suite gated that way
    // and absent from this job's file list is in exactly the state the job
    // exists to end — `lapsed-guest-cron.rls.integration.test.ts` was that
    // case, and `rls-route-sweep.integration.test.ts` (PR 2) is the fourth.
    // Discovered by reading the service, so a fifth such suite added later
    // fails here instead of silently never running.
    const serviceRoot = resolve(ROOT, "services/reservations/src");
    const gated = [];

    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".test.ts")) {
          if (/describe\.skipIf\(\s*!\s*DATABASE_URL\s*\)/.test(readFileSync(full, "utf8"))) {
            gated.push(relative(resolve(ROOT, "services/reservations"), full));
          }
        }
      }
    };
    walk(serviceRoot);

    expect(gated.length).toBeGreaterThan(0);
    for (const suite of gated) {
      expect(CI_WORKFLOW, `${suite} is DATABASE_URL-gated but never runs`).toContain(suite);
    }
  });

  it("asserts on the same report path the vitest step writes", () => {
    // The run step's --outputFile is relative to services/reservations (pnpm
    // --filter exec sets that cwd); the assert step takes a repo-relative
    // path. Nothing but this test keeps the two in step, and a mismatch
    // breaks at runtime rather than here.
    // Scoped to this job's own block: ci.yml carries another --outputFile
    // (rialto's a11y run), and an unscoped match reads that one instead.
    const job = CI_WORKFLOW.slice(
      CI_WORKFLOW.indexOf("  rls-integration:"),
      CI_WORKFLOW.indexOf("  ai-antipattern-ratchet:")
    );
    const written = job.match(/--outputFile=(\S+)/)?.[1];

    expect(written).toBeTruthy();
    expect(written).not.toMatch(/a11y/);
    expect(job).toContain(`scripts/assert-vitest-ran.mjs services/reservations/${written}`);
  });

  it("proves the suites ran via the pure assert-vitest-ran.mjs script, not exit code alone", () => {
    expect(CI_WORKFLOW).toContain("scripts/assert-vitest-ran.mjs");
  });

  it("does not describe a non-failure count mismatch as failures", () => {
    const verdict = assertSuitesRan({
      numTotalTests: 33,
      numPassedTests: 32,
      numPendingTests: 0,
      numFailedTests: 0,
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).not.toMatch(/tests failed/);
    expect(verdict.reason).toMatch(/neither passed nor failed/);
  });

  it("is wired into ci-gate's needs, so a failure there blocks merges", () => {
    const gateSection = CI_WORKFLOW.slice(CI_WORKFLOW.indexOf("ci-gate:"));
    expect(gateSection).toContain("rls-integration");
  });
});
