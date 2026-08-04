import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  METRICS,
  read,
  append,
  write,
  readWeekly,
  writeWeekly,
  resolvePath,
  resolveWeeklyPath,
  metricsDir,
} from "../metrics-store.mjs";

const SCRIPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Path resolution — the seam that guards against #3079-style path drift.
// ---------------------------------------------------------------------------

describe("path resolution", () => {
  it("resolves each metric to <root>/metrics/<file>", () => {
    const root = join(tmpdir(), "mstore-fixed");
    expect(metricsDir(root)).toBe(join(root, "metrics"));
    expect(resolvePath("pr-acceptance", { root })).toBe(
      join(root, "metrics", "pr-acceptance.json")
    );
    expect(resolvePath("queue-telemetry", { root })).toBe(
      join(root, "metrics", "queue-telemetry.jsonl")
    );
    expect(resolveWeeklyPath("process-metrics", { root })).toBe(
      join(root, "metrics", "process-metrics-weekly.json")
    );
  });

  it("resolves under the repo root by default (independent of cwd)", () => {
    // Default root is one level up from scripts/ — the repo root.
    expect(resolvePath("sensor-report")).toBe(
      join(SCRIPTS_DIR, "..", "metrics", "sensor-report.json")
    );
  });

  it("throws on an unknown logical metric name", () => {
    expect(() => resolvePath("does-not-exist")).toThrow(/unknown metric/i);
    expect(() => read("does-not-exist")).toThrow(/unknown metric/i);
  });

  it("throws when asking for a weekly variant a metric does not have", () => {
    expect(() => resolveWeeklyPath("pr-acceptance")).toThrow(/no weekly variant/i);
  });
});

// ---------------------------------------------------------------------------
// Read / append / write round-trips per format.
// ---------------------------------------------------------------------------

describe("read/append/write", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "mstore-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns null for a missing metric (any format)", () => {
    expect(read("pr-acceptance", { root })).toBeNull();
    expect(read("service-health", { root })).toBeNull();
    expect(read("ai-issue-feedback", { root })).toBeNull();
    expect(readWeekly("process-metrics", { root })).toBeNull();
  });

  it("appends jsonl rows one per line and reads them back as parsed objects", () => {
    append("service-health", { service: "users", status: "ok" }, { root });
    append("service-health", { service: "agent", status: "degraded" }, { root });

    const rows = read("service-health", { root });
    expect(rows).toEqual([
      { service: "users", status: "ok" },
      { service: "agent", status: "degraded" },
    ]);

    // On disk it is genuinely newline-delimited, not a JSON array.
    const raw = readFileSync(resolvePath("service-health", { root }), "utf-8");
    expect(raw.trim().split("\n")).toHaveLength(2);
  });

  it("skips malformed jsonl lines when reading", () => {
    append("service-health", { service: "users" }, { root });
    // Append a broken line directly to the sink, bypassing the store.
    appendFileSync(resolvePath("service-health", { root }), "not json\n", "utf-8");
    append("service-health", { service: "agent" }, { root });

    expect(read("service-health", { root })).toEqual([{ service: "users" }, { service: "agent" }]);
  });

  it("pushes onto a json-array metric and rewrites the whole file", () => {
    append("pr-acceptance", { date: "2026-01-01", acceptance_rate: 0.5 }, { root });
    append("pr-acceptance", { date: "2026-01-02", acceptance_rate: 0.6 }, { root });

    const entries = read("pr-acceptance", { root });
    expect(entries).toHaveLength(2);
    expect(entries[1].acceptance_rate).toBe(0.6);
    // Pretty-printed JSON array on disk.
    const raw = readFileSync(resolvePath("pr-acceptance", { root }), "utf-8");
    expect(raw).toContain("\n  {");
    expect(JSON.parse(raw)).toHaveLength(2);
  });

  it("json-array append recovers from a corrupt existing file", () => {
    write("sensor-report", { anything: true }, { root }); // json-object, unrelated
    const path = resolvePath("pr-acceptance", { root });
    // Write garbage into the pr-acceptance file, then append.
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ not json", "utf-8");
    append("pr-acceptance", { date: "2026-01-01" }, { root });
    expect(read("pr-acceptance", { root })).toEqual([{ date: "2026-01-01" }]);
  });

  it("overwrites a json-object metric with write() and reads it back", () => {
    write("ai-issue-feedback", { collected_at: "t1", categories: {} }, { root });
    write("ai-issue-feedback", { collected_at: "t2", categories: { bug: {} } }, { root });
    expect(read("ai-issue-feedback", { root })).toEqual({
      collected_at: "t2",
      categories: { bug: {} },
    });
  });

  it("refuses append() on a json-object metric", () => {
    expect(() => append("ai-issue-feedback", { x: 1 }, { root })).toThrow(/use write\(\)/i);
  });

  it("round-trips a weekly rollup", () => {
    writeWeekly("process-metrics", { generated_at: "t", trend: { direction: "stable" } }, { root });
    expect(readWeekly("process-metrics", { root })).toEqual({
      generated_at: "t",
      trend: { direction: "stable" },
    });
  });
});

