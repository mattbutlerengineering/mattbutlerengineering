/**
 * #10010: the sub-minute ci.yml checks each took a full runner slot and its own
 * queue wait. They are folded into a few jobs, each check still its own named
 * step. Pin the job set, the container-scan gating, and that CI Gate still
 * requires every job (so a failing merged step still fails the gate).
 */
import { describe, it, expect } from "vitest";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";
import { BUILD_CHAIN_JOBS } from "../ci-gate-required-results.mjs";

const CI = loadWorkflow("ci.yml");
const RETIRED = [
  "lint",
  "typecheck",
  "architecture-audit",
  "integrity",
  "dependency-audit",
  "ai-antipattern-ratchet",
  "visual-tolerance-check",
  "migration-dry-run",
  "hadolint",
  "trivy",
  "test-coverage-gate",
];

describe("ci.yml job consolidation (#10010)", () => {
  it.each(RETIRED)("%s is no longer its own job", (id) => {
    expect(CI.jobs[id]).toBeUndefined();
  });

  it("keeps the critical-path jobs", () => {
    for (const id of ["prepare", "build", "test", "rls-integration", "ci-gate"]) {
      expect(CI.jobs[id]).toBeDefined();
    }
  });

  it("static-checks keeps each check as a named step", () => {
    const job = getJob(CI, "static-checks");
    for (const name of [/Lint/, /knip/, /Typecheck/, /Architecture/]) {
      expect(getStep(job, name)).not.toBeNull();
    }
    expect(job.needs).toEqual(["prepare"]);
  });

  it("repo-checks keeps each check as a named step", () => {
    const job = getJob(CI, "repo-checks");
    for (const name of [
      /Dependency/,
      /instruction rot/,
      /doc freshness/,
      /antipattern/,
      /visual/i,
    ]) {
      expect(getStep(job, name)).not.toBeNull();
    }
    expect(getStep(job, /visual/i).if).toContain("pull_request");
  });

  it("migrations absorbs the PR-only dry run", () => {
    const job = getJob(CI, "migrations");
    expect(job.needs).toEqual(["prepare"]);
    expect(getStep(job, /dry-run/i)).not.toBeNull();
  });

  it("container scans run only when Dockerfiles, build context or lockfile changed", () => {
    expect(CI.jobs.prepare.outputs.has_container_changes).toBeDefined();
    const job = getJob(CI, "containers");
    expect(job.if).toContain("has_container_changes == 'true'");
    expect(job.needs).toContain("prepare");
    const text = JSON.stringify(job.steps);
    for (const df of ["users", "reservations", "agent", "migrate"]) {
      expect(text).toContain(`${df}-trivy-results.sarif`);
    }
    expect(text).toContain("hadolint/hadolint-action");
  });

  it("test coverage gate runs as steps of CI Gate", () => {
    const job = getJob(CI, "ci-gate");
    expect(getStep(job, /Enforce repo-wide coverage threshold/)).not.toBeNull();
    expect(getStep(job, /Enforce agent-core coverage threshold/)).not.toBeNull();
    expect(getStep(job, /Publish CI Gate commit status/)).not.toBeNull();
  });

  // #10064: change detection is Prepare's first step, not its own job, so the
  // required path is Prepare -> leaf jobs -> CI Gate (three queued hops, not four).
  describe("detect-changes folded into prepare (#10064)", () => {
    const BUILD_CHAIN = [
      "static-checks",
      "repo-checks",
      "build",
      "test",
      "migrations",
      "rls-integration",
    ];

    it("has no separate detect-changes job", () => {
      expect(CI.jobs["detect-changes"]).toBeUndefined();
    });

    it("prepare is the root: no needs, no if, and it exports every change flag", () => {
      const job = getJob(CI, "prepare");
      expect(job.needs).toEqual([]);
      expect(job.if).toBeNull();
      for (const flag of ["has_code", "has_rialto", "has_container_changes"]) {
        expect(job.outputs[flag]).toBe(`\${{ steps.filter.outputs.${flag} }}`);
      }
    });

    it("prepare skips its install and build steps on a docs-only change", () => {
      const steps = getJob(CI, "prepare").steps;
      const filterIdx = steps.findIndex((s) => s.id === "filter");
      expect(filterIdx).toBeGreaterThan(0);
      for (const s of steps.slice(filterIdx + 1)) {
        expect(s.if, `${s.name ?? s.uses} is gated on has_code`).toContain(
          "steps.filter.outputs.has_code == 'true'"
        );
      }
    });

    it("prepare checks out full history for the diff against the base branch", () => {
      const checkout = getJob(CI, "prepare").steps[0];
      expect(checkout.uses).toMatch(/^actions\/checkout@/);
      expect(checkout.with["fetch-depth"]).toBe(0);
    });

    it("CI Gate's build-chain list matches the jobs gated only on has_code", () => {
      // The gate module requires each BUILD_CHAIN_JOBS job to succeed when
      // has_code is "true"; a job gated on has_code but missing from that list
      // could skip unnoticed.
      const gatedOnHasCode = Object.entries(CI.jobs)
        .filter(([, job]) => job.if === "needs.prepare.outputs.has_code == 'true'")
        .map(([id]) => id);
      expect(gatedOnHasCode.sort()).toEqual(BUILD_CHAIN_JOBS.slice().sort());
      expect(BUILD_CHAIN.slice().sort()).toEqual(BUILD_CHAIN_JOBS.slice().sort());
    });

    it.each(BUILD_CHAIN)("%s runs only when prepare reports code changes", (id) => {
      const job = getJob(CI, id);
      expect([].concat(job.needs)).toContain("prepare");
      expect(job.if).toContain("needs.prepare.outputs.has_code == 'true'");
    });

    it("no job still references the retired detect-changes outputs", () => {
      expect(JSON.stringify(CI.jobs)).not.toContain("detect-changes");
    });
  });

  it("CI Gate needs every other job", () => {
    const others = Object.keys(CI.jobs).filter((id) => id !== "ci-gate" && id !== "report-health");
    expect(CI.jobs["ci-gate"].needs.slice().sort()).toEqual(others.sort());
  });
});
