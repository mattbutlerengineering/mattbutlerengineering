import { describe, it, expect } from "vitest";
import {
  classifyAuthor,
  percentile,
  summarizeSdlcSpeed,
  detectSdlcRegressions,
  dedupeProposals,
  normalizeSearchPr,
  normalizeCiRun,
  upsertSensorRow,
} from "../collect-sdlc-speed.mjs";

// Shape captured from `gh api search/issues?q=repo:..+is:pr+is:merged` (items[]).
const searchItem = (over = {}) => ({
  number: 6678,
  user: { login: "mattbutlerengineering" },
  labels: [{ name: "tier:trivial" }],
  created_at: "2026-10-15T05:26:59Z",
  pull_request: { merged_at: "2026-10-15T05:37:59Z" },
  ...over,
});

const pr = (number, authorClass, minutes) => ({ number, authorClass, openToMergeMin: minutes });

describe("classifyAuthor", () => {
  it("classifies dependabot in REST and gh formats", () => {
    expect(classifyAuthor({ author: "dependabot[bot]", labels: [] })).toBe("dependabot");
    expect(classifyAuthor({ author: "app/dependabot", labels: [] })).toBe("dependabot");
  });
  it("classifies github-actions automation", () => {
    expect(classifyAuthor({ author: "github-actions[bot]", labels: [] })).toBe("github-actions");
  });
  it("classifies agent-authored label, human otherwise", () => {
    expect(classifyAuthor({ author: "mattbutlerengineering", labels: ["agent-authored"] })).toBe(
      "agent"
    );
    expect(classifyAuthor({ author: "mattbutlerengineering", labels: ["tier:trivial"] })).toBe(
      "human"
    );
  });
  it("lets bot authors win over the agent label", () => {
    expect(classifyAuthor({ author: "dependabot[bot]", labels: ["agent-authored"] })).toBe(
      "dependabot"
    );
  });
});

