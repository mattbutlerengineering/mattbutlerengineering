/**
 * Table test for the one canonical agent-PR predicate (#6380).
 *
 * Pins the agreed answer for each of the five rule shapes that used to live in
 * collect-queue-efficiency, collect-queue-telemetry-from-github, acmm
 * pr-outcomes, ai-audit.yml's inline jq, and collect-repo-stats' search query.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isAgentPr, AGENT_LABEL } from "../lib/agent-pr.mjs";
import { isAgentPr as pluginIsAgentPr } from "../../plugins/acmm/scripts/pr-outcomes.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** [name, pr, expected] */
const TABLE = [
  [
    "agent-authored label, human-looking branch",
    { headRefName: "feat/x", labels: ["agent-authored"] },
    true,
  ],
  [
    "agent-authored label as {name} object",
    { headRefName: "feat/x", labels: [{ name: "agent-authored" }] },
    true,
  ],
  ["worktree-agent- prefix, no label", { headRefName: "worktree-agent-abc", labels: [] }, true],
  ["agent- prefix", { headRefName: "agent-fix-login", labels: [] }, true],
  ["fix/agent- prefix", { headRefName: "fix/agent-cleanup", labels: [] }, true],
  ["feat/agent- prefix", { headRefName: "feat/agent-search", labels: [] }, true],
  [
    "has-pr alone does not count (#5852)",
    { headRefName: "fix/issue-5807-x", labels: ["has-pr"] },
    false,
  ],
  [
    "has-pr as {name} alone does not count",
    { headRefName: "fix/x", labels: [{ name: "has-pr" }] },
    false,
  ],
  ["human PR", { headRefName: "feat/manual-thing", labels: ["feature"] }, false],
  ["no labels, null branch", { headRefName: null, labels: [] }, false],
  ["missing fields", {}, false],
  [
    "bookkeeping branch metrics/ with agent label",
    { headRefName: "metrics/pr-1", labels: ["agent-authored"] },
    false,
  ],
  [
    "bookkeeping branch chore/acmm-",
    { headRefName: "chore/acmm-daily-audit-1", labels: ["agent-authored"] },
    false,
  ],
  [
    "bookkeeping branch chore/queue-telemetry-",
    { headRefName: "chore/queue-telemetry-9", labels: ["agent-authored"] },
    false,
  ],
  [
    "bookkeeping branch automation/",
    { headRefName: "automation/drift", labels: ["agent-authored"] },
    false,
  ],
  [
    "bookkeeping branch dependabot/",
    { headRefName: "dependabot/npm/x", labels: ["agent-authored"] },
    false,
  ],
  [
    "bookkeeping author string",
    { headRefName: "feat/x", labels: ["agent-authored"], author: "dependabot[bot]" },
    false,
  ],
  [
    "bookkeeping author {login} app/ form",
    { headRefName: "feat/x", labels: ["agent-authored"], author: { login: "app/github-actions" } },
    false,
  ],
  [
    "app/claude author is NOT bookkeeping",
    { headRefName: "feat/x", labels: ["agent-authored"], author: { login: "app/claude" } },
    true,
  ],
  ["malformed labels", { headRefName: "feat/x", labels: "agent-authored" }, false],
];

describe("isAgentPr (canonical)", () => {
  it("exports the label constant", () => {
    expect(AGENT_LABEL).toBe("agent-authored");
  });
  it.each(TABLE)("%s", (_name, pr, expected) => {
    expect(isAgentPr(pr)).toBe(expected);
  });
});

describe("acmm plugin vendored copy parity", () => {
  // plugins/acmm is self-contained and may not import scripts/, so it carries
  // its own copy of the rule. This fails if the two ever diverge.
  it.each(TABLE)("%s", (_name, pr, expected) => {
    const normalized = {
      ...pr,
      labels: Array.isArray(pr.labels)
        ? pr.labels.map((l) => (typeof l === "string" ? l : l.name))
        : pr.labels,
      author: typeof pr.author === "object" && pr.author ? pr.author.login : pr.author,
    };
    expect(pluginIsAgentPr(normalized)).toBe(expected);
  });
});

describe("agent-pr-filter CLI", () => {
  it("keeps only agent PRs from a JSON array on stdin", () => {
    const rows = TABLE.filter(([, pr]) => Array.isArray(pr.labels));
    const input = JSON.stringify(rows.map(([, pr], i) => ({ number: i, ...pr })));
    const out = execFileSync("node", [join(HERE, "../agent-pr-filter.mjs")], {
      input,
      encoding: "utf8",
    });
    expect(JSON.parse(out)).toHaveLength(rows.filter(([, , e]) => e).length);
  });
});
