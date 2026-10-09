/**
 * Structural guard for .github/workflows/sentry-heartbeat.yml.
 *
 * The workflow's whole job is to go red when a Sentry project stops
 * ingesting. Every way it could silently go green — a piped exit code, a
 * reconciliation step skipped after a failure, the exit step not being last —
 * reads exactly like health, which is the failure this feature exists to
 * remove. Text-level checks on the real file, matching the house style
 * (docs-audit-workflow.test.mjs).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/sentry-heartbeat.yml"), "utf8");

/** Each step as its raw text block, in order. */
function steps() {
  const body = WORKFLOW.slice(WORKFLOW.indexOf("    steps:\n"));
  return body
    .split(/\n {6}- /)
    .slice(1)
    .map((block) => `- ${block}`);
}

/** The script text of every `run:` (single-line or block scalar). */
function runBlocks() {
  return steps()
    .map((step) => /\n?\s*run: (\|\n)?([\s\S]*)$/.exec(step)?.[2])
    .filter((run) => run !== undefined)
    .map((run) =>
      run
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    );
}

describe("sentry-heartbeat.yml", () => {
  it("runs daily on a cron and on demand (SC-1)", () => {
    expect(WORKFLOW).toMatch(/\n {2}schedule:\n(?: {4}#.*\n)* {4}- cron: "23 13 \* \* \*"/);
    expect(WORKFLOW).toMatch(/\n {2}workflow_dispatch:\s*\n/);
  });

  it("has no paths filter that could exclude its own scripts", () => {
    expect(WORKFLOW).not.toMatch(/\n\s+paths(-ignore)?:/);
  });

  it("asks only for the permissions it uses", () => {
    expect(WORKFLOW).toMatch(/\npermissions:\n {2}contents: read\n {2}issues: write\n/);
  });

  it("pins every action to a full commit SHA", () => {
    const uses = [...WORKFLOW.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) {
      if (ref.startsWith("./")) continue;
      expect(ref, `${ref} is pinned to a 40-char SHA`).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("starts every run block with set -o pipefail and never assigns status= (SC-12)", () => {
    const runs = runBlocks();
    expect(runs.length).toBeGreaterThanOrEqual(4);
    for (const lines of runs) {
      expect(lines[0], `run block: ${lines.join(" / ")}`).toBe("set -o pipefail");
      expect(lines.join("\n")).not.toMatch(/(^|[^\w])status=/);
    }
  });

  it("reconciles issues and computes the exit even after a failed step, with the exit last (SC-6)", () => {
    const all = steps();
    const issuesIndex = all.findIndex((step) =>
      step.includes("scripts/sentry-heartbeat-issues.mjs")
    );
    const exitIndex = all.findIndex((step) => step.includes("--exit-from heartbeat-verdicts.json"));
    const runnerIndex = all.findIndex((step) => step.includes("--out heartbeat-verdicts.json"));
    expect(runnerIndex).toBeGreaterThan(-1);
    expect(issuesIndex).toBeGreaterThan(runnerIndex);
    expect(exitIndex).toBe(all.length - 1);
    expect(all[issuesIndex]).toMatch(/\n\s+if: always\(\)/);
    expect(all[exitIndex]).toMatch(/\n\s+if: always\(\)/);
  });

  it("installs Chromium before running the browser triggers", () => {
    const all = steps();
    const install = all.findIndex((step) =>
      step.includes("playwright install --with-deps chromium")
    );
    const runner = all.findIndex((step) => step.includes("--out heartbeat-verdicts.json"));
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(runner);
  });

  it("passes the Sentry token and the job's GitHub token", () => {
    expect(WORKFLOW).toContain("SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}");
    expect(WORKFLOW).toContain("GH_TOKEN: ${{ github.token }}");
  });

  it("bounds the job and never overlaps runs", () => {
    expect(WORKFLOW).toMatch(/timeout-minutes: 15/);
    expect(WORKFLOW).toMatch(
      /concurrency:\n {2}group: sentry-heartbeat\n {2}cancel-in-progress: false/
    );
  });
});
