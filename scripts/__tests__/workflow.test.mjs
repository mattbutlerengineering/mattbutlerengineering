import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORKFLOWS_DIR,
  getJob,
  getStep,
  jobEnvNames,
  jobRunText,
  listWorkflowFiles,
  loadWorkflow,
  parseWorkflow,
} from "../lib/workflow.mjs";

describe("parseWorkflow", () => {
  it("normalizes block-style triggers into an event map", () => {
    const wf = parseWorkflow(
      "on:\n  push:\n    branches: [main]\n  workflow_dispatch:\njobs: {}\n"
    );
    expect(Object.keys(wf.on)).toEqual(["push", "workflow_dispatch"]);
    expect(wf.on.push.branches).toEqual(["main"]);
    expect(wf.on.workflow_dispatch).toEqual({});
  });

  it("normalizes scalar and flow-list triggers", () => {
    expect(Object.keys(parseWorkflow("on: push\njobs: {}\n").on)).toEqual(["push"]);
    expect(Object.keys(parseWorkflow("on: [push, pull_request]\njobs: {}\n").on)).toEqual([
      "push",
      "pull_request",
    ]);
  });

  it("normalizes needs in scalar, flow, and block forms to arrays", () => {
    const text = [
      "on: push",
      "jobs:",
      "  a: { runs-on: x }",
      "  b: { needs: a }",
      "  c: { needs: [a, b] }",
      "  d:",
      "    needs:",
      "      - a",
      "      - c",
    ].join("\n");
    const { jobs } = parseWorkflow(text);
    expect(jobs.a.needs).toEqual([]);
    expect(jobs.b.needs).toEqual(["a"]);
    expect(jobs.c.needs).toEqual(["a", "b"]);
    expect(jobs.d.needs).toEqual(["a", "c"]);
  });

  it("exposes steps with defaults and job-level fields", () => {
    const text = [
      "on: push",
      "jobs:",
      "  a:",
      "    if: always()",
      "    env: { K: v }",
      "    permissions: { contents: read }",
      "    steps:",
      "      - name: One",
      "        run: echo hi",
      "      - uses: actions/checkout@v4",
    ].join("\n");
    const job = getJob(parseWorkflow(text), "a");
    expect(job.if).toBe("always()");
    expect(job.env).toEqual({ K: "v" });
    expect(job.permissions).toEqual({ contents: "read" });
    expect(job.steps).toHaveLength(2);
    expect(getStep(job, "One").run).toBe("echo hi");
    expect(getStep(job, "missing")).toBeNull();
    expect(job.steps[1].run).toBeNull();
  });

  it("does not read paths: inside an embedded run script as a trigger filter", () => {
    const text =
      "on:\n  push: {}\njobs:\n  a:\n    steps:\n      - run: |\n          paths:\n            - x\n";
    expect(parseWorkflow(text).on.push).toEqual({});
  });

  it("returns null for an unknown job and throws on non-mapping input", () => {
    expect(getJob(parseWorkflow("on: push\njobs: {}\n"), "nope")).toBeNull();
    expect(() => parseWorkflow("- just\n- a list\n")).toThrow(/mapping/);
  });
});

describe("job text helpers", () => {
  const job = getJob(
    parseWorkflow(
      [
        "on: push",
        "jobs:",
        "  a:",
        "    env: { J: '1' }",
        "    steps:",
        "      - run: echo one",
        "      - uses: x/y@v1",
        "        env: { S: '2' }",
        "      - run: echo two",
      ].join("\n")
    ),
    "a"
  );

  it("jobRunText joins only the run scripts", () => {
    expect(jobRunText(job)).toBe("echo one\necho two");
  });

  it("jobEnvNames lists job-level and step-level env names", () => {
    expect(jobEnvNames(job)).toEqual(["J", "S"]);
  });
});

describe("every committed workflow", () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));

  it("listWorkflowFiles enumerates them", () => {
    expect(listWorkflowFiles()).toEqual([...files].sort());
  });

  it.each(files)("%s parses with resolvable needs", (file) => {
    const wf = loadWorkflow(join(WORKFLOWS_DIR, file));
    expect(Object.keys(wf.on).length).toBeGreaterThan(0);
    for (const [id, job] of Object.entries(wf.jobs)) {
      for (const dep of job.needs) {
        expect(Object.keys(wf.jobs), `${file}: ${id} needs ${dep}`).toContain(dep);
      }
    }
  });

  it("loadWorkflow accepts a bare file name", () => {
    expect(Object.keys(loadWorkflow("ci.yml").jobs)).toContain("ci-gate");
  });
});
