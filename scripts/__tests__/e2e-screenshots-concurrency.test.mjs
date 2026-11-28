// #10132: e2e-screenshots.yml runs the whole hospitality suite unsharded for
// 40-45 minutes on every push to main that touches apps/hospitality. With no
// concurrency group, a merge burst ran five of them at once (2026-11-28
// 06:44Z: 5 of 13 in-progress runs) while 174 runs waited for a runner.
// One group per ref caps it at one running and one pending run: GitHub keeps
// only the newest pending run of a group, and only the newest commit's
// screenshots are worth having.
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const workflow = load(
  readFileSync(new URL("../../.github/workflows/e2e-screenshots.yml", import.meta.url), "utf8")
);

describe("e2e-screenshots.yml concurrency (#10132)", () => {
  it("shares one group per ref, so at most one run holds a runner", () => {
    const { group } = workflow.concurrency ?? {};
    expect(group).toContain("github.ref");
    expect(group).not.toMatch(/github\.(sha|run_id|run_number)/);
  });

  it("never cancels a run that is already executing", () => {
    // `true` would let a merge burst supersede every run mid-flight, so no
    // run would ever finish and main would get no screenshots result at all.
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  });
});
