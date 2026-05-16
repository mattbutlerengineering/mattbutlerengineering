import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  measureAppBundleSize,
  measureAllBundles,
  loadBaseline,
  saveBaseline,
  compareWithBaseline,
  formatReport,
} from "../bundle-size-tracker.js";
import type { BundleSizeBaseline, BundleSizeEntry } from "../bundle-size-tracker.js";

// ── Helpers ─────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bundle-size-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function createFile(dir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(dir, relativePath);
  await mkdir(join(fullPath, ".."), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

// ── measureAppBundleSize ────────────────────────────────────────────

describe("measureAppBundleSize", () => {
  it("should measure files in a dist directory", async () => {
    const distPath = join(tmpDir, "dist");
    await mkdir(distPath, { recursive: true });
    await createFile(distPath, "index.js", "a".repeat(1000));
    await createFile(distPath, "style.css", "b".repeat(500));

    const result = await measureAppBundleSize(distPath, "marketing");

    expect(result.app).toBe("marketing");
    expect(result.totalBytes).toBe(1500);
    expect(result.files).toHaveLength(2);
    expect(result.timestamp).toBeTruthy();
  });

  it("should handle nested directories", async () => {
    const distPath = join(tmpDir, "dist");
    await mkdir(distPath, { recursive: true });
    await createFile(distPath, "assets/js/main.js", "x".repeat(2000));
    await createFile(distPath, "assets/css/app.css", "y".repeat(800));
    await createFile(distPath, "index.html", "z".repeat(200));

    const result = await measureAppBundleSize(distPath, "hospitality");

    expect(result.app).toBe("hospitality");
    expect(result.totalBytes).toBe(3000);
    expect(result.files).toHaveLength(3);
  });

  it("should not count directories as files", async () => {
    const distPath = join(tmpDir, "dist");
    await mkdir(join(distPath, "assets", "js"), { recursive: true });
    await createFile(distPath, "assets/js/main.js", "content");

    const result = await measureAppBundleSize(distPath, "test-app");

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toContain("main.js");
  });

  it("should return zero bytes for empty dist directory", async () => {
    const distPath = join(tmpDir, "dist");
    await mkdir(distPath, { recursive: true });

    const result = await measureAppBundleSize(distPath, "empty-app");

    expect(result.totalBytes).toBe(0);
    expect(result.files).toHaveLength(0);
  });
});

// ── measureAllBundles ───────────────────────────────────────────────

describe("measureAllBundles", () => {
  it("should measure all apps with dist directories", async () => {
    const appsDir = join(tmpDir, "apps");
    await createFile(join(appsDir, "alpha", "dist"), "index.js", "a".repeat(100));
    await createFile(join(appsDir, "beta", "dist"), "index.js", "b".repeat(200));

    const results = await measureAllBundles(tmpDir);

    expect(results).toHaveLength(2);
    expect(results[0].app).toBe("alpha");
    expect(results[0].totalBytes).toBe(100);
    expect(results[1].app).toBe("beta");
    expect(results[1].totalBytes).toBe(200);
  });

  it("should skip apps without dist directories", async () => {
    const appsDir = join(tmpDir, "apps");
    await createFile(join(appsDir, "has-dist", "dist"), "index.js", "content");
    await mkdir(join(appsDir, "no-dist", "src"), { recursive: true });

    const results = await measureAllBundles(tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].app).toBe("has-dist");
  });

  it("should return results sorted by app name", async () => {
    const appsDir = join(tmpDir, "apps");
    await createFile(join(appsDir, "zeta", "dist"), "index.js", "z");
    await createFile(join(appsDir, "alpha", "dist"), "index.js", "a");
    await createFile(join(appsDir, "mid", "dist"), "index.js", "m");

    const results = await measureAllBundles(tmpDir);

    expect(results.map((r) => r.app)).toEqual(["alpha", "mid", "zeta"]);
  });
});

// ── loadBaseline / saveBaseline ─────────────────────────────────────

