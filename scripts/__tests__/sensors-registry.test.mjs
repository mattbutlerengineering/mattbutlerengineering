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
  buildE2eRuns,
  resolveRunChangedPaths,
  buildFlakyTestRuns,
} from "../sensors-registry.mjs";
import { computeE2eStability } from "../collect-e2e-stability.mjs";
import { GhAuthError } from "@mbe/gh-client";

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

  describe("issueFeedback sensor", () => {
    // #3937: collect-ai-issue-feedback.mjs now persists `{ error }` instead of
    // leaving the file unwritten on a query failure — the sensor must surface
    // that distinctly from "not yet collected".
    // #4211: the error branch dropped `collected_at`, so a persisted failure
    // read as current no matter how old it was. It must now propagate
    // `collected_at` and an explicit `stale` flag, without ever letting a
    // failure collapse into looking like "not yet collected" (#3937).
    let tmpDir;

    const writeFixture = (data) => {
      tmpDir = mkdtempSync(join(tmpdir(), "issue-feedback-sensor-"));
      mkdirSync(join(tmpDir, "metrics"), { recursive: true });
      writeFileSync(join(tmpDir, "metrics", "ai-issue-feedback.json"), JSON.stringify(data));
      return SENSORS.find((s) => s.id === "issueFeedback");
    };

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("reports the auth-capability gap with collected_at and stale:false when the failure is fresh", () => {
      const now = new Date("2026-08-14T12:00:00Z");
      const sensor = writeFixture({
        collected_at: "2026-08-14T00:00:00Z", // 12h before `now` — well under the 48h threshold
        error: "GitHub auth failed",
      });

      const result = sensor.collect({ root: tmpDir, now });

      expect(result).toEqual({
        available: false,
        error: "GitHub auth failed",
        collected_at: "2026-08-14T00:00:00Z",
        stale: false,
      });
    });

    it("flags stale:true when the persisted failure is older than the staleness threshold", () => {
      const now = new Date("2026-08-14T12:00:00Z");
      const sensor = writeFixture({
        collected_at: "2026-08-11T18:21:51.050Z", // >48h before `now` — mirrors the observed #4211 case
        error:
          "GitHub auth failed (403) — REST fallback credential is not valid for direct API calls",
      });

      const result = sensor.collect({ root: tmpDir, now });

      expect(result.available).toBe(false);
      expect(result.error).toMatch(/auth/i);
      expect(result.collected_at).toBe("2026-08-11T18:21:51.050Z");
      expect(result.stale).toBe(true);
    });

    it("reports plain unavailable (no error) when the file has simply never been written", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "issue-feedback-sensor-"));

      const sensor = SENSORS.find((s) => s.id === "issueFeedback");

      expect(sensor.collect({ root: tmpDir, now: new Date() })).toEqual({ available: false });
    });
  });

  describe("domainActivity sensor", () => {
    let tmpDir;

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    // Exact row shape written by collect-domain-metrics.mjs (#3666).
    const row = (overrides = {}) => ({
      collected_at: "2026-08-03T12:00:00.000Z",
      date: "2026-08-03",
      venueId: "venue-1",
      reservations: { pending: 2, confirmed: 5, cancelled: 1, completed: 3, noShow: 1 },
      deposits: { held: 4, applied: 2, refunded: 1, forfeited: 0 },
      ...overrides,
    });

    it("reports the latest entry's reservation and deposit counts", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "domain-activity-sensor-"));
      mkdirSync(join(tmpDir, "metrics"), { recursive: true });
      const rows = [row({ date: "2026-08-02" }), row({ date: "2026-08-03" })];
      writeFileSync(
        join(tmpDir, "metrics", "domain-metrics.jsonl"),
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
      );

      const sensor = SENSORS.find((s) => s.id === "domainActivity");
      const result = sensor.collect({ root: tmpDir });

      expect(result).toEqual({
        available: true,
        date: "2026-08-03",
        venueId: "venue-1",
        reservations_created: 12,
        reservations_cancelled: 1,
        reservations_completed: 3,
        reservations_no_show: 1,
        deposits_held: 4,
        deposits_applied: 2,
        deposits_refunded: 1,
        deposits_forfeited: 0,
      });
    });

    it("returns { available: false } when metrics/domain-metrics.jsonl does not exist", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "domain-activity-sensor-"));

      const sensor = SENSORS.find((s) => s.id === "domainActivity");
      const result = sensor.collect({ root: tmpDir });

      expect(result).toEqual({ available: false });
    });

    it("formats a CLI display line from the collected data", () => {
      const sensor = SENSORS.find((s) => s.id === "domainActivity");
      const line = sensor.format(
        {
          available: true,
          date: "2026-08-03",
          venueId: "venue-1",
          reservations_created: 12,
          reservations_cancelled: 1,
          reservations_completed: 3,
          reservations_no_show: 1,
          deposits_held: 4,
          deposits_applied: 2,
          deposits_refunded: 1,
          deposits_forfeited: 0,
        },
        "domainActivity"
      );

      expect(line).toContain("12 created");
      expect(line).toContain("1 cancelled");
      expect(line).toContain("3 completed");
      expect(line).toContain("1 no-show");
      expect(line).toContain("2026-08-03");
    });
  });

  describe("acmm sensor", () => {
    let tmpDir;

    const writeState = (state) => {
      tmpDir = mkdtempSync(join(tmpdir(), "acmm-sensor-"));
      mkdirSync(join(tmpDir, ".claude", "acmm"), { recursive: true });
      writeFileSync(join(tmpDir, ".claude", "acmm", "state.json"), JSON.stringify(state));
      return SENSORS.find((s) => s.id === "acmm");
    };

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns failing_gates populated and capped:true when a gate has passed:false", () => {
      const sensor = writeState({
        currentLevel: 3,
        levelName: "Managed",
        lastRun: "2026-08-29T00:00:00Z",
        checks: { a: { passed: true }, b: { passed: false } },
        computation: {
          capped: true,
          behavioralGates: [
            {
              level: 4,
              name: "human-touch-ratio",
              description:
                "Human-touch ratio must be below 50% (merged agent PRs requiring non-author commits, 30-day window)",
              passed: false,
              value: 0.7307,
              threshold: 0.5,
              direction: "below",
              strict: true,
            },
            {
              level: 4,
              name: "some-other-gate",
              description: "Another gate that is passing",
              passed: true,
              value: 0.9,
              threshold: 0.8,
              direction: "above",
              strict: false,
            },
          ],
        },
      });

      const result = sensor.collect({ root: tmpDir });

      expect(result).toEqual({
        available: true,
        level: 3,
        level_name: "Managed",
        criteria_met: 1,
        criteria_total: 2,
        last_run: "2026-08-29T00:00:00Z",
        capped: true,
        failing_gates: [
          {
            name: "human-touch-ratio",
            description:
              "Human-touch ratio must be below 50% (merged agent PRs requiring non-author commits, 30-day window)",
            value: 0.7307,
            threshold: 0.5,
            direction: "below",
          },
        ],
      });
    });

    it("returns failing_gates: [] and capped:false when all gates pass", () => {
      const sensor = writeState({
        currentLevel: 4,
        levelName: "Optimizing",
        lastRun: "2026-08-29T00:00:00Z",
        checks: { a: { passed: true } },
        computation: {
          capped: false,
          behavioralGates: [
            {
              level: 4,
              name: "human-touch-ratio",
              description: "Human-touch ratio must be below 50%",
              passed: true,
              value: 0.3,
              threshold: 0.5,
              direction: "below",
              strict: true,
            },
          ],
        },
      });

      const result = sensor.collect({ root: tmpDir });

      expect(result.capped).toBe(false);
      expect(result.failing_gates).toEqual([]);
    });

    it("defaults capped to false and failing_gates to [] when state.computation is absent", () => {
      const sensor = writeState({
        currentLevel: 2,
        levelName: "Repeatable",
        lastRun: "2026-08-29T00:00:00Z",
        checks: { a: { passed: true } },
      });

      const result = sensor.collect({ root: tmpDir });

      expect(result.capped).toBe(false);
      expect(result.failing_gates).toEqual([]);
    });

    it("does not throw and returns { available: false } when state.json does not exist", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "acmm-sensor-"));

      const sensor = SENSORS.find((s) => s.id === "acmm");

      expect(() => sensor.collect({ root: tmpDir })).not.toThrow();
      expect(sensor.collect({ root: tmpDir })).toEqual({ available: false });
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

    // #3946: same swallow #3937/#3944 fixed for ci/issues/issueFeedback — also
    // found here on the grep sweep for remaining safe()-wrapped ghClient calls.
    it("prCategoryMetrics reports the auth-capability gap distinctly when ghClient.pr.list throws GhAuthError", () => {
      const ghClient = {
        pr: {
          list: vi.fn().mockImplementation(() => {
            throw new GhAuthError("GET", "/repos/o/r/pulls", 401, "Bad credentials");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "prCategoryMetrics");

      const result = sensor.collect({ ghClient });

      expect(result.available).toBe(false);
      expect(result.error).toMatch(/auth/i);
    });

    // #3937: an auth failure (Claude Code Remote's REST fallback token isn't
    // valid for direct api.github.com calls) must be distinguishable from a
    // legitimately empty result — both used to collapse to the same
    // `{ available: false }` "not applicable" shape via safe().
    it("ci sensor reports the auth-capability gap distinctly when ghClient.workflow.runs throws GhAuthError", () => {
      const ghClient = {
        workflow: {
          runs: vi.fn().mockImplementation(() => {
            throw new GhAuthError("GET", "/repos/o/r/actions/runs", 401, "Bad credentials");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "ci");

      const result = sensor.collect({ ghClient });

      expect(result.available).toBe(false);
      expect(result.error).toMatch(/auth/i);
    });

    it("ci sensor reports plain unavailable (no error) when there are simply no runs yet", () => {
      const ghClient = { workflow: { runs: vi.fn().mockReturnValue([]) } };
      const sensor = SENSORS.find((s) => s.id === "ci");

      expect(sensor.collect({ ghClient })).toEqual({ available: false });
    });

    // #4538: an unscoped query counts PR-validation runs from open branches
    // (e.g. Dependabot PRs) toward "repo CI health", so noise unrelated to
    // main can trip a false regression while main itself is fully green.
    it("ci sensor scopes ghClient.workflow.runs to main-branch runs only", () => {
      const ghClient = { workflow: { runs: vi.fn().mockReturnValue([]) } };
      const sensor = SENSORS.find((s) => s.id === "ci");

      sensor.collect({ ghClient });

      expect(ghClient.workflow.runs).toHaveBeenCalledWith([
        "--limit",
        "30",
        "--branch",
        "main",
        "--json",
        "status,conclusion,createdAt,name",
      ]);
    });

    // #4685: skipped/cancelled conclusions are intentional no-ops (e.g.
    // Auto-Rollback / Revert Watchdog skipping when their trigger condition
    // isn't met, or a concurrency-superseded rerun) — they must not dilute
    // the pass-rate denominator alongside genuine failures.
    it("ci sensor excludes skipped and cancelled conclusions from the pass-rate denominator", () => {
      const runs = [
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
        { status: "completed", conclusion: "skipped" },
        { status: "completed", conclusion: "cancelled" },
      ];
      const ghClient = { workflow: { runs: vi.fn().mockReturnValue(runs) } };
      const sensor = SENSORS.find((s) => s.id === "ci");

      const result = sensor.collect({ ghClient });

      expect(result.failed).toBe(0);
      expect(result.passed).toBe(7);
      expect(result.pass_rate_pct).toBe(100);
    });

    // #4713: format used to print `${passed}/${completed}`, which still
    // included skipped/cancelled runs in its denominator even after #4687
    // scoped pass_rate_pct to passed/(passed+failed) — so the human-readable
    // line and the metric disagreed (e.g. "100% pass rate (11/30)"). format
    // must report the same denominator the rate is computed over.
    it("ci sensor's format reports the same denominator as pass_rate_pct", () => {
      const runs = [
        ...Array.from({ length: 11 }, () => ({ status: "completed", conclusion: "success" })),
        ...Array.from({ length: 19 }, () => ({ status: "completed", conclusion: "skipped" })),
      ];
      const ghClient = { workflow: { runs: vi.fn().mockReturnValue(runs) } };
      const sensor = SENSORS.find((s) => s.id === "ci");

      const data = sensor.collect({ ghClient });
      const line = sensor.format(data, "ciHealth");

      expect(data.pass_rate_pct).toBe(100);
      expect(line).toContain("11/11");
      expect(line).not.toContain("11/30");
    });

    it("issues sensor reports the auth-capability gap distinctly when ghClient.issue.list throws GhAuthError", () => {
      const ghClient = {
        issue: {
          list: vi.fn().mockImplementation(() => {
            throw new GhAuthError("GET", "/repos/o/r/issues", 401, "Bad credentials");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "issues");

      const result = sensor.collect({ ghClient, now: new Date() });

      expect(result.available).toBe(false);
      expect(result.error).toMatch(/auth/i);
    });

    // #4641: a single `--limit 50 --state all` fetch sorted by createdAt desc
    // gets crowded out by a creation burst — issues closed in the window but
    // created before it fall off the top-50 and silently vanish from
    // closed_7d, even though they really did close. Scoping created/closed
    // counts to two independent server-side searches (rather than filtering
    // one shared, capped array) means closed_7d can never be truncated by
    // creation volume.
    it("issues sensor scopes created/closed counts to independent search queries, not one shared capped list", () => {
      const now = new Date("2026-08-29T00:00:00Z");
      const ghClient = {
        issue: {
          list: vi
            .fn()
            // 1st call: issues created in the window
            .mockReturnValueOnce([{ number: 1 }, { number: 2 }])
            // 2nd call: issues closed in the window — #3 was created well
            // before the window and would have been pushed out of any
            // shared, creation-sorted, capped fetch.
            .mockReturnValueOnce([{ number: 3 }])
            // 3rd call: currently-open issues, for queue_depth/agent_failed
            .mockReturnValueOnce([
              { number: 4, labels: [{ name: "ready" }] },
              { number: 5, labels: [{ name: "agent-failed" }] },
            ]),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "issues");

      const result = sensor.collect({ ghClient, now });

      expect(result).toEqual({
        available: true,
        created_7d: 2,
        closed_7d: 1,
        closure_rate: 50,
        queue_depth: 1,
        agent_failed: 1,
      });
      expect(ghClient.issue.list).toHaveBeenNthCalledWith(1, [
        "--state",
        "all",
        "--search",
        "created:>=2026-08-22",
        "--limit",
        "200",
        "--json",
        "number,createdAt",
      ]);
      expect(ghClient.issue.list).toHaveBeenNthCalledWith(2, [
        "--state",
        "closed",
        "--search",
        "closed:>=2026-08-22",
        "--limit",
        "200",
        "--json",
        "number,closedAt",
      ]);
      expect(ghClient.issue.list).toHaveBeenNthCalledWith(3, [
        "--state",
        "open",
        "--limit",
        "200",
        "--json",
        "number,labels",
      ]);
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

    // #3946: readQueueEfficiencyPrs used to swallow via safe() → null, which
    // collectQueueEfficiency's own catch then collapsed to a bare
    // `{ available: false }` — the same ci/issues/prCategoryMetrics swallow,
    // found here on the grep sweep. Letting it throw (instead of swallowing)
    // lets collectQueueEfficiency's catch surface `.error` via describeGhError.
    it("readQueueEfficiencyPrs propagates ghClient.pr.list's thrown error instead of swallowing it", () => {
      const ghClient = {
        pr: {
          list: vi.fn().mockImplementation(() => {
            throw new GhAuthError("GET", "/repos/o/r/pulls", 401, "Bad credentials");
          }),
        },
      };

      expect(() => readQueueEfficiencyPrs(ghClient)).toThrow(GhAuthError);
    });

    it("queueEfficiency sensor.collect reports the auth-capability gap distinctly when ghClient.pr.list throws GhAuthError", () => {
      const ghClient = {
        pr: {
          list: vi.fn().mockImplementation(() => {
            throw new GhAuthError("GET", "/repos/o/r/pulls", 401, "Bad credentials");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "queueEfficiency");

      const result = sensor.collect({ ghClient, now: new Date() });

      expect(result.available).toBe(false);
      expect(result.error).toMatch(/auth/i);
    });

    it("e2eStability collects runs via ghClient.workflow.runs", () => {
      const ghClient = {
        workflow: {
          runs: vi.fn().mockReturnValue([
            {
              conclusion: "success",
              createdAt: "2026-06-01T00:00:00Z",
              headBranch: "main",
              // HEAD is a real, locally-resolvable commit, so this run flows
              // through git path-resolution rather than being skipped as an
              // unresolvable SHA (#3172). Availability then depends on whether
              // HEAD touched the frontend, so the assertions below check that
              // the injected client was used and the result is well-formed —
              // the skip/classification behaviour is covered in the #3172 block.
              headSha: "HEAD",
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
      expect(typeof result.available).toBe("boolean");
    });

    // #3946: same swallow #3937/#3944 fixed for ci/issues/issueFeedback, still
    // live in e2eStability — a thrown GhAuthError must be distinguishable from
    // a legitimately empty result, both of which used to collapse to the same
    // `{ available: false }` shape via safe().
    it("e2eStability sensor reports the auth-capability gap distinctly when ghClient.workflow.runs throws GhAuthError", () => {
      const ghClient = {
        workflow: {
          runs: vi.fn().mockImplementation(() => {
            throw new GhAuthError("GET", "/repos/o/r/actions/runs", 401, "Bad credentials");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "e2eStability");

      const result = sensor.collect({ root: process.cwd(), ghClient });

      expect(result.available).toBe(false);
      expect(result.error).toMatch(/auth/i);
    });

    it("e2eStability sensor reports plain unavailable (no error) when there are simply no runs yet", () => {
      const ghClient = { workflow: { runs: vi.fn().mockReturnValue([]) } };
      const sensor = SENSORS.find((s) => s.id === "e2eStability");

      expect(sensor.collect({ root: process.cwd(), ghClient })).toEqual({ available: false });
    });

    it("flakyTests collects runs via ghClient.workflow.runs scoped to the CI workflow", () => {
      const ghClient = { workflow: { runs: vi.fn().mockReturnValue([]) } };
      const sensor = SENSORS.find((s) => s.id === "flakyTests");

      sensor.collect({ ghClient });

      expect(ghClient.workflow.runs).toHaveBeenCalledWith([
        "--limit",
        "100",
        "--workflow",
        "CI",
        "--json",
        "databaseId,status,headSha",
      ]);
    });

    it("flakyTests sensor reports the auth-capability gap distinctly when ghClient.workflow.runs throws", () => {
      const ghClient = {
        workflow: {
          runs: vi.fn().mockImplementation(() => {
            throw new GhAuthError("GET", "/repos/o/r/actions/runs", 401, "Bad credentials");
          }),
        },
      };
      const sensor = SENSORS.find((s) => s.id === "flakyTests");

      const result = sensor.collect({ ghClient });

      expect(result.available).toBe(false);
      expect(result.error).toMatch(/auth/i);
    });

    it("flakyTests sensor degrades to the data_gap shape when there are no completed runs", () => {
      const ghClient = { workflow: { runs: vi.fn().mockReturnValue([]) } };
      const sensor = SENSORS.find((s) => s.id === "flakyTests");

      const result = sensor.collect({ ghClient });

      expect(result.available).toBe(false);
      expect(result.data_gap).toMatch(/per-test run history/i);
    });
  });

  describe("buildFlakyTestRuns", () => {
    // A missing/invalid credential is not a per-run hiccup: it fails EVERY run
    // identically, so degrading it to zero rows makes the sensor report the
    // "no per-test history — enable the JUnit reporter" data_gap, advice that
    // is actively wrong once the reporter is enabled. Same distinguishable-
    // failure requirement as #3937. (#4237)
    it("propagates a credential failure instead of degrading it to zero rows", () => {
      const ghRuns = [{ status: "completed", databaseId: 42, headSha: "abc123" }];
      const listRunArtifacts = vi.fn(() => {
        const err = new Error(
          "gh-client: no `gh` binary on PATH and no GITHUB_TOKEN/GH_TOKEN in the environment."
        );
        err.name = "MissingGithubTokenError";
        throw err;
      });

      expect(() => buildFlakyTestRuns(ghRuns, { listRunArtifacts })).toThrow(
        /GITHUB_TOKEN|credential/i
      );
    });

    it("still degrades a per-run IO failure to zero rows for that run only", () => {
      const ghRuns = [
        { status: "completed", databaseId: 1, headSha: "sha1" },
        { status: "completed", databaseId: 2, headSha: "sha2" },
      ];
      const listRunArtifacts = vi.fn((id) => {
        if (id === 1) throw new Error("artifact expired");
        return [{ id: 9, name: "test-results-node22", expired: false }];
      });
      const downloadArtifactZip = vi.fn().mockReturnValue(Buffer.from("zip"));
      const extractZipEntries = vi
        .fn()
        .mockReturnValue([{ name: "r.xml", data: Buffer.from("<x/>") }]);
      const parseJUnitXml = vi.fn().mockReturnValue([{ testName: "t", passed: true }]);

      const rows = buildFlakyTestRuns(ghRuns, {
        listRunArtifacts,
        downloadArtifactZip,
        extractZipEntries,
        parseJUnitXml,
      });

      // Run 1 contributed nothing; run 2 is unaffected.
      expect(rows).toEqual([{ sha: "sha2", testName: "t", passed: true }]);
    });

    it("skips runs that aren't completed, or are missing databaseId/headSha", () => {
      const ghRuns = [
        { status: "in_progress", databaseId: 1, headSha: "a" },
        { status: "completed", headSha: "b" }, // no databaseId
        { status: "completed", databaseId: 3 }, // no headSha
      ];
      const listRunArtifacts = vi.fn();

      const rows = buildFlakyTestRuns(ghRuns, { listRunArtifacts });

      expect(listRunArtifacts).not.toHaveBeenCalled();
      expect(rows).toEqual([]);
    });

    it("filters artifacts to the test-results-node* prefix, excluding expired ones", () => {
      const ghRuns = [{ status: "completed", databaseId: 42, headSha: "abc123" }];
      const listRunArtifacts = vi.fn().mockReturnValue([
        { id: 1, name: "test-results-node22", expired: false },
        { id: 2, name: "test-results-node22", expired: true },
        { id: 3, name: "unrelated-artifact", expired: false },
      ]);
      const downloadArtifactZip = vi.fn().mockReturnValue(Buffer.from("zip"));
      const extractZipEntries = vi.fn().mockReturnValue([]);

      buildFlakyTestRuns(ghRuns, { listRunArtifacts, downloadArtifactZip, extractZipEntries });

      expect(downloadArtifactZip).toHaveBeenCalledTimes(1);
      expect(downloadArtifactZip).toHaveBeenCalledWith(1);
    });

    it("attaches the run's headSha to every parsed testcase row, skipping non-.xml entries", () => {
      const ghRuns = [{ status: "completed", databaseId: 42, headSha: "abc123" }];
      const listRunArtifacts = vi
        .fn()
        .mockReturnValue([{ id: 1, name: "test-results-node22", expired: false }]);
      const downloadArtifactZip = vi.fn().mockReturnValue(Buffer.from("zip"));
      const extractZipEntries = vi.fn().mockReturnValue([
        { name: "services/foo/test-results/junit.xml", data: Buffer.from("<xml/>") },
        { name: "services/foo/README.md", data: Buffer.from("not xml") },
      ]);
      const parseJUnitXml = vi.fn().mockReturnValue([{ testName: "suite > test", passed: true }]);

      const rows = buildFlakyTestRuns(ghRuns, {
        listRunArtifacts,
        downloadArtifactZip,
        extractZipEntries,
        parseJUnitXml,
      });

      expect(parseJUnitXml).toHaveBeenCalledTimes(1);
      expect(rows).toEqual([{ sha: "abc123", testName: "suite > test", passed: true }]);
    });

    it("degrades one run's contribution to zero rows when listRunArtifacts throws, without aborting the others", () => {
      const ghRuns = [
        { status: "completed", databaseId: 1, headSha: "broken" },
        { status: "completed", databaseId: 2, headSha: "ok" },
      ];
      const listRunArtifacts = vi.fn().mockImplementation((runId) => {
        if (runId === 1) throw new Error("network error");
        return [{ id: 99, name: "test-results-node22", expired: false }];
      });
      const downloadArtifactZip = vi.fn().mockReturnValue(Buffer.from("zip"));
      const extractZipEntries = vi
        .fn()
        .mockReturnValue([{ name: "a/test-results/junit.xml", data: Buffer.from("<xml/>") }]);
      const parseJUnitXml = vi.fn().mockReturnValue([{ testName: "t", passed: true }]);

      const rows = buildFlakyTestRuns(ghRuns, {
        listRunArtifacts,
        downloadArtifactZip,
        extractZipEntries,
        parseJUnitXml,
      });

      expect(rows).toEqual([{ sha: "ok", testName: "t", passed: true }]);
    });

    it("degrades to zero rows when downloadArtifactZip throws (e.g. expired past retention)", () => {
      const ghRuns = [{ status: "completed", databaseId: 1, headSha: "abc" }];
      const listRunArtifacts = vi
        .fn()
        .mockReturnValue([{ id: 1, name: "test-results-node22", expired: false }]);
      const downloadArtifactZip = vi.fn().mockImplementation(() => {
        throw new Error("410: artifact expired");
      });

      const rows = buildFlakyTestRuns(ghRuns, { listRunArtifacts, downloadArtifactZip });

      expect(rows).toEqual([]);
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

  describe("e2eStability tolerates unresolvable git commit SHAs (#3172)", () => {
    // CI-run head SHAs come from the GitHub API; a stale local `main` or a
    // squash-merged-and-deleted branch leaves them absent from the local git
    // object store. Previously `git show <sha>` spewed `fatal: bad object` per
    // miss (inherited stderr) and the unresolvable run was silently kept with
    // empty changed-paths — misclassifying it as non-frontend. The collector
    // must instead skip unresolvable runs, tally them, and never throw.

    const ghRuns = [
      {
        headSha: "1111111111111111111111111111111111111111",
        conclusion: "success",
        headBranch: "main",
        createdAt: "2026-07-02T00:00:00Z",
      },
      {
        headSha: "2222222222222222222222222222222222222222",
        conclusion: "failure",
        headBranch: "feat/agent-x",
        createdAt: "2026-07-01T00:00:00Z",
      },
    ];

    it("buildE2eRuns skips a run whose SHA does not resolve and tallies it", () => {
      // Second SHA is unresolvable (resolver returns null) — squash-deleted branch.
      const resolveSecondAsMissing = (sha) =>
        sha === ghRuns[1].headSha ? null : ["services/agent/src/index.ts"];

      const { runs, unresolved } = buildE2eRuns(ghRuns, resolveSecondAsMissing);

      expect(unresolved).toBe(1);
      expect(runs).toEqual([
        {
          sha: ghRuns[0].headSha,
          conclusion: "success",
          changedPaths: ["services/agent/src/index.ts"],
          headRefName: "main",
          createdAt: "2026-07-02T00:00:00Z",
        },
      ]);
    });

    it("buildE2eRuns never throws when every SHA is unresolvable", () => {
      let result;
      expect(() => {
        result = buildE2eRuns(ghRuns, () => null);
      }).not.toThrow();
      expect(result).toEqual({ runs: [], unresolved: 2 });
    });

    it("buildE2eRuns leaves metrics unchanged when every SHA resolves", () => {
      const { runs, unresolved } = buildE2eRuns(ghRuns, () => ["apps/marketing/src/App.tsx"]);
      expect(unresolved).toBe(0);
      expect(runs).toHaveLength(2);
    });

    it("skips a run with no head SHA rather than resolving undefined", () => {
      const { runs, unresolved } = buildE2eRuns(
        [{ conclusion: "failure", headBranch: "x", createdAt: "2026-07-01T00:00:00Z" }],
        () => ["a.ts"]
      );
      expect(unresolved).toBe(1);
      expect(runs).toHaveLength(0);
    });

    it("computeE2eStability consumes the resolvable subset without throwing", () => {
      // End-to-end: one unresolvable SHA is dropped, the report is computed from
      // the resolvable commit only — no throw, valid available result.
      const { runs } = buildE2eRuns(ghRuns, (sha) =>
        sha === ghRuns[1].headSha ? null : ["services/agent/src/index.ts"]
      );
      const result = computeE2eStability(runs);
      expect(result.available).toBe(true);
      expect(result.total_runs).toBe(1);
    });

    it("resolveRunChangedPaths returns null (no throw, no stderr spew) for a bad object", () => {
      const repoRoot = resolve(__dirname, "..", "..");
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const result = resolveRunChangedPaths("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", repoRoot);
        expect(result).toBeNull();
        const spewed = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
        expect(spewed).not.toContain("bad object");
      } finally {
        stderrSpy.mockRestore();
      }
    });

    it("resolveRunChangedPaths returns an array for a resolvable commit (HEAD)", () => {
      const repoRoot = resolve(__dirname, "..", "..");
      const result = resolveRunChangedPaths("HEAD", repoRoot);
      expect(result).not.toBeNull();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