// ---------------------------------------------------------------------------
// Name registry — every logical metric a sensor/reader READS must be one some
// collector WRITES. This is the invariant #3079 violated: the prMetrics sensor
// read a path (docs/metrics/pr-acceptance.json) no collector ever wrote to, so
// it silently reported available:false. With one registry, reader and writer
// share a logical name; this test fails loudly if that ever drifts again.
// ---------------------------------------------------------------------------

describe("name registry (guards #3079)", () => {
  function collectSourceFiles(dir) {
    const out = [];
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (dirent.name === "node_modules" || dirent.name === "__tests__") continue;
        out.push(...collectSourceFiles(full));
      } else if (/\.(mjs|js)$/.test(dirent.name) && dirent.name !== "metrics-store.mjs") {
        out.push(full);
      }
    }
    return out;
  }

  // Only files that actually consume the store can read/write a metric name.
  const storeConsumers = collectSourceFiles(SCRIPTS_DIR).filter((f) =>
    readFileSync(f, "utf-8").includes("metrics-store.mjs")
  );

  // read()/readWeekly() → a metric is CONSUMED. append()/write()/writeWeekly()
  // → PRODUCED through the store. resolvePath()/resolveWeeklyPath() → PRODUCED
  // by a caller that manages its own file handle (collect-queue-telemetry's
  // dedup-aware appender), which still owns no path knowledge of its own.
  const READER_RE = /\b(?:read|readWeekly)\(\s*["']([a-z0-9-]+)["']/g;
  const WRITER_RE =
    /\b(?:append|write|writeWeekly|resolvePath|resolveWeeklyPath)\(\s*["']([a-z0-9-]+)["']/g;

  const reads = new Set();
  const writes = new Set();
  for (const f of storeConsumers) {
    const src = readFileSync(f, "utf-8");
    for (const m of src.matchAll(READER_RE)) if (METRICS[m[1]]) reads.add(m[1]);
    for (const m of src.matchAll(WRITER_RE)) if (METRICS[m[1]]) writes.add(m[1]);
  }

  it("discovers store reads and writes across the scripts (regex sanity)", () => {
    expect(storeConsumers.length).toBeGreaterThan(0);
    expect(reads.size).toBeGreaterThan(0);
    expect(writes.size).toBeGreaterThan(0);
  });

  it("every logical metric a reader reads is registered", () => {
    for (const name of reads) {
      expect(METRICS[name], `read metric "${name}" is not registered`).toBeDefined();
    }
  });

  it("every logical metric a reader reads is one a collector writes", () => {
    const orphanReads = [...reads].filter((name) => !writes.has(name));
    expect(orphanReads).toEqual([]);
  });
});