describe("loadBaseline / saveBaseline", () => {
  it("should round-trip baseline data", async () => {
    const baselinePath = join(tmpDir, "baseline.json");
    const entries: readonly BundleSizeEntry[] = [
      {
        app: "marketing",
        totalBytes: 50000,
        files: [{ path: "index.js", bytes: 50000 }],
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];

    await saveBaseline(baselinePath, entries);
    const loaded = await loadBaseline(baselinePath);

    expect(loaded).not.toBeNull();
    expect(loaded!.entries).toHaveLength(1);
    expect(loaded!.entries[0].app).toBe("marketing");
    expect(loaded!.entries[0].totalBytes).toBe(50000);
    expect(loaded!.version).toBe(1);
    expect(loaded!.updatedAt).toBeTruthy();
  });

  it("should return null for missing file", async () => {
    const result = await loadBaseline(join(tmpDir, "nonexistent.json"));
    expect(result).toBeNull();
  });

  it("should return null for invalid version", async () => {
    const baselinePath = join(tmpDir, "bad-version.json");
    await writeFile(
      baselinePath,
      JSON.stringify({ entries: [], updatedAt: "2026-01-01", version: 999 }),
      "utf-8"
    );

    const result = await loadBaseline(baselinePath);
    expect(result).toBeNull();
  });

  it("should return null for invalid JSON", async () => {
    const baselinePath = join(tmpDir, "bad.json");
    await writeFile(baselinePath, "not valid json", "utf-8");

    const result = await loadBaseline(baselinePath);
    expect(result).toBeNull();
  });

  it("should create parent directories when saving", async () => {
    const baselinePath = join(tmpDir, "nested", "deep", "baseline.json");
    await saveBaseline(baselinePath, []);

    const content = await readFile(baselinePath, "utf-8");
    const parsed = JSON.parse(content) as BundleSizeBaseline;
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toHaveLength(0);
  });
});

// ── compareWithBaseline ─────────────────────────────────────────────

describe("compareWithBaseline", () => {
  const makeCurrent = (app: string, totalBytes: number): BundleSizeEntry => ({
    app,
    totalBytes,
    files: [{ path: "index.js", bytes: totalBytes }],
    timestamp: "2026-03-29T00:00:00.000Z",
  });

  const makeBaseline = (entries: readonly BundleSizeEntry[]): BundleSizeBaseline => ({
    entries,
    updatedAt: "2026-03-28T00:00:00.000Z",
    version: 1,
  });

  it("should report no regressions when no baseline exists", () => {
    const current = [makeCurrent("marketing", 50000)];
    const report = compareWithBaseline(current, null);

    expect(report.hasRegressions).toBe(false);
    expect(report.comparisons).toHaveLength(1);
    expect(report.comparisons[0].previousBytes).toBe(0);
    expect(report.comparisons[0].regression).toBe(false);
  });

  it("should detect regression above threshold", () => {
    const baseline = makeBaseline([makeCurrent("marketing", 100000)]);
    const current = [makeCurrent("marketing", 115000)];

    const report = compareWithBaseline(current, baseline);

    expect(report.hasRegressions).toBe(true);
    expect(report.comparisons[0].regression).toBe(true);
    expect(report.comparisons[0].deltaPercent).toBeCloseTo(15);
    expect(report.comparisons[0].deltaBytes).toBe(15000);
  });

  it("should not flag regression under threshold", () => {
    const baseline = makeBaseline([makeCurrent("marketing", 100000)]);
    const current = [makeCurrent("marketing", 105000)];

    const report = compareWithBaseline(current, baseline);

    expect(report.hasRegressions).toBe(false);
    expect(report.comparisons[0].regression).toBe(false);
    expect(report.comparisons[0].deltaPercent).toBeCloseTo(5);
  });

  it("should not flag regression at exactly the threshold", () => {
    const baseline = makeBaseline([makeCurrent("marketing", 100000)]);
    const current = [makeCurrent("marketing", 110000)];

    const report = compareWithBaseline(current, baseline);

    expect(report.hasRegressions).toBe(false);
    expect(report.comparisons[0].regression).toBe(false);
    expect(report.comparisons[0].deltaPercent).toBeCloseTo(10);
  });

  it("should handle size decrease gracefully", () => {
    const baseline = makeBaseline([makeCurrent("marketing", 100000)]);
    const current = [makeCurrent("marketing", 80000)];

    const report = compareWithBaseline(current, baseline);

    expect(report.hasRegressions).toBe(false);
    expect(report.comparisons[0].deltaBytes).toBe(-20000);
    expect(report.comparisons[0].deltaPercent).toBeCloseTo(-20);
  });

  it("should support custom threshold", () => {
    const baseline = makeBaseline([makeCurrent("marketing", 100000)]);
    const current = [makeCurrent("marketing", 106000)];

    const strictReport = compareWithBaseline(current, baseline, 5);
    expect(strictReport.hasRegressions).toBe(true);

    const lenientReport = compareWithBaseline(current, baseline, 10);
    expect(lenientReport.hasRegressions).toBe(false);
  });

  it("should handle multiple apps with mixed results", () => {
    const baseline = makeBaseline([
      makeCurrent("hospitality", 100000),
      makeCurrent("marketing", 50000),
    ]);
    const current = [makeCurrent("hospitality", 120000), makeCurrent("marketing", 51000)];

    const report = compareWithBaseline(current, baseline);

    expect(report.hasRegressions).toBe(true);
    const hospitality = report.comparisons.find((c) => c.app === "hospitality")!;
    const marketing = report.comparisons.find((c) => c.app === "marketing")!;
    expect(hospitality.regression).toBe(true);
    expect(marketing.regression).toBe(false);
  });

  it("should include summary text", () => {
    const current = [makeCurrent("marketing", 50000)];
    const report = compareWithBaseline(current, null);

    expect(report.summary).toContain("marketing");
    expect(report.summary).toContain("threshold");
  });
});

// ── formatReport ────────────────────────────────────────────────────

describe("formatReport", () => {
  it("should produce a table with header and rows", () => {
    const report = compareWithBaseline(
      [
        {
          app: "marketing",
          totalBytes: 51200,
          files: [{ path: "index.js", bytes: 51200 }],
          timestamp: "2026-03-29T00:00:00.000Z",
        },
      ],
      {
        entries: [
          {
            app: "marketing",
            totalBytes: 50000,
            files: [{ path: "index.js", bytes: 50000 }],
            timestamp: "2026-03-28T00:00:00.000Z",
          },
        ],
        updatedAt: "2026-03-28T00:00:00.000Z",
        version: 1,
      }
    );

    const output = formatReport(report);

    expect(output).toContain("App");
    expect(output).toContain("Before");
    expect(output).toContain("After");
    expect(output).toContain("Delta");
    expect(output).toContain("Status");
    expect(output).toContain("marketing");
    expect(output).toContain("ok");
  });

  it("should show REGRESSION for flagged apps", () => {
    const report = compareWithBaseline(
      [
        {
          app: "hospitality",
          totalBytes: 200000,
          files: [],
          timestamp: "2026-03-29T00:00:00.000Z",
        },
      ],
      {
        entries: [
          {
            app: "hospitality",
            totalBytes: 100000,
            files: [],
            timestamp: "2026-03-28T00:00:00.000Z",
          },
        ],
        updatedAt: "2026-03-28T00:00:00.000Z",
        version: 1,
      }
    );

    const output = formatReport(report);
    expect(output).toContain("REGRESSION");
  });

  it("should show dash for new apps with no baseline", () => {
    const report = compareWithBaseline(
      [
        {
          app: "new-app",
          totalBytes: 10000,
          files: [],
          timestamp: "2026-03-29T00:00:00.000Z",
        },
      ],
      null
    );

    const output = formatReport(report);
    expect(output).toContain("new-app");
    // The "Before" column should have a dash for new apps
    const lines = output.split("\n");
    const dataLine = lines.find((l) => l.includes("new-app"))!;
    expect(dataLine).toContain("—");
  });
});
