import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("e2e.yml");
const LOCALE_SWEEP = new URL("../../apps/hospitality/e2e/locale-sweep.spec.ts", import.meta.url);

/**
 * The hospitality suite sat at its 20-minute limit: 14 to 19 minutes when it
 * finished, `cancelled` with its last tests unrun when it did not (#8038). Two
 * workers on one runner barely helped, because they contend for one Vite dev
 * server (11.0 to 11.9 minutes, and a new networkidle timeout), so the suite is
 * split across two runners, each with its own server, Postgres and Redis, and
 * one worker as before.
 */
describe("e2e.yml hospitality shards", () => {
  const shard = getJob(WORKFLOW, "hospitality-e2e");
  const result = getJob(WORKFLOW, "hospitality-e2e-result");

  it("runs two shards and lets both finish when one fails", () => {
    expect(shard.strategy.matrix.shard).toEqual([1, 2]);
    expect(shard.strategy["fail-fast"]).toBe(false);
  });

  it("takes the shard total from the matrix, so no shard can be left out", () => {
    expect(getStep(shard, "Run E2E tests").run).toBe(
      "pnpm --dir apps/hospitality test:e2e --shard=${{ matrix.shard }}/${{ strategy.job-total }}"
    );
  });

  // Sharding keeps a file whole unless the file opts out, and this one holds 126
  // of the 355 tests, which leaves the shards at 241 and 115. One worker per
  // shard means parallel mode only lets the file split; its tests never overlap.
  it("lets the locale sweep split across the shards", () => {
    expect(readFileSync(LOCALE_SWEEP, "utf8")).toMatch(
      /^test\.describe\.configure\(\{ mode: "parallel" \}\);$/m
    );
  });

  it("names a shard's artifacts after it, so uploads cannot collide", () => {
    for (const step of ["Upload failure artifacts", "Upload E2E environment diagnostics"]) {
      expect(getStep(shard, step).with.name).toContain("${{ matrix.shard }}");
    }
  });

  it("keeps the 20-minute limit on each shard", () => {
    expect(shard["timeout-minutes"]).toBe(20);
  });

  it("reports one combined result under the original check name", () => {
    expect(result.name).toBe("Hospitality E2E");
    expect(result.needs).toEqual(["hospitality-e2e"]);
    expect(result.if).toContain("!cancelled()");
    expect(result.if).toContain("needs.hospitality-e2e.result != 'skipped'");
    const step = getStep(result, "All shards passed");
    expect(step.env.SHARDS_RESULT).toBe("${{ needs.hospitality-e2e.result }}");
    expect(step.run).toContain('[ "$SHARDS_RESULT" = "success" ]');
  });
});
