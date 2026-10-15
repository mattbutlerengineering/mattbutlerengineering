import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflow, getJob, getStep } from "../lib/workflow.mjs";

/**
 * ci.yml's `test` job is sharded into duration-balanced matrix legs selected by
 * turbo `--filter`, joined by `test-coverage-gate` (docs/features/ci-test-matrix-split).
 *
 * The invariant that matters: every workspace package that defines
 * `test:coverage` runs in exactly ONE leg. Zero legs means its tests silently
 * stop gating; two means it runs (and uploads coverage) twice. The `rest` leg
 * is derived by exclusion so a new package can never fall outside every leg,
 * which leaves this guard to catch double-coverage and drift (a named package
 * that no longer exists).
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = loadWorkflow("ci.yml");
const testJob = getJob(workflow, "test");
const gateJob = getJob(workflow, "test-coverage-gate") ?? {
  needs: [],
  if: null,
  env: {},
  steps: [],
};

const NAMED_LEGS = {
  reservations: "@mbe/reservations-service",
  hospitality: "@mbe/hospitality",
  rialto: "@mattbutlerengineering/rialto",
};

function legFilters() {
  const matrix = testJob.strategy?.matrix ?? {};
  const byLeg = Object.fromEntries(
    (matrix.include ?? []).map((entry) => [entry.leg, entry.filter])
  );
  return (matrix.leg ?? []).map((leg) => {
    const tokens = String(byLeg[leg] ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/^--filter=/, ""));
    return {
      leg,
      includes: tokens.filter((t) => !t.startsWith("!")),
      excludes: tokens.filter((t) => t.startsWith("!")).map((t) => t.slice(1)),
    };
  });
}

/** Workspace package name -> true for every package with a `test:coverage` script. */
function coveragePackages() {
  const dirs = [];
  for (const group of ["apps", "services", "packages", "tools", "plugins"]) {
    const base = resolve(ROOT, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) dirs.push(resolve(base, entry));
  }
  dirs.push(
    resolve(ROOT, "infrastructure/pulumi"),
    resolve(ROOT, "infrastructure/worker"),
    resolve(ROOT, "scripts")
  );
  return dirs
    .map((dir) => resolve(dir, "package.json"))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, "utf8")))
    .filter((pkg) => pkg.scripts?.["test:coverage"])
    .map((pkg) => pkg.name);
}

/** Does `leg` select `pkg`? Includes narrow to the listed set; excludes only subtract. */
function selects(leg, pkg) {
  const included = leg.includes.length === 0 || leg.includes.includes(pkg);
  return included && !leg.excludes.includes(pkg);
}

describe("ci.yml test legs", () => {
  const legs = legFilters();

  it("declares the named legs plus an exclusion-derived rest leg", () => {
    expect(legs.map((l) => l.leg).sort()).toEqual([...Object.keys(NAMED_LEGS), "rest"].sort());
    for (const [leg, pkg] of Object.entries(NAMED_LEGS)) {
      expect(legs.find((l) => l.leg === leg)).toMatchObject({ includes: [pkg], excludes: [] });
    }
    const rest = legs.find((l) => l.leg === "rest");
    expect(rest.includes).toEqual([]);
    expect([...rest.excludes].sort()).toEqual(Object.values(NAMED_LEGS).sort());
  });

  it("every named package exists and defines test:coverage", () => {
    const known = coveragePackages();
    for (const pkg of Object.values(NAMED_LEGS)) expect(known).toContain(pkg);
  });

  it("selects every test:coverage package in exactly one leg", () => {
    const packages = coveragePackages();
    expect(packages.length).toBeGreaterThan(10);
    for (const pkg of packages) {
      const hits = legs.filter((leg) => selects(leg, pkg)).map((l) => l.leg);
      expect(hits, `${pkg} is selected by legs: [${hits.join(", ")}]`).toHaveLength(1);
    }
  });

  it("keeps the --concurrency=2 cap and applies the leg filter", () => {
    const step = getStep(testJob, "Run tests with coverage");
    expect(step.run).toMatch(/turbo test:coverage\s+--concurrency=2/);
    expect(step.run).toContain("${{ matrix.filter }}");
  });

  it("uploads per-leg coverage and test-results artifacts at fixed depths", () => {
    const coverage = getStep(testJob, "Upload coverage artifact") ?? {
      with: { name: "", path: "" },
    };
    expect(coverage.with.name).toBe("coverage-${{ matrix.leg }}");
    expect(coverage.with.path.split("\n").filter(Boolean)).toEqual([
      "*/coverage/coverage-final.json",
      "*/*/coverage/coverage-final.json",
    ]);
    expect(coverage.with.path).not.toContain("**");
    const results = getStep(testJob, "Upload test results");
    expect(results.with.name).toBe("test-results-node${{ matrix.node-version }}-${{ matrix.leg }}");
  });

  it("moves coverage enforcement out of the legs", () => {
    expect(testJob.env.COVERAGE_THRESHOLD).toBeUndefined();
    const names = testJob.steps.map((s) => s.name);
    expect(names).not.toContain("Enforce repo-wide coverage threshold");
    expect(names).not.toContain("Enforce agent-core coverage threshold");
    expect(names).not.toContain("Upload coverage reports");
  });
});

describe("ci.yml test-coverage-gate", () => {
  it("joins every leg with a plain needs (no if: always())", () => {
    expect(gateJob.needs).toEqual(["test"]);
    expect(gateJob.if).toBeNull();
  });

  it("downloads every leg's coverage into the workspace root", () => {
    const download = getStep(gateJob, "Download coverage artifacts") ?? { with: {} };
    expect(download.with).toMatchObject({
      pattern: "coverage-*",
      "merge-multiple": true,
      path: ".",
    });
  });

  it("enforces the 60% repo-wide and 80% agent-core thresholds", () => {
    expect(String(gateJob.env.COVERAGE_THRESHOLD)).toBe("60");
    const agent = getStep(gateJob, "Enforce agent-core coverage threshold") ?? {};
    expect(agent.run ?? "").toMatch(/-lt 80\b/);
    const repo = getStep(gateJob, "Enforce repo-wide coverage threshold") ?? {};
    expect(repo.run ?? "").toContain("TOTAL_LINES");
    expect(repo.run ?? "").toMatch(/-eq 0/);
  });

  it("uploads to codecov", () => {
    expect((getStep(gateJob, "Upload coverage reports") ?? {}).uses).toMatch(
      /^codecov\/codecov-action@/
    );
  });
});

describe("ci.yml CI Gate wiring", () => {
  const gate = getJob(workflow, "ci-gate");

  it("needs both the legs and the coverage gate", () => {
    expect(gate.needs).toContain("test");
    expect(gate.needs).toContain("test-coverage-gate");
  });

  it("keeps report-health keyed on the surviving `test` job id", () => {
    expect(getJob(workflow, "report-health").needs).toContain("test");
  });
});