describe("percentile", () => {
  it("uses nearest-rank on a fixed fixture", () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 90)).toBe(90);
    expect(percentile([7], 90)).toBe(7);
  });
  it("returns 0 for empty input, not NaN", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

describe("normalizers", () => {
  it("normalizes a search item to minutes open->merge", () => {
    expect(normalizeSearchPr(searchItem())).toMatchObject({
      number: 6678,
      authorClass: "human",
      openToMergeMin: 11,
    });
  });
  it("drops items that were never merged", () => {
    expect(normalizeSearchPr(searchItem({ pull_request: { merged_at: null } }))).toBeNull();
  });
  it("drops cancelled/skipped/in-flight runs", () => {
    const base = { run_started_at: "2026-10-15T05:00:00Z", updated_at: "2026-10-15T05:10:00Z" };
    expect(normalizeCiRun({ ...base, conclusion: "cancelled" })).toBeNull();
    expect(normalizeCiRun({ ...base, conclusion: "skipped" })).toBeNull();
    expect(normalizeCiRun({ ...base, conclusion: null })).toBeNull();
    expect(normalizeCiRun({ ...base, conclusion: "success" })).toMatchObject({ wallMin: 10 });
  });
});

describe("summarizeSdlcSpeed", () => {
  const prs = [
    pr(1, "human", 10),
    pr(2, "human", 30),
    pr(3, "dependabot", 100),
    pr(4, "dependabot", 1440),
    pr(5, "dependabot", 600),
    pr(6, "dependabot", 5),
    pr(7, "agent", 20),
  ];
  const ciRuns = [
    { wallMin: 4, touchedLockfile: false, jobs: [{ name: "Test", durationMin: 3 }] },
    {
      wallMin: 8,
      touchedLockfile: false,
      jobs: [
        { name: "Test", durationMin: 6 },
        { name: "Lint", durationMin: 1 },
      ],
    },
    { wallMin: 23, touchedLockfile: true, jobs: [{ name: "Test", durationMin: 14 }] },
    { wallMin: 6, touchedLockfile: false, jobs: [] },
  ];
  const summary = summarizeSdlcSpeed({ prs, ciRuns, protection: { strict: false } });

  it("splits by class with p50/p90/max and the 3 slowest PRs", () => {
    expect(summary.prs.total).toBe(7);
    expect(summary.prs.byClass.dependabot).toMatchObject({ count: 4, max: 1440, p90: 1440 });
    expect(summary.prs.byClass.dependabot.slowest).toEqual([4, 5, 3]);
    expect(summary.prs.byClass.human).toMatchObject({ count: 2, p50: 10, p90: 30 });
  });
  it("includes empty classes as zeros", () => {
    expect(summary.prs.byClass["github-actions"]).toEqual({
      count: 0,
      p50: 0,
      p90: 0,
      max: 0,
      slowest: [],
    });
  });
  it("summarizes CI wall time, slowest job by median, lockfile share", () => {
    expect(summary.ci.runs).toBe(4);
    expect(summary.ci.p50).toBe(6);
    expect(summary.ci.slowestJob).toEqual({ name: "Test", medianMin: 6 });
    expect(summary.ci.lockfileShare).toBe(0.25);
  });
  it("excludes unsampled (null) runs from the lockfile share denominator", () => {
    const s = summarizeSdlcSpeed({
      prs: [],
      ciRuns: [
        { wallMin: 5, touchedLockfile: true, jobs: [] },
        { wallMin: 5, touchedLockfile: false, jobs: [] },
        { wallMin: 5, touchedLockfile: null, jobs: [] },
      ],
      protection: null,
    });
    expect(s.ci.lockfileShare).toBe(0.5);
  });
  it("reports mainStrict from protection, null when unknown", () => {
    expect(summary.mainStrict).toBe(false);
    expect(summarizeSdlcSpeed({ prs: [], ciRuns: [], protection: null }).mainStrict).toBeNull();
  });
  it("returns zeros for an empty window, never NaN", () => {
    const s = summarizeSdlcSpeed({ prs: [], ciRuns: [], protection: { strict: true } });
    expect(s.prs.total).toBe(0);
    expect(s.prs.byClass.human.p90).toBe(0);
    expect(s.ci).toEqual({ runs: 0, p50: 0, p90: 0, slowestJob: null, lockfileShare: 0 });
    expect(JSON.stringify(s)).not.toContain("NaN");
  });
});

describe("detectSdlcRegressions", () => {
  const mk = (depP90, ciP50) => ({
    prs: {
      byClass: {
        dependabot: { count: 4, p90: depP90, slowest: [9, 8, 7] },
        human: { count: 3, p90: 30, slowest: [] },
      },
    },
    ci: { runs: 10, p50: ciP50 },
  });
  it("proposes one issue when a class p90 rises >= 50%", () => {
    const out = detectSdlcRegressions(mk(1500, 10), mk(1000, 10));
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe(
      "sdlc-speed: dependabot PR p90 open-to-merge regressed week over week"
    );
  });
  it("proposes nothing under threshold", () => {
    expect(detectSdlcRegressions(mk(1400, 12), mk(1000, 10))).toEqual([]);
  });
  it("proposes for CI p50 up >= 30%", () => {
    const out = detectSdlcRegressions(mk(1000, 13), mk(1000, 10));
    expect(out.map((p) => p.title)).toEqual([
      "sdlc-speed: ci.yml p50 wall time regressed week over week",
    ]);
  });
  it("ignores a missing or zero baseline", () => {
    expect(detectSdlcRegressions(mk(1500, 10), null)).toEqual([]);
    expect(detectSdlcRegressions(mk(1500, 10), mk(0, 0))).toEqual([]);
  });
});

describe("upsertSensorRow", () => {
  const entry = (date, extra = {}) => ({ date, sensor: "sdlcSpeed", available: true, ...extra });
  it("two runs on different days append two comparable rows", () => {
    const one = upsertSensorRow("", entry("2026-10-08"));
    const two = upsertSensorRow(one, entry("2026-10-15"));
    expect(two.trim().split("\n")).toHaveLength(2);
  });
  it("replaces a same-day row and keeps other sensors and unparseable lines", () => {
    const base = 'not json\n{"date":"2026-10-15","sensor":"ciHealth"}\n';
    const once = upsertSensorRow(base, entry("2026-10-15", { v: 1 }));
    const out = upsertSensorRow(once, entry("2026-10-15", { v: 2 }));
    expect(out.trim().split("\n")).toHaveLength(3);
    expect(out).toContain('"v":2');
    expect(out).not.toContain('"v":1');
  });
});

describe("dedupeProposals", () => {
  const proposals = [
    { title: "a", body: "x" },
    { title: "b", body: "y" },
  ];
  it("drops proposals whose title matches an open issue", () => {
    expect(dedupeProposals(proposals, ["a"])).toEqual([{ title: "b", body: "y" }]);
  });
  it("files at most one per run", () => {
    expect(dedupeProposals(proposals, [])).toHaveLength(1);
  });
});
