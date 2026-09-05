/**
 * Regression test for #5003: `a11y-attribution` is defined in ci.yml but was
 * never added to `ci-gate`'s `needs:` list, so it can go red on an agent PR
 * and block nothing — `CI Gate` is the only required status check on main
 * (see .claude/rules/gotchas.md § CI). This asserts the invariant going
 * forward: every job in ci.yml is either in ci-gate's `needs:`, is ci-gate
 * itself, or is explicitly named in ADVISORY_JOBS with a reason.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractJobNames,
  extractJobNeeds,
  findUnreachableJobs,
  ADVISORY_JOBS,
} from "../check-ci-gate-coverage.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function makeCiYml(jobsYaml) {
  return `name: CI\n\non:\n  pull_request:\n\njobs:\n${jobsYaml}`;
}

describe("extractJobNames", () => {
  it("returns every top-level job name in file order", () => {
    const content = makeCiYml(
      "  foo:\n    runs-on: ubuntu-latest\n  bar:\n    runs-on: ubuntu-latest\n"
    );

    expect(extractJobNames(content)).toEqual(["foo", "bar"]);
  });
});

describe("extractJobNeeds", () => {
  it("parses a bracketed multi-line needs list", () => {
    const content = makeCiYml(
      "  gate:\n    needs:\n      [\n        foo,\n        bar,\n      ]\n"
    );

    expect(extractJobNeeds(content, "gate")).toEqual(["foo", "bar"]);
  });

  it("parses a block-list needs form", () => {
    const content = makeCiYml("  gate:\n    needs:\n      - foo\n      - bar\n");

    expect(extractJobNeeds(content, "gate")).toEqual(["foo", "bar"]);
  });

  it("parses a single inline-scalar needs value", () => {
    const content = makeCiYml("  gate:\n    needs: foo\n");

    expect(extractJobNeeds(content, "gate")).toEqual(["foo"]);
  });

  it("returns [] for a job with no needs", () => {
    const content = makeCiYml("  gate:\n    runs-on: ubuntu-latest\n");

    expect(extractJobNeeds(content, "gate")).toEqual([]);
  });
});

describe("findUnreachableJobs", () => {
  it("RED case: flags a job that is defined but not in ci-gate's needs", () => {
    const content = makeCiYml(
      [
        "  foo:\n    runs-on: ubuntu-latest\n",
        "  bar:\n    runs-on: ubuntu-latest\n",
        "  ci-gate:\n    needs:\n      [\n        foo,\n      ]\n",
      ].join("")
    );

    expect(findUnreachableJobs(content, {})).toEqual(["bar"]);
  });

  it("does not flag a job that is in ci-gate's needs", () => {
    const content = makeCiYml(
      [
        "  foo:\n    runs-on: ubuntu-latest\n",
        "  ci-gate:\n    needs:\n      [\n        foo,\n      ]\n",
      ].join("")
    );

    expect(findUnreachableJobs(content, {})).toEqual([]);
  });

  it("does not flag a job explicitly named in the advisory allowlist", () => {
    const content = makeCiYml(
      [
        "  foo:\n    runs-on: ubuntu-latest\n",
        "  advisory-job:\n    runs-on: ubuntu-latest\n",
        "  ci-gate:\n    needs:\n      [\n        foo,\n      ]\n",
      ].join("")
    );

    expect(
      findUnreachableJobs(content, { "advisory-job": "informational only, never gates a PR" })
    ).toEqual([]);
  });

  it("does not flag ci-gate itself", () => {
    const content = makeCiYml("  ci-gate:\n    needs:\n      [\n      ]\n");

    expect(findUnreachableJobs(content, {})).toEqual([]);
  });
});

describe("the real repository ci.yml", () => {
  it("has zero jobs unreachable from ci-gate's needs (RED before #5003's fix)", () => {
    const content = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf-8");

    expect(findUnreachableJobs(content)).toEqual([]);
  });

  it("a11y-attribution is in ci-gate's needs list", () => {
    const content = readFileSync(join(repoRoot, ".github", "workflows", "ci.yml"), "utf-8");

    expect(extractJobNeeds(content, "ci-gate")).toContain("a11y-attribution");
  });

  it("report-health is the only advisory job, and it names a reason", () => {
    expect(Object.keys(ADVISORY_JOBS)).toEqual(["report-health"]);
    expect(ADVISORY_JOBS["report-health"]).toBeTruthy();
  });
});

describe("repo-audit wiring", () => {
  it("repo-audit runs this check, so a regression fails CI instead of sitting unnoticed", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8"));

    expect(pkg.scripts["repo-audit"]).toContain("check-ci-gate-coverage.mjs");
  });
});
