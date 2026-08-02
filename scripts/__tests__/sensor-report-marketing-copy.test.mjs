/**
 * Covers #3659: apps/marketing/public/sensor-report.json must be refreshed
 * by the same run that writes metrics/sensor-report.json, so the public
 * AI-health page never goes stale again.
 *
 * `writeMarketingCopy` is root-injectable (matching metrics-store.mjs's DI
 * style) so this test never touches the real repo files.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { write, resolvePath } from "../metrics-store.mjs";
import { writeMarketingCopy } from "../sensor-report.mjs";

describe("writeMarketingCopy", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sensor-report-marketing-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("resolves to apps/marketing/public/sensor-report.json under root", () => {
    const marketingPath = writeMarketingCopy(
      { generated_at: "2026-08-02T00:00:00.000Z" },
      { root }
    );
    expect(marketingPath).toBe(join(root, "apps", "marketing", "public", "sensor-report.json"));
  });

  it("creates apps/marketing/public when it does not exist yet", () => {
    const marketingPath = writeMarketingCopy(
      { generated_at: "2026-08-02T00:00:00.000Z" },
      { root }
    );
    expect(existsSync(marketingPath)).toBe(true);
  });

  it("writes a copy identical to metrics/sensor-report.json, including generated_at", () => {
    const report = {
      generated_at: "2026-08-02T00:00:00.000Z",
      period: { start: "2026-07-26", end: "2026-08-02" },
      sensors: { acmm: { available: true, level: 5 } },
      summary: {
        sensors_available: 1,
        sensors_total: 1,
        regressions_detected: 0,
        status: "healthy",
      },
    };
    write("sensor-report", report, { root });

    const marketingPath = writeMarketingCopy(report, { root });

    const metricsCopy = JSON.parse(readFileSync(resolvePath("sensor-report", { root }), "utf-8"));
    const marketingCopy = JSON.parse(readFileSync(marketingPath, "utf-8"));
    expect(marketingCopy).toEqual(metricsCopy);
    expect(marketingCopy.generated_at).toBe(report.generated_at);
  });
});
