import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("e2e.yml");
const HOSPITALITY = new URL("../../apps/hospitality", import.meta.url).pathname;
const LOCALE_SWEEP = new URL("../../apps/hospitality/e2e/locale-sweep.spec.ts", import.meta.url);

/**
 * The hospitality suite sat at its 20-minute limit: 14 to 19 minutes when it
 * finished, `cancelled` with its last tests unrun when it did not (#8038). Two
 * workers on one runner barely helped, because they contend for one Vite dev
 * server (11.0 to 11.9 minutes, and a new networkidle timeout), so the suite is
 * split across runners, each with its own server, Postgres and Redis, and one
 * worker as before. Two runners reached the limit again as the availability specs
 * grew (18 to 19 minutes, then `cancelled` with every test passed on #8137), so
 * there are three. Shard 1 then grew to 235 tests in 16.8 to 18.3 minutes and was
 * `cancelled` during teardown with every test passed (#8797), so the limit is 30
 * minutes: room for a full shard to finish and report, while a hung run still ends.
 * When a shard's tests near 20 minutes again, add a shard rather than more time.
 */
/**
 * `Hospitality E2E` is to become a required check (#9834). A workflow-level
 * `paths:` filter means a PR outside it gets no check at all, and a required
 * check that never reports leaves the PR blocked forever. The `changes` job
 * decides instead: a skipped job still reports, and a skipped check passes.
 */
describe("e2e.yml always reports Hospitality E2E", () => {
  it("starts on every pull request, with no workflow-level paths filter", () => {
    const pr = WORKFLOW.on.pull_request;
    expect(pr.paths).toBeUndefined();
    expect(pr["paths-ignore"]).toBeUndefined();
  });

  it("skips the result job, rather than leaving it out, when the shards skip", () => {
    const result = getJob(WORKFLOW, "hospitality-e2e-result");
    expect(result.name).toBe("Hospitality E2E");
    expect(result.if).toContain("needs.hospitality-e2e.result != 'skipped'");
  });
});

/**
 * Balance by duration, not test count (#10014). Playwright slices the file-ordered
 * tests into contiguous shards by test count, weighted by PWTEST_SHARD_WEIGHTS. At
 * 1:1:1 the shards held 252 / 251 / 251 tests but ran 22.4 / 11.8 / 15.2 minutes
 * (run 46069938962, shard 1 = the slow availability specs; its 22.4 includes four
 * failing tests and their retries). Each test is costed at its baseline shard's
 * minutes per test, then the real `playwright test --list --shard` split under the
 * workflow's weights is summed per shard.
 */
describe("e2e.yml hospitality shard weights", () => {
  const BASELINE_MINUTES = [22.4, 11.8, 15.2];
  const MAX_TO_MIN = 1.5;
  const total = getJob(WORKFLOW, "hospitality-e2e").strategy.matrix.shard.length;
  const weights = getStep(getJob(WORKFLOW, "hospitality-e2e"), "Run E2E tests").env
    .PWTEST_SHARD_WEIGHTS;

  const memo = new Map();
  const listShard = (current, shardWeights) => {
    const key = `${current}|${shardWeights}`;
    if (!memo.has(key)) memo.set(key, listShardUncached(current, shardWeights));
    return memo.get(key);
  };
  const listShardUncached = (current, shardWeights) => {
    const env = {
      ...process.env,
      // auth.setup.ts throws on load without these, which drops the setup test.
      E2E_AUTH0_DOMAIN: "x",
      E2E_AUTH0_CLIENT_ID: "x",
      E2E_AUTH0_AUDIENCE: "x",
      E2E_AUTH_EMAIL: "x",
      E2E_AUTH_PASSWORD: "x",
    };
    if (shardWeights) env.PWTEST_SHARD_WEIGHTS = shardWeights;
    else delete env.PWTEST_SHARD_WEIGHTS;
    const result = spawnSync(
      "pnpm",
      ["exec", "playwright", "test", "--list", "--reporter=json", `--shard=${current}/${total}`],
      { cwd: HOSPITALITY, env, encoding: "utf8", maxBuffer: 1 << 28 }
    );
    const json = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
    expect(json.errors).toEqual([]);
    const ids = [];
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests)
          ids.push(`${spec.file}:${spec.line}:${spec.title}:${t.projectName}`);
      }
      (suite.suites ?? []).forEach(walk);
    };
    json.suites.forEach(walk);
    return ids;
  };
  const shardNumbers = Array.from({ length: total }, (_, i) => i + 1);

  it("gives one integer weight per shard", () => {
    const parts = weights.split(":");
    expect(parts).toHaveLength(total);
    for (const part of parts) expect(part).toMatch(/^[1-9]\d*$/);
  });

  // Ids repeat for parameterised tests, so compare the sorted lists, not sets.
  it("keeps every test in exactly one shard, so none is dropped", () => {
    const all = shardNumbers.flatMap((n) => listShard(n, weights));
    const unsharded = shardNumbers.flatMap((n) => listShard(n, undefined));
    expect(all.toSorted()).toEqual(unsharded.toSorted());
  }, 240_000);

  it("estimates the longest shard within 1.5x of the shortest", () => {
    expect(BASELINE_MINUTES).toHaveLength(total);
    const cost = new Map();
    shardNumbers.forEach((n) => {
      const ids = listShard(n, undefined);
      ids.forEach((id) => cost.set(id, (cost.get(id) ?? 0) + BASELINE_MINUTES[n - 1] / ids.length));
    });
    const count = new Map();
    for (const id of shardNumbers.flatMap((n) => listShard(n, undefined))) {
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    const minutes = shardNumbers.map((n) =>
      listShard(n, weights).reduce((sum, id) => sum + cost.get(id) / count.get(id), 0)
    );
    expect(Math.max(...minutes) / Math.min(...minutes)).toBeLessThanOrEqual(MAX_TO_MIN);
  }, 240_000);
});

describe("e2e.yml hospitality shards", () => {
  const shard = getJob(WORKFLOW, "hospitality-e2e");
  const result = getJob(WORKFLOW, "hospitality-e2e-result");

  it("runs three shards and lets all finish when one fails", () => {
    expect(shard.strategy.matrix.shard).toEqual([1, 2, 3]);
    expect(shard.strategy["fail-fast"]).toBe(false);
  });

  it("takes the shard total from the matrix, so no shard can be left out", () => {
    expect(getStep(shard, "Run E2E tests").run).toBe(
      "pnpm --dir apps/hospitality test:e2e --shard=${{ matrix.shard }}/${{ strategy.job-total }}"
    );
  });

  // Sharding keeps a file whole unless the file opts out, and this one is the
  // largest by far (126 of 355 tests when it opted out). One worker per shard
  // means parallel mode only lets the file split; its tests never overlap.
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

  it("gives each shard 30 minutes, so a full shard is not cancelled during teardown", () => {
    expect(shard["timeout-minutes"]).toBe(30);
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
