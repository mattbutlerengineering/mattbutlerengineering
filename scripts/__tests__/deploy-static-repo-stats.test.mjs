import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/deploy-static.yml"), "utf8");

/**
 * `scripts/collect-repo-stats.mjs` refreshes the landing proof strip's figures
 * by searching `GET /search/issues` for `is:pr is:merged`. The search is a
 * read of *pull requests*, so the job's `GITHUB_TOKEN` needs pull-request read
 * access — and when it lacks it, GitHub does not answer 403. It answers
 * **HTTP 200 with `total_count: 0`**, because unreadable results are filtered
 * out rather than refused.
 *
 * That is how the deployed site came to claim "0 Agent-authored PRs merged"
 * and "0 Pull requests merged" while the job's own log read
 * `collect-repo-stats: wrote apps/marketing/src/data/generated/repo-stats.json`
 * — a green step, a written snapshot, and two headline figures that were
 * simply wrong. The job granted `issues: read` and nothing else.
 *
 * Asserted here rather than left to review because the failure is invisible
 * from inside the run: every check passes, and only the rendered page differs.
 */
describe("deploy-static grants the repo-stats collector the scope it reads", () => {
  /** The `permissions:` block of the job that runs `collect-repo-stats.mjs`. */
  function collectorJobPermissions() {
    const step = WORKFLOW.indexOf("node scripts/collect-repo-stats.mjs");
    expect(step, "deploy-static.yml runs scripts/collect-repo-stats.mjs").toBeGreaterThan(-1);

    // Walk back to that step's own job header, then forward to its permissions.
    // The block is every line indented under `permissions:`; comment lines are
    // skipped rather than ended on, so annotating a scope can't quietly empty
    // this map and leave the assertions below passing on nothing.
    const jobStart = WORKFLOW.lastIndexOf("\n  deploy-", step);
    const block = /\n {4}permissions:\n((?: {6}\S.*\n)+)/.exec(WORKFLOW.slice(jobStart, step));
    expect(block, "the collector's job declares a permissions: block").not.toBeNull();

    return Object.fromEntries(
      (block?.[1] ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.split(": "))
    );
  }

  it("grants pull-requests: read, without which the PR search silently counts zero", () => {
    expect(collectorJobPermissions()["pull-requests"]).toBe("read");
  });

  it("keeps the job least-privilege — read-only, and no write scope", () => {
    const granted = Object.values(collectorJobPermissions());
    expect(granted.length).toBeGreaterThan(0);
    expect(granted.every((level) => level === "read")).toBe(true);
  });
});
