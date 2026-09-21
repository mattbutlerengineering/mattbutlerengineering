/**
 * A `GITHUB_TOKEN` without pull-request access is not refused when it reads
 * PRs — GitHub filters out what it may not see and answers 200 with an empty
 * list. The job goes green and every consumer concludes there are no pull
 * requests. Declaring any `permissions:` block sets unlisted scopes to
 * `none`, so the omission is one forgotten line and invisible at review.
 *
 * Instances before this check: #5556 (proof strip rendered "0 PRs merged"),
 * #5603/#5606/#5607/#5609/#5610/#5611 (six healthy routines filed as dark —
 * all six `pr-title` signatures, while the lone `issue-label` routine
 * classified correctly because `issues: write` implies read),
 * revert-rca-detection (empty PR body behind an `|| echo ""`), and
 * stale-in-progress (re-queued issues that had a live worker PR).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readsPullRequests,
  stripComments,
  evaluateWorkflowPrScope,
} from "../check-workflow-pr-scope.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const GRANTED = `permissions:\n  contents: read\n  pull-requests: read\n`;
const UNGRANTED = `permissions:\n  contents: read\n  issues: write\n`;

describe("stripComments", () => {
  it("removes a trailing YAML comment without touching the value", () => {
    expect(stripComments("  pull-requests: read # gh pr list\n").trim()).toBe(
      "pull-requests: read"
    );
  });

  it("keeps a # that opens a quoted token, not a comment", () => {
    // stale-in-progress.yml's real command; truncating here would hide it.
    const line = 'gh pr list --repo $REPO --search "#${number}" --limit 10';
    expect(stripComments(line)).toContain("gh pr list");
    expect(stripComments(line)).toContain('"#${number}"');
  });

  it("removes JS line and block comments", () => {
    expect(stripComments("const a = 1; // ghClient.pr.list\n")).not.toContain("pr.list");
    expect(stripComments("/* gh pr view */ const b = 2;")).not.toContain("gh pr view");
  });

  it("leaves a URL's double slash alone", () => {
    expect(stripComments("https://api.github.com/x")).toBe("https://api.github.com/x");
  });
});

describe("readsPullRequests", () => {
  it.each([
    ["gh pr list --state open", true],
    ["gh pr view 12 --json body", true],
    ["ghClient.pr.list([])", true],
    ["GET /search/issues?q=is:pr", true],
    ["gh issue list --label audit", false],
    ["echo hello", false],
  ])("%s -> %s", (source, expected) => {
    expect(readsPullRequests(source)).toBe(expected);
  });

  it("does not count a mention inside a comment as a read", () => {
    expect(readsPullRequests("# gh pr list is what this would use\nexit 0\n")).toBe(false);
  });
});

describe("evaluateWorkflowPrScope", () => {
  it("passes a workflow that reads PRs and grants the scope", () => {
    const source = `${GRANTED}\njobs:\n  a:\n    steps:\n      - run: gh pr list\n`;
    expect(evaluateWorkflowPrScope({ workflows: [{ name: "w.yml", source }] }).findings).toEqual(
      []
    );
  });

  it("flags a workflow that reads PRs without the scope", () => {
    const source = `${UNGRANTED}\njobs:\n  a:\n    steps:\n      - run: gh pr list\n`;
    expect(evaluateWorkflowPrScope({ workflows: [{ name: "w.yml", source }] }).findings).toEqual([
      "w.yml — reads pull requests directly",
    ]);
  });

  it("accepts pull-requests: write as satisfying the read", () => {
    const source = `permissions:\n  pull-requests: write\n\njobs:\n  a:\n    steps:\n      - run: gh pr view 1\n`;
    expect(evaluateWorkflowPrScope({ workflows: [{ name: "w.yml", source }] }).findings).toEqual(
      []
    );
  });

  it("accepts the scope when it carries a trailing comment", () => {
    // The visual-diff-ref-sweep.yml shape: this exact line previously both
    // defeated the scope match and supplied a phantom `gh pr list`.
    const source = `permissions:\n  pull-requests: read # gh pr list — which PRs are open\n\njobs:\n  a:\n    steps:\n      - run: gh pr list\n`;
    expect(evaluateWorkflowPrScope({ workflows: [{ name: "w.yml", source }] }).findings).toEqual(
      []
    );
  });

  it("ignores a workflow with no permissions block (repo default applies)", () => {
    const source = `jobs:\n  a:\n    steps:\n      - run: gh pr list\n`;
    expect(evaluateWorkflowPrScope({ workflows: [{ name: "w.yml", source }] }).findings).toEqual(
      []
    );
  });

  it("follows `node scripts/x.mjs` indirection", () => {
    // routine-liveness.yml's shape: no `gh pr` anywhere in the workflow body.
    const source = `${UNGRANTED}\njobs:\n  a:\n    steps:\n      - run: node scripts/x.mjs\n`;
    const scripts = { "scripts/x.mjs": "ghClient.pr.list([]);" };
    expect(
      evaluateWorkflowPrScope({ workflows: [{ name: "w.yml", source }], scripts }).findings
    ).toEqual(["w.yml — runs scripts/x.mjs, which reads pull requests"]);
  });

  it("does not flag indirection through a script that reads no PRs", () => {
    const source = `${UNGRANTED}\njobs:\n  a:\n    steps:\n      - run: node scripts/x.mjs\n`;
    const scripts = { "scripts/x.mjs": "console.log('hi');" };
    expect(
      evaluateWorkflowPrScope({ workflows: [{ name: "w.yml", source }], scripts }).findings
    ).toEqual([]);
  });
});

describe("the real repository", () => {
  /** Every workflow + every top-level script, as the CLI loads them. */
  function repoInputs() {
    const dir = join(ROOT, ".github/workflows");
    const workflows = readdirSync(dir)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => ({
        name: `.github/workflows/${f}`,
        source: readFileSync(join(dir, f), "utf-8"),
      }));
    const scriptsDir = join(ROOT, "scripts");
    const scripts = Object.fromEntries(
      readdirSync(scriptsDir)
        .filter((f) => f.endsWith(".mjs") || f.endsWith(".js"))
        .map((f) => [`scripts/${f}`, readFileSync(join(scriptsDir, f), "utf-8")])
    );
    return { workflows, scripts };
  }

  it("has no workflow reading pull requests without the scope", () => {
    expect(evaluateWorkflowPrScope(repoInputs()).findings).toEqual([]);
  });

  it.each(["routine-liveness", "revert-rca-detection", "stale-in-progress"])(
    "%s.yml grants pull-requests read",
    (name) => {
      const source = readFileSync(join(ROOT, `.github/workflows/${name}.yml`), "utf-8");
      expect(stripComments(source)).toMatch(/^\s*pull-requests:\s*read\s*$/m);
    }
  );
});
