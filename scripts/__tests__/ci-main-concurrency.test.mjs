// #10194: GitHub cancels the PENDING run of a concurrency group when a newer run
// queues, even with `cancel-in-progress: false`. On main every merge shared one
// group, so merge N discarded merge N-1's pending CI run before any job started.
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { evaluateTemplate as evaluate } from "../lib/workflow-expression.mjs";

const ci = load(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"));
const group = (github) => evaluate(ci.concurrency.group, github);
const push = (sha) => ({ workflow: "CI", ref: "refs/heads/main", sha, event_name: "push" });
const pr = (n) => ({
  workflow: "CI",
  ref: `refs/pull/${n}/merge`,
  sha: "x".repeat(40),
  event_name: "pull_request",
});

describe("ci.yml concurrency (#10194)", () => {
  it("a push to main does not share a group with the previous main push", () => {
    expect(group(push("a".repeat(40)))).not.toBe(group(push("b".repeat(40))));
  });

  it("re-runs of the same main SHA still share a group", () => {
    expect(group(push("a".repeat(40)))).toBe(group(push("a".repeat(40))));
  });

  it("a workflow_dispatch on a PR branch groups per ref, not per SHA", () => {
    const dispatch = (sha) => ({
      workflow: "CI",
      ref: "refs/heads/feat/x",
      sha,
      event_name: "workflow_dispatch",
    });
    expect(group(dispatch("a".repeat(40)))).toBe(group(dispatch("b".repeat(40))));
    expect(group(dispatch("a".repeat(40)))).toContain("refs/heads/feat/x");
  });

  it("a workflow_dispatch on main gets a per-SHA group like a push", () => {
    const dispatch = (sha) => ({
      workflow: "CI",
      ref: "refs/heads/main",
      sha,
      event_name: "workflow_dispatch",
    });
    expect(group(dispatch("a".repeat(40)))).not.toBe(group(dispatch("b".repeat(40))));
    expect(group(dispatch("a".repeat(40)))).toBe(group(push("a".repeat(40))));
  });

  it("PR branches keep cancel-in-progress: true and one group per ref", () => {
    const expr = ci.concurrency["cancel-in-progress"];
    expect(evaluate(expr, pr(1))).toBe("true");
    expect(evaluate(expr, push("a".repeat(40)))).toBe("false");
    expect(group(pr(1))).toBe(group({ ...pr(1), sha: "y".repeat(40) }));
    expect(group(pr(1))).not.toBe(group(pr(2)));
  });
});
