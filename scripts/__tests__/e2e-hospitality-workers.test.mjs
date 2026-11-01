import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { getJob, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("e2e.yml");
const LOCALE_SWEEP = new URL("../../apps/hospitality/e2e/locale-sweep.spec.ts", import.meta.url);

/**
 * The hospitality suite ran on one worker and sat at its 20-minute limit: 14 to
 * 19 minutes when it finished, `cancelled` with its last tests unrun when it did
 * not (#8038). Two workers is what buys the room. The limit stays at 20 so a
 * suite growing back toward it is cancelled rather than quietly costing more,
 * and the flag lives on this step, not in playwright.config.ts, because the
 * visual config and e2e-screenshots.yml inherit that config's `workers: 1`.
 */
describe("e2e.yml hospitality job", () => {
  const job = getJob(WORKFLOW, "hospitality-e2e");
  const run = job.steps.find((s) => s.name === "Run E2E tests").run;

  it("runs the whole suite on two workers", () => {
    expect(run).toMatch(/pnpm --dir apps\/hospitality test:e2e --workers=2$/m);
  });

  // Files stay whole on a worker, and this one holds 126 of the 355 tests, so
  // without this it alone sets the job's length however many workers there are.
  it("splits the locale sweep across workers", () => {
    expect(readFileSync(LOCALE_SWEEP, "utf8")).toMatch(
      /^test\.describe\.configure\(\{ mode: "parallel" \}\);$/m
    );
  });

  it("does not narrow the suite to a spec list or a shard", () => {
    expect(run).not.toMatch(/--shard|--grep|\.spec\.ts|\.test\.ts/);
  });

  it("keeps the 20-minute limit and the job name", () => {
    expect(job["timeout-minutes"]).toBe(20);
    expect(job.name).toBe("Hospitality E2E");
  });
});
