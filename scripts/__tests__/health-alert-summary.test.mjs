import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHealthAlertSummary } from "../lib/health-alert-summary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/synthetic-monitoring.yml"), "utf8");

// ---------------------------------------------------------------------------
// buildHealthAlertSummary — pure decision (#4359)
//
// Bug: the coarse (unauthenticated) /health/system response only carries
// {status} per subsystem, never a `.checks` map (that requires a valid
// Bearer token). The old inline jq only read `.checks`, so a degraded
// `services` or `static_sites` subsystem with no `.checks` produced an
// empty SUMMARY, and issue #4359 landed with title "System health degraded: ".
// ---------------------------------------------------------------------------

describe("buildHealthAlertSummary", () => {
  it("reports the subsystem-level status when services is degraded with no .checks (#4359 bug case)", () => {
    const result = buildHealthAlertSummary({
      status: "degraded",
      subsystems: {
        services: { status: "degraded" },
        static_sites: { status: "ok" },
        ci: { status: "healthy" },
        deploys: { status: "healthy" },
      },
    });

    expect(result.title).not.toBe("System health degraded: ");
    expect(result.title).toContain("Services: degraded");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.failedServices).toBe("");
  });

  it("reports static_sites status when degraded with no .checks", () => {
    const result = buildHealthAlertSummary({
      status: "degraded",
      subsystems: {
        services: { status: "ok" },
        static_sites: { status: "degraded" },
        ci: { status: "healthy" },
        deploys: { status: "healthy" },
      },
    });

    expect(result.title).toContain("Static sites: degraded");
    expect(result.failedSites).toBe("");
  });

  it("prefers per-check detail over the coarse status when .checks is present (authenticated response)", () => {
    const result = buildHealthAlertSummary({
      status: "degraded",
      subsystems: {
        services: {
          status: "degraded",
          checks: {
            users: { status: "error" },
            reservations: { status: "ok" },
          },
        },
        static_sites: { status: "ok" },
        ci: { status: "healthy" },
        deploys: { status: "healthy" },
      },
    });

    expect(result.failedServices).toBe("users");
    expect(result.title).toContain("Services down: users");
    expect(result.title).not.toContain("no per-check detail");
  });

  it("does not flag services/static_sites when their status is ok, even without .checks", () => {
    const result = buildHealthAlertSummary({
      status: "healthy",
      subsystems: {
        services: { status: "ok" },
        static_sites: { status: "ok" },
        ci: { status: "healthy" },
        deploys: { status: "healthy" },
      },
    });

    expect(result.summary).toBe("");
    expect(result.title).toBe("System health healthy: ");
  });

  it("still reports CI and deploy status regressions", () => {
    const result = buildHealthAlertSummary({
      status: "degraded",
      subsystems: {
        services: { status: "ok" },
        static_sites: { status: "ok" },
        ci: { status: "failing" },
        deploys: { status: "stuck" },
      },
    });

    expect(result.ciStatus).toBe("failing");
    expect(result.deployStatus).toBe("stuck");
    expect(result.title).toContain("CI: failing");
    expect(result.title).toContain("Deploys: stuck");
  });

  it("handles a missing subsystems object without crashing, still reporting unknown statuses", () => {
    const result = buildHealthAlertSummary({ status: "degraded" });

    expect(result.title).not.toBe("System health degraded: ");
    expect(result.failedServices).toBe("");
    expect(result.failedSites).toBe("");
    expect(result.ciStatus).toBe("unknown");
    expect(result.deployStatus).toBe("unknown");
    expect(result.title).toContain("CI: unknown");
    expect(result.title).toContain("Deploys: unknown");
  });

  it("truncates the title to 256 characters", () => {
    const longChecks = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`service-${i}-with-a-long-name`, { status: "error" }])
    );
    const result = buildHealthAlertSummary({
      status: "degraded",
      subsystems: {
        services: { status: "degraded", checks: longChecks },
        static_sites: { status: "ok" },
        ci: { status: "healthy" },
        deploys: { status: "healthy" },
      },
    });

    expect(result.title.length).toBeLessThanOrEqual(256);
  });
});

describe("synthetic-monitoring.yml wiring", () => {
  it("calls the health-alert-summary CLI instead of inline .checks-only jq", () => {
    expect(WORKFLOW).toMatch(/node scripts\/lib\/health-alert-summary\.mjs/);
  });
});
