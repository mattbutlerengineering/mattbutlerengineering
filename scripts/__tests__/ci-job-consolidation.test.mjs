/**
 * #10010: the sub-minute ci.yml checks each took a full runner slot and its own
 * queue wait. They are folded into a few jobs, each check still its own named
 * step. Pin the job set, the container-scan gating, and that CI Gate still
 * requires every job (so a failing merged step still fails the gate).
 */
import { describe, it, expect } from "vitest";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

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
    expect(CI.jobs["detect-changes"].outputs.has_container_changes).toBeDefined();
    const job = getJob(CI, "containers");
    expect(job.if).toContain("has_container_changes == 'true'");
    expect(job.needs).toContain("detect-changes");
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

  it("CI Gate needs every other job", () => {
    const others = Object.keys(CI.jobs).filter((id) => id !== "ci-gate" && id !== "report-health");
    expect(CI.jobs["ci-gate"].needs.slice().sort()).toEqual(others.sort());
  });
});
