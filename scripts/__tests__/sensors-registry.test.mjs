import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SENSORS,
  getSensorByLabel,
  getAllLabels,
  buildCategoryMap,
  buildLabelMap,
  getReportSensors,
  collectReportSensors,
  buildThresholds,
  clampToDefaultRange,
  readTunables,
  getTunableSensorDefaults,
  readQueueEfficiencyPrs,
} from "../sensors-registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("sensors-registry", () => {
  it("exports a SENSORS array with at least one entry per known sensor", () => {
    const ids = SENSORS.map((s) => s.id);
    expect(ids).toContain("lighthouse");
    expect(ids).toContain("ci");
    expect(ids).toContain("sentry");
    expect(ids).toContain("acmm");
    expect(ids).toContain("cors");
  });

  it("every sensor has an id and a category", () => {
    for (const sensor of SENSORS) {
      expect(typeof sensor.id).toBe("string");
      expect(typeof sensor.category).toBe("string");
    }
  });

  it("every issue-filing sensor (has issueLabels) also has severity and verifyFix", () => {
    for (const sensor of SENSORS) {
      if (!sensor.issueLabels) continue;
      expect(Array.isArray(sensor.issueLabels)).toBe(true);
      expect(sensor.issueLabels.length).toBeGreaterThan(0);
      expect(typeof sensor.severity).toBe("string");
      expect(typeof sensor.verifyFix).toBe("function");
    }
  });

  it("getReportSensors returns only entries with a collect function, each carrying a format function", () => {
    const reportSensors = getReportSensors();
    expect(reportSensors.length).toBeGreaterThan(0);
    for (const sensor of reportSensors) {
      expect(typeof sensor.collect).toBe("function");
      expect(typeof sensor.format).toBe("function");
    }
    // sentry/cors/bug are label-only entries — they must NOT appear in the report.
    const reportIds = reportSensors.map((s) => s.reportKey ?? s.id);
    expect(reportIds).not.toContain("sentry");
    expect(reportIds).not.toContain("cors");
    expect(reportIds).not.toContain("bug");
    expect(reportIds).toContain("ciHealth");
  });

  it("every producer issueLabel is resolvable via getSensorByLabel", () => {
    // Known producer labels — this is the key coverage gap the issue describes:
    // 'security' (from cors-audit) was invisible to the verifier
    const producerLabels = ["audit", "ci-fix", "acmm", "sentry", "bug", "security"];
    for (const label of producerLabels) {
      const sensor = getSensorByLabel(label);
      expect(sensor, `label "${label}" has no sensor entry`).not.toBeNull();
    }
  });

  it("getAllLabels returns all issue labels across all sensors", () => {
    const labels = getAllLabels();
    expect(labels).toContain("audit");
    expect(labels).toContain("ci-fix");
    expect(labels).toContain("acmm");
    expect(labels).toContain("sentry");
    expect(labels).toContain("bug");
    expect(labels).toContain("security");
  });

  it("buildCategoryMap produces a map of category → metric keys", () => {
    const map = buildCategoryMap();
    expect(typeof map).toBe("object");
    expect(Array.isArray(map.performance)).toBe(true);
    expect(Array.isArray(map.availability)).toBe(true);
    expect(Array.isArray(map.quality)).toBe(true);
  });

  it("buildLabelMap produces a map of sensorId → primary label", () => {
    const map = buildLabelMap();
    expect(map.lighthouse).toBe("audit");
    expect(map.ci).toBe("ci-fix");
    expect(map.sentry).toBe("sentry");
    expect(map.acmm).toBe("acmm");
    expect(map.cors).toBeDefined();
  });

  it("buildLabelMap also keys by reportKey, so ciHealth regressions resolve to ci-fix", () => {
    // detectRegression on the "ci" entry emits `sensor: "ciHealth"` (its reportKey),
    // not the registry id "ci" — the map must be resolvable by both.
    const map = buildLabelMap();
    expect(map.ciHealth).toBe("ci-fix");
  });

  it("getSensorByLabel returns null for unknown labels", () => {
    const sensor = getSensorByLabel("nonexistent-label-xyz");
    expect(sensor).toBeNull();
  });

  describe("collectReportSensors", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("logs and reports unavailable when a collector throws unexpectedly", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const boom = new Error("boom");
      const entries = [
        {
          id: "brokenSensor",
          collect: () => {
            throw boom;
          },
        },
      ];

      const result = collectReportSensors(entries, {});

      expect(result.brokenSensor).toEqual({ available: false });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0].join(" ")).toContain("brokenSensor");
    });

    it("keys collected data by reportKey when present, otherwise id", () => {
      const entries = [
        { id: "ci", reportKey: "ciHealth", collect: () => ({ available: true }) },
        { id: "acmm", collect: () => ({ available: true }) },
      ];

      const result = collectReportSensors(entries, {});

      expect(result.ciHealth).toEqual({ available: true });
      expect(result.acmm).toEqual({ available: true });
    });
  });

  it("verifyFix function returns an object with verified and reason fields", () => {
    for (const sensor of SENSORS) {
      if (!sensor.verifyFix) continue;
      // verifyFix is called with (issueTitle, issueBody) — test stub call
      const result = sensor.verifyFix("test issue title", "test body");
      if (result !== null) {
        expect(typeof result.verified).toBe("boolean");
        expect(typeof result.reason).toBe("string");
      }
    }
  });

  describe("prMetrics sensor reads the writer's real path", () => {
    // Regression coverage for a dead sensor: prMetrics previously resolved
    // `docs/metrics/pr-acceptance.json`, a path no collector ever writes to.
    // The real writer (pr-metrics.mjs) and the other reader (auto-qa-tune.mjs)
    // both use `metrics/pr-acceptance.json` at repo root — pin the sensor to
    // that exact path so a future path drift fails loudly here instead of
    // silently degrading to `available: false`.
    let tmpDir;

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    const fixture = [
      {
        date: "2026-05-02",
        window_days: 30,
        total_ai_prs: 40,
        merged: 40,
        rejected: 0,
        acceptance_rate: 1,
      },
    ];

    it("reports real data when metrics/pr-acceptance.json exists at repo root", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "pr-metrics-sensor-"));
      mkdirSync(join(tmpDir, "metrics"), { recursive: true });
      writeFileSync(join(tmpDir, "metrics", "pr-acceptance.json"), JSON.stringify(fixture));

      const sensor = SENSORS.find((s) => s.id === "prMetrics");
      const result = sensor.collect({ root: tmpDir });

      expect(result).toEqual({
        available: true,
        latest: fixture[0],
        previous: null,
        entry_count: 1,
      });
    });

    it("does not fall back to docs/metrics/pr-acceptance.json — no collector writes there", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "pr-metrics-sensor-"));
      mkdirSync(join(tmpDir, "docs", "metrics"), { recursive: true });
      writeFileSync(join(tmpDir, "docs", "metrics", "pr-acceptance.json"), JSON.stringify(fixture));

      const sensor = SENSORS.find((s) => s.id === "prMetrics");
      const result = sensor.collect({ root: tmpDir });

      expect(result).toEqual({ available: false });
    });
  });

  describe('collectors use the injected ghClient, not raw execFileSync("gh")', () => {
    it("prCategoryMetrics collects PRs via ghClient.pr.list", () => {
      const prs = [
        {
          number: 1,
          state: "MERGED",
          headRefName: "agent-feature-1",
          mergedAt: "2026-06-01T10:00:00Z",
          closedAt: "2026-06-01T10:00:00Z",
          labels: [{ name: "feature" }],
        },
      ];
      const ghClient = { pr: { list: vi.fn().mockReturnValue(prs) } };
      const sensor = SENSORS.find((s) => s.id === "prCategoryMetrics");

      const result = sensor.collect({ ghClient });

      expect(ghClient.pr.list).toHaveBeenCalledWith([
        "--state",
        "all",
        "--limit",
        "100",
        "--json",
        "number,state,headRefName,mergedAt,closedAt,labels",
      ]);
      expect(result.available).toBe(true);
      expect(result.total_prs).toBe(1);
    });

    it("prCategoryMetrics reports unavailable when ghClient.pr.list throws", () => {
      const ghClient = {
        pr: {
          list: vi.fn().mockImplementation(() => {
            throw new Error("gh not authenticated");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "prCategoryMetrics");

      expect(sensor.collect({ ghClient })).toEqual({ available: false });
    });

    // readQueueEfficiencyPrs is exercised directly (rather than through the
    // full queueEfficiency sensor.collect()) so the test doesn't also invoke
    // collectQueueEfficiency's real (network-calling) default ccusage reader.
    it("readQueueEfficiencyPrs collects PRs via ghClient.pr.list and derives commitCount", () => {
      const prs = [
        {
          number: 1,
          state: "MERGED",
          headRefName: "worktree-agent-1",
          commits: [{}, {}],
        },
      ];
      const ghClient = { pr: { list: vi.fn().mockReturnValue(prs) } };

      const result = readQueueEfficiencyPrs(ghClient);

      expect(ghClient.pr.list).toHaveBeenCalledWith([
        "--state",
        "all",
        "--limit",
        "45",
        "--json",
        "number,state,headRefName,createdAt,mergedAt,closedAt,labels,commits,additions,deletions",
      ]);
      expect(result).toEqual([{ ...prs[0], commitCount: 2 }]);
    });

    it("readQueueEfficiencyPrs returns null when ghClient.pr.list throws", () => {
      const ghClient = {
        pr: {
          list: vi.fn().mockImplementation(() => {
            throw new Error("gh not authenticated");
          }),
        },
      };

      expect(readQueueEfficiencyPrs(ghClient)).toBeNull();
    });

    it("queueEfficiency sensor.collect reports unavailable when ghClient.pr.list throws", () => {
      const ghClient = {
        pr: {
          list: vi.fn().mockImplementation(() => {
            throw new Error("gh not authenticated");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "queueEfficiency");

      expect(sensor.collect({ ghClient, now: new Date() })).toEqual({ available: false });
    });

    it("e2eStability collects runs via ghClient.workflow.runs", () => {
      const ghClient = {
        workflow: {
          runs: vi.fn().mockReturnValue([
            {
              conclusion: "success",
              createdAt: "2026-06-01T00:00:00Z",
              headBranch: "main",
              headSha: "abc123",
            },
          ]),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "e2eStability");

      const result = sensor.collect({ root: process.cwd(), ghClient });

      expect(ghClient.workflow.runs).toHaveBeenCalledWith([
        "--limit",
        "30",
        "--json",
        "conclusion,createdAt,headBranch,headSha",
      ]);
      expect(result.available).toBe(true);
    });

    it("e2eStability reports unavailable when ghClient.workflow.runs throws", () => {
      const ghClient = {
        workflow: {
          runs: vi.fn().mockImplementation(() => {
            throw new Error("gh not authenticated");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "e2eStability");

      expect(sensor.collect({ root: process.cwd(), ghClient })).toEqual({ available: false });
    });
  });

  describe("threshold co-location", () => {
    // Sensors known to read a value out of detectRegression's `thresholds` param.
    const THRESHOLD_CONSUMERS = {
      ci: "ci_pass_rate_drop",
      lighthouse: "lighthouse_score_drop",
      codeChurn: "code_churn_rate_max",
      queueEfficiency: "queue_efficiency_composite_drop",
    };

    it("each threshold-consuming entry declares its own thresholds next to detectRegression", () => {
      for (const [id, key] of Object.entries(THRESHOLD_CONSUMERS)) {
        const sensor = SENSORS.find((s) => s.id === id);
        expect(sensor, `sensor "${id}" not found`).toBeDefined();
        expect(typeof sensor.detectRegression).toBe("function");
        expect(sensor.thresholds, `sensor "${id}" has no thresholds field`).toBeTypeOf("object");
        expect(sensor.thresholds).toHaveProperty(key);
        expect(typeof sensor.thresholds[key]).toBe("number");
      }
    });

    // Fixture current/previous data crafted so the delta sits just past each
    // sensor's own co-located threshold value (declared above in SENSORS).
    const COUPLING_FIXTURES = {
      ci: {
        current: { available: true, pass_rate_pct: 90 },
        previous: { available: true, pass_rate_pct: 96 }, // delta -6
        looseOverride: { ci_pass_rate_drop: 10 },
      },
      lighthouse: {
        current: {
          available: true,
          surfaces: [{ url: "https://example.com/", scores: { performance: 0.8 } }],
        },
        previous: {
          available: true,
          surfaces: [{ url: "https://example.com/", scores: { performance: 0.9 } }], // delta -0.1
        },
        looseOverride: { lighthouse_score_drop: 0.5 },
      },
      codeChurn: {
        current: { available: true, churn_rate: 0.35 },
        previous: undefined,
        looseOverride: { code_churn_rate_max: 0.9 },
      },
      queueEfficiency: {
        current: { available: true, composite: 0.5, regressions: [] },
        previous: { available: true, composite: 0.6 }, // delta -0.1
        looseOverride: { queue_efficiency_composite_drop: 0.5 },
      },
    };

    it("each entry's own co-located threshold value actually drives its own detectRegression", () => {
      for (const id of Object.keys(THRESHOLD_CONSUMERS)) {
        const sensor = SENSORS.find((s) => s.id === id);
        const { current, previous, looseOverride } = COUPLING_FIXTURES[id];

        // Using the sensor's own declared threshold: the fixture delta was
        // chosen to just exceed it, so a regression must fire.
        const tight = sensor.detectRegression(current, previous, sensor.thresholds);
        expect(
          tight.length,
          `${id} should regress at its own co-located threshold`
        ).toBeGreaterThan(0);

        // Same data, but with that one key loosened: no regression — proves
        // detectRegression reads the value from the passed-in thresholds
        // object (i.e. from the registry entry), not a hardcoded literal.
        const loose = sensor.detectRegression(current, previous, looseOverride);
        expect(loose.length, `${id} should not regress past a loosened threshold`).toBe(0);
      }
    });

    it("buildThresholds merges every entry's co-located thresholds into one flat object", () => {
      const thresholds = buildThresholds();
      expect(thresholds).toEqual({
        ci_pass_rate_drop: 5,
        lighthouse_score_drop: 0.05,
        code_churn_rate_max: 0.3,
        queue_efficiency_composite_drop: 0.05,
        queue_efficiency_fps_drop: 0.1,
        agent_success_rate_drop: 10,
        error_rate_increase: 20,
        service_uptime_min: 99.5,
      });
    });

    it("sensor-report.mjs has no hand-maintained THRESHOLDS blob or per-sensor threshold imports", () => {
      const shimSource = readFileSync(resolve(__dirname, "..", "sensor-report.mjs"), "utf-8");
      expect(shimSource).not.toMatch(/const THRESHOLDS\s*=/);
      expect(shimSource).not.toMatch(/CODE_CHURN_THRESHOLD/);
      expect(shimSource).not.toMatch(/QUEUE_EFFICIENCY_(COMPOSITE|FPS)_DROP/);
      expect(shimSource).toMatch(/buildThresholds/);
    });
  });

  describe("regression-threshold tuning seam (ADR-018, #2986)", () => {
    describe("clampToDefaultRange", () => {
      it("passes through a value already within ±50% of default", () => {
        expect(clampToDefaultRange(5.5, 5)).toBe(5.5);
      });

      it("clamps a value above +50% of default down to the max", () => {
        expect(clampToDefaultRange(100, 5)).toBe(7.5);
      });

      it("clamps a value below −50% of default up to the min", () => {
        expect(clampToDefaultRange(0, 5)).toBe(2.5);
      });
    });

    describe("readTunables", () => {
      it("returns {} when the sidecar file does not exist", () => {
        const missingPath = resolve(mkdtempSync(join(tmpdir(), "tunables-")), "missing.json");
        expect(readTunables(missingPath)).toEqual({});
      });

      it("returns {} when the sidecar file is malformed JSON", () => {
        const dir = mkdtempSync(join(tmpdir(), "tunables-"));
        const filePath = resolve(dir, "regression-tunables.json");
        writeFileSync(filePath, "{not valid json", "utf-8");
        expect(readTunables(filePath)).toEqual({});
      });

      it("returns the parsed sidecar contents when the file is valid", () => {
        const dir = mkdtempSync(join(tmpdir(), "tunables-"));
        const filePath = resolve(dir, "regression-tunables.json");
        writeFileSync(filePath, JSON.stringify({ ci: { regressionThreshold: 6 } }), "utf-8");
        expect(readTunables(filePath)).toEqual({ ci: { regressionThreshold: 6 } });
      });
    });

    describe("getTunableSensorDefaults", () => {
      it("includes single-threshold-key sensors (ci, lighthouse, codeChurn)", () => {
        const defaults = getTunableSensorDefaults();
        expect(defaults.ci).toEqual({ thresholdKey: "ci_pass_rate_drop", defaultValue: 5 });
        expect(defaults.lighthouse).toEqual({
          thresholdKey: "lighthouse_score_drop",
          defaultValue: 0.05,
        });
        expect(defaults.codeChurn).toBeDefined();
      });

      it("excludes multi-threshold-key sensors (queueEfficiency)", () => {
        const defaults = getTunableSensorDefaults();
        expect(defaults.queueEfficiency).toBeUndefined();
      });

      it("excludes sensors with no thresholds field", () => {
        const defaults = getTunableSensorDefaults();
        expect(defaults.acmm).toBeUndefined();
      });
    });

    describe("buildThresholds overlay", () => {
      it("applies no overlay (falls back to defaults) when the sidecar is empty", () => {
        const dir = mkdtempSync(join(tmpdir(), "tunables-"));
        const filePath = resolve(dir, "regression-tunables.json");
        writeFileSync(filePath, "{}", "utf-8");
        const thresholds = buildThresholds(filePath);
        expect(thresholds.ci_pass_rate_drop).toBe(5);
      });

      it("overlays an in-bounds sidecar value onto the matching sensor's default", () => {
        const dir = mkdtempSync(join(tmpdir(), "tunables-"));
        const filePath = resolve(dir, "regression-tunables.json");
        writeFileSync(filePath, JSON.stringify({ ci: { regressionThreshold: 6 } }), "utf-8");
        const thresholds = buildThresholds(filePath);
        expect(thresholds.ci_pass_rate_drop).toBe(6);
      });

      it("falls back to default for a sensor absent from the sidecar", () => {
        const dir = mkdtempSync(join(tmpdir(), "tunables-"));
        const filePath = resolve(dir, "regression-tunables.json");
        writeFileSync(filePath, JSON.stringify({ ci: { regressionThreshold: 6 } }), "utf-8");
        const thresholds = buildThresholds(filePath);
        expect(thresholds.lighthouse_score_drop).toBe(0.05);
      });

      it("defensively clamps an out-of-bounds hand-edited sidecar value to ±50% of default", () => {
        const dir = mkdtempSync(join(tmpdir(), "tunables-"));
        const filePath = resolve(dir, "regression-tunables.json");
        writeFileSync(filePath, JSON.stringify({ ci: { regressionThreshold: 999 } }), "utf-8");
        const thresholds = buildThresholds(filePath);
        expect(thresholds.ci_pass_rate_drop).toBe(7.5); // +50% of default 5
      });

      it("leaves other sensors' thresholds untouched by an overlay", () => {
        const dir = mkdtempSync(join(tmpdir(), "tunables-"));
        const filePath = resolve(dir, "regression-tunables.json");
        writeFileSync(filePath, JSON.stringify({ ci: { regressionThreshold: 6 } }), "utf-8");
        const thresholds = buildThresholds(filePath);
        expect(thresholds.code_churn_rate_max).toBe(0.3);
        expect(thresholds.queue_efficiency_composite_drop).toBe(0.05);
      });
    });
  });
});
