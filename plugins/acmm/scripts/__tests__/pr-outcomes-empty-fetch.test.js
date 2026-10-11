/**
 * #6311: nightly-compliance's `GITHUB_TOKEN` had no `pull-requests` scope.
 * `gh pr list --search created:>=…` (added in #5859) then answers with an
 * empty list instead of an error — the search results the token can't see
 * are filtered out silently. `measurePrOutcomes` turned that `[]` into an
 * n=0 reading stamped `measured_at: now`, so the report said
 * "agent_pr: fresh (0d old)" while capping the level at L3. Same day, same
 * code, acmm-regression.yml (which has `pull-requests: write`) read n=202.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { measurePrOutcomes } from "../pr-outcomes.js";

const REPO_ROOT = join(import.meta.url.replace("file://", ""), "../../../../..");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github/workflows");

function execFnReturning(prList) {
  return (bin, args) => {
    if (bin === "gh" && args[0] === "pr" && args[1] === "list") return JSON.stringify(prList);
    if (bin === "gh" && args[0] === "pr" && args[1] === "view")
      return JSON.stringify({ commits: [] });
    if (bin === "git" && args.includes("--is-shallow-repository")) return "false\n";
    if (bin === "git" && args[0] === "log") return "";
    throw new Error(`unexpected exec: ${bin} ${args.join(" ")}`);
  };
}

test("measurePrOutcomes: an empty repo-wide PR fetch is no signal (null), not a fresh n=0 reading", () => {
  assert.equal(measurePrOutcomes({ execFn: execFnReturning([]) }), null);
});

test("measurePrOutcomes: a non-empty fetch still yields a reading", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const result = measurePrOutcomes({
    now,
    execFn: execFnReturning([
      {
        number: 6307,
        title: "fix: something",
        url: "https://github.com/o/r/pull/6307",
        headRefName: "worktree-agent-abc",
        state: "MERGED",
        createdAt: "2026-10-10T12:00:00Z",
        mergedAt: "2026-10-10T13:00:00Z",
        labels: [{ name: "agent-authored" }],
        author: { login: "mattbutlerengineering" },
      },
    ]),
  });
  assert.ok(result);
  assert.equal(result.sample_size, 1);
});

test("every workflow that runs the ACMM audit grants the token a pull-requests scope", () => {
  const offenders = readdirSync(WORKFLOWS_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => {
      const body = readFileSync(join(WORKFLOWS_DIR, f), "utf-8");
      if (!body.includes("plugins/acmm/scripts/audit.js")) return false;
      return !/^\s*pull-requests:\s*(read|write)\b/m.test(body);
    });
  assert.deepEqual(offenders, [], "these workflows run audit.js without pull-requests access");
});
