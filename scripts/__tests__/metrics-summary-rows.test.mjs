import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLighthouseRow, buildMutationRow } from "../metrics-summary-rows.mjs";
import { SENSORS } from "../sensors-registry.mjs";
import { append } from "../metrics-store.mjs";

const lhr = (url, p, a, b, s) => ({
  finalUrl: url,
  categories: {
    performance: { score: p },
    accessibility: { score: a },
    "best-practices": { score: b },
    seo: { score: s },
  },
});

const mutant = (status) => ({ status, mutatorName: "x", location: { start: { line: 1 } } });
const report = {
  thresholds: { high: 80 },
  files: {
    "services/users/src/a.ts": {
      mutants: [mutant("Killed"), mutant("Killed"), mutant("Survived")],
    },
    "packages/types/src/b.ts": { mutants: [mutant("Killed"), mutant("Killed")] },
  },
};

describe("buildLighthouseRow", () => {
  it("averages the runs of each url into one route entry", () => {
    const row = buildLighthouseRow(
      [
        lhr("http://x/", 0.8, 1, 1, 1),
        lhr("http://x/", 1, 1, 0.9, 1),
        lhr("http://x/rialto/", 0.5, 0.9, 1, 1),
      ],
      { date: "2026-10-28", commit: "abc" }
    );
    expect(row.date).toBe("2026-10-28");
    expect(row.commit).toBe("abc");
    expect(row.routes).toEqual([
      { url: "/", performance: 0.9, a11y: 1, "best-practices": 0.95, seo: 1 },
      { url: "/rialto/", performance: 0.5, a11y: 0.9, "best-practices": 1, seo: 1 },
    ]);
  });

  it("keys routes by path so a different LHCI port does not split a route", () => {
    const row = buildLighthouseRow(
      [
        lhr("http://localhost:41111/rialto/", 0.8, 1, 1, 1),
        lhr("http://localhost:52222/rialto/", 1, 1, 1, 1),
      ],
      { date: "2026-10-28", commit: "abc" }
    );
    expect(row.routes).toHaveLength(1);
    expect(row.routes[0]).toMatchObject({ url: "/rialto/", performance: 0.9 });
  });

  it("returns null when no report carries category scores", () => {
    expect(
      buildLighthouseRow([{ finalUrl: "u", categories: {} }], { date: "d", commit: "c" })
    ).toBeNull();
    expect(buildLighthouseRow([], { date: "d", commit: "c" })).toBeNull();
  });
});

describe("buildMutationRow", () => {
  it("records the overall and per-package score", () => {
    const row = buildMutationRow(report, { date: "2026-10-28", commit: "abc" });
    expect(row).toMatchObject({
      date: "2026-10-28",
      commit: "abc",
      killed: 4,
      survived: 1,
      threshold: 80,
    });
    expect(row.mutation_score).toBe(80);
    expect(row.packages).toEqual({ "services/users": 66.67, "packages/types": 100 });
  });

  it("returns null when the run measured nothing", () => {
    expect(buildMutationRow(null, { date: "d", commit: "c" })).toBeNull();
  });
});

describe("sensors read the committed summary rows", () => {
  const rootWith = (name, row) => {
    const root = mkdtempSync(join(tmpdir(), "summary-sensor-"));
    append(name, row, { root });
    return root;
  };

  it("lighthouse sensor reads the newest metrics/lighthouse.jsonl row", () => {
    const row = buildLighthouseRow([lhr("http://x/", 0.9, 1, 1, 1)], {
      date: "2026-10-28",
      commit: "c",
    });
    const root = rootWith("lighthouse", row);
    const out = SENSORS.find((s) => s.id === "lighthouse").collect({ root });
    expect(out.available).toBe(true);
    expect(out.scored_count).toBe(1);
    expect(out.surfaces[0]).toEqual({
      url: "/",
      scores: { performance: 0.9, a11y: 1, "best-practices": 1, seo: 1 },
      last_audit: "2026-10-28",
    });
  });

  it("mutationScore sensor reads the newest metrics/mutation-score.jsonl row", () => {
    const row = buildMutationRow(report, { date: "2026-10-28", commit: "c" });
    const root = rootWith("mutation-score", row);
    const out = SENSORS.find((s) => s.id === "mutationScore").collect({ root, now: new Date() });
    expect(out).toMatchObject({
      available: true,
      mutation_score: 80,
      total_mutants: 5,
      last_run: "2026-10-28",
    });
  });

  it("both stay unavailable with a reason when no row was ever committed", () => {
    const root = mkdtempSync(join(tmpdir(), "summary-sensor-"));
    for (const id of ["lighthouse", "mutationScore"]) {
      const out = SENSORS.find((s) => s.id === id).collect({ root, now: new Date() });
      expect(out.available).toBe(false);
      expect(out.reason).toBe("summary_missing");
    }
  });
});
