/**
 * Structural guard for .github/workflows/swarm.yml and the ten `mbe-swarm-NN`
 * RemoteTrigger lanes it fires (docs/routines/mbe-swarm.md).
 *
 * The workflow is the only thing standing between "a human labeled an issue
 * `swarm`" and ten cloud sessions starting. Three things can rot silently:
 * the lane -> routine-id map drifting from the prompt file (a lane fires the
 * wrong routine, or a recreated routine is never fired), a token gate that
 * reads as green when no secret is configured (the docs-audit/claude.yml
 * keyless-skip lesson, #3585), and a `run:` block whose exit code is the point
 * but that pipes into something (gotchas § CI, `pipefail`). Each is pinned
 * here against the parsed workflow (scripts/lib/workflow.mjs), with the one
 * untrusted-interpolation scan kept as a raw-text check.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { getJob, getStep, jobRunText, loadWorkflow } from "../lib/workflow.mjs";
import { ROUTINE_MANIFEST } from "../routine-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RAW = readFileSync(resolve(ROOT, ".github/workflows/swarm.yml"), "utf8");
const PARSED = loadWorkflow("swarm.yml");
const RAW_DOC = loadYaml(RAW);
const PROMPT_FILE = readFileSync(resolve(ROOT, "docs/routines/mbe-swarm.md"), "utf8");

const LANES = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));
const TRIGGER_ID = /^trig_[A-Za-z0-9]{20,}$/;

function jobOf(name) {
  const job = getJob(PARSED, name);
  expect(job, `swarm.yml declares a \`${name}\` job`).not.toBeNull();
  return job;
}

function stepOf(job, stepName) {
  const step = getStep(job, stepName);
  expect(step, `step \`${stepName}\` exists`).not.toBeNull();
  return step;
}

const matrix = RAW_DOC.jobs.fire.strategy.matrix.include;

describe("swarm.yml fires only on the `swarm` label or a manual dispatch", () => {
  it("listens to issues.labeled and a workflow_dispatch with a required issue input", () => {
    expect(Object.keys(PARSED.on)).toEqual(expect.arrayContaining(["issues", "workflow_dispatch"]));
    expect(RAW_DOC.on.issues.types).toEqual(["labeled"]);
    expect(RAW_DOC.on.workflow_dispatch.inputs.issue.required).toBe(true);
  });

  it("gates both jobs on the label name so other label events fire nothing", () => {
    expect(jobOf("fire").if).toContain("github.event.label.name == 'swarm'");
    const report = jobOf("report");
    expect(report.if).toContain("always()");
    expect(report.if).toContain("github.event.label.name == 'swarm'");
    expect(report.needs).toEqual(["fire"]);
  });

  it("asks for nothing beyond issues: write", () => {
    expect(PARSED.permissions).toEqual({ issues: "write" });
  });
});

describe("the lane matrix matches the prompt file, one routine per lane", () => {
  it("has exactly ten lanes numbered 01..10", () => {
    expect(matrix.map((m) => m.lane)).toEqual(LANES);
  });

  it("maps every lane to a distinct trig_ id", () => {
    const ids = matrix.map((m) => m.routine);
    for (const id of ids) expect(id).toMatch(TRIGGER_ID);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("agrees with docs/routines/mbe-swarm.md on every id, in both directions", () => {
    const fm = /^---\n([\s\S]*?)\n---/.exec(PROMPT_FILE)?.[1] ?? "";
    const declared =
      /^trigger_ids:\s*(.+)$/m
        .exec(fm)?.[1]
        .split(",")
        .map((s) => s.trim()) ?? [];
    expect(declared).toEqual(matrix.map((m) => m.routine));
    for (const { lane, routine } of matrix) {
      expect(PROMPT_FILE).toContain(`| ${lane}   | \`${routine}\``);
    }
  });

  it("stands for the pack in ROUTINE_MANIFEST as an on-demand, out-of-scope entry under lane 01's id", () => {
    const entry = ROUTINE_MANIFEST.find((e) => e.name === "mbe-swarm");
    expect(entry).toBeDefined();
    expect(entry.triggerId).toBe(matrix[0].routine);
    expect(entry.outOfScope).toBe(true);
    expect(entry.outOfScopeReason).toMatch(/on-demand|on demand/i);
    expect(entry.outOfScopeReason).toContain("swarm.yml");
  });
});

describe("each lane fires through its own per-routine token and never a shared key", () => {
  const fire = jobOf("fire");

  it("reads the token from SWARM_FIRE_TOKEN_<lane> and nothing named ANTHROPIC_API_KEY", () => {
    expect(fire.env.ROUTINE_FIRE_TOKEN).toBe(
      "${{ secrets[format('SWARM_FIRE_TOKEN_{0}', matrix.lane)] }}"
    );
    expect(RAW).not.toContain("ANTHROPIC_API_KEY");
  });

  it("skips the fire step, visibly, when the token is unset", () => {
    expect(stepOf(fire, "Report unconfigured lane").if).toBe("env.ROUTINE_FIRE_TOKEN == ''");
    expect(stepOf(fire, "Fire lane").if).toBe("env.ROUTINE_FIRE_TOKEN != ''");
    expect(stepOf(fire, "Report unconfigured lane").run).toContain("GITHUB_STEP_SUMMARY");
  });

  it("POSTs the documented /fire endpoint with the required headers and fails on a non-200", () => {
    const run = stepOf(fire, "Fire lane").run;
    expect(run).toContain("set -euo pipefail");
    expect(run).toContain("https://api.anthropic.com/v1/claude_code/routines/${ROUTINE_ID}/fire");
    expect(run).toContain('-H "Authorization: Bearer ${ROUTINE_FIRE_TOKEN}"');
    expect(run).toContain('-H "anthropic-version: 2023-06-01"');
    expect(run).toContain('if [ "$http_code" != "200" ]; then');
    expect(run).toContain("exit 1");
  });

  it("sends `swarm #<N> lane <LL>: <title>` as the fire text, built by jq from env", () => {
    const run = stepOf(fire, "Fire lane").run;
    expect(run).toContain(
      "jq -cn --arg t \"swarm #${ISSUE_NUMBER} lane ${LANE}: ${title}\" '{text: $t}'"
    );
    expect(PROMPT_FILE).toContain("`swarm #<N> lane <LL>: <title>`");
  });

  it("never inlines untrusted issue text into a shell line", () => {
    expect(RAW).not.toMatch(/\$\{\{\s*github\.event\.issue\.(title|body)/);
    expect(RAW).not.toMatch(/\$\{\{\s*github\.event\.comment/);
  });
});

describe("the report job turns the fire into one honest issue comment", () => {
  const report = jobOf("report");
  const run = jobRunText(report);

  it("counts `Fire lane` step conclusions from the run's own jobs API", () => {
    expect(run).toContain("set -euo pipefail");
    expect(run).toContain("actions/runs/${GITHUB_RUN_ID}/jobs");
    expect(run).toContain('select(.name == "Fire lane" and .conclusion == $c)');
    for (const outcome of ["success", "failure", "skipped"]) {
      expect(run).toContain(`$(count ${outcome})`);
    }
  });

  it("posts exactly one comment on the swarmed issue, naming the no-lane case", () => {
    expect(run.match(/issues\/\$\{ISSUE_NUMBER\}\/comments/g)).toHaveLength(1);
    expect(run).toContain("swarm: no lane fired");
    expect(run).toContain("swarm: fired ${fired}/10 lanes");
  });
});

describe("docs/routines/mbe-swarm.md documents the conventions the lanes emit", () => {
  const fence = /```text\n([\s\S]*?)\n```/.exec(PROMPT_FILE);
  const prompt = fence ? fence[1] : "";

  it("carries a fenced text prompt that names the workflow, the PR suffix and the report line", () => {
    expect(prompt).not.toBe("");
    expect(prompt).toContain(".github/workflows/swarm.yml");
    expect(prompt).toContain("(mbe-swarm-<LL> #<N>)");
    expect(prompt).toContain("swarm: mbe-swarm-<LL> <ok|noop|error>");
    expect(prompt).toContain("claimed by mbe-swarm-<LL>");
  });

  it("tells a lane with no payload to do nothing", () => {
    expect(prompt).toContain("noop: no swarm target");
  });
});
