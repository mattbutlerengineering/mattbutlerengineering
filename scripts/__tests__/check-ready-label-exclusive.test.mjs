import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_AUDIT_CHECKS } from "../run-repo-audit.mjs";
import {
  findConflictingIssues,
  readyIssuesFromRestPages,
  READY_ISSUES_GH_ARGS,
  READY_ISSUES_REST_PATH,
  UNVERIFIED_EXIT_CODES,
} from "../check-ready-label-exclusive.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "check-ready-label-exclusive.mjs"
);

const issue = (number, labels, state = "OPEN") => ({
  number,
  title: `t${number}`,
  state,
  labels: labels.map((name) => ({ name })),
});

describe("findConflictingIssues", () => {
  it("reports an open issue carrying both labels", () => {
    const { findings } = findConflictingIssues([issue(1, ["ready", "ready-for-human"])]);
    expect(findings).toEqual(["#1 t1"]);
  });

  it("reports an open issue carrying ready and needs-human (#9884)", () => {
    const { findings } = findConflictingIssues([issue(9, ["ready", "needs-human"])]);
    expect(findings).toEqual(["#9 t9"]);
  });

  it("passes issues carrying either label alone", () => {
    const { findings } = findConflictingIssues([
      issue(1, ["ready"]),
      issue(2, ["ready-for-human"]),
      issue(3, []),
    ]);
    expect(findings).toEqual([]);
  });

  it("ignores closed issues and accepts string labels", () => {
    const closed = issue(4, ["ready", "ready-for-human"], "CLOSED");
    const strings = { number: 5, state: "open", labels: ["ready", "ready-for-human"] };
    expect(findConflictingIssues([closed, strings]).findings).toEqual(["#5"]);
  });
});

describe("wiring", () => {
  it("runs inside repo-audit", () => {
    expect(REPO_AUDIT_CHECKS.map((c) => c.name)).toContain("check-ready-label-exclusive");
  });

  it("declares its unverified exit code to the audit runner (#9922)", () => {
    const check = REPO_AUDIT_CHECKS.find((c) => c.name === "check-ready-label-exclusive");

    expect(check.unverified?.[UNVERIFIED_EXIT_CODES["github-unreachable"]]).toBeTruthy();
  });
});

/**
 * The gate reads GitHub over REST. `gh issue list` is GraphQL-backed and
 * GitHub GraphQL answers `403` from a Claude Code session, so the gate could
 * only ever resolve on a developer machine or in CI's Build job -- never in
 * the cloud routines that decide what the `ready` queue hands to an agent.
 */
describe("ready-issue reader", () => {
  it("queries the REST issues endpoint, not a GraphQL-backed gh subcommand", () => {
    expect(READY_ISSUES_GH_ARGS[0]).toBe("api");
    expect(READY_ISSUES_GH_ARGS).not.toContain("issue");
    expect(READY_ISSUES_REST_PATH).toMatch(/^repos\/\{owner\}\/\{repo\}\/issues\?/);
    expect(READY_ISSUES_REST_PATH).toContain("state=open");
    expect(READY_ISSUES_REST_PATH).toContain("labels=ready");
  });

  it("pages, so a queue longer than one page is still fully read", () => {
    expect(READY_ISSUES_GH_ARGS).toContain("--paginate");
    expect(READY_ISSUES_GH_ARGS).toContain("--slurp");
  });
});

describe("readyIssuesFromRestPages", () => {
  it("flattens the pages `gh api --paginate --slurp` returns", () => {
    const pages = [[issue(1, ["ready"]), issue(2, ["ready"])], [issue(3, ["ready"])]];

    expect(readyIssuesFromRestPages(pages).map((i) => i.number)).toEqual([1, 2, 3]);
  });

  it("drops pull requests, which the REST issues endpoint returns as issues", () => {
    const pr = { ...issue(4, ["ready", "ready-for-human"]), pull_request: { url: "u" } };
    const pages = [[issue(5, ["ready"]), pr]];

    expect(readyIssuesFromRestPages(pages).map((i) => i.number)).toEqual([5]);
    expect(findConflictingIssues(readyIssuesFromRestPages(pages)).findings).toEqual([]);
  });

  it("accepts an already-flat response and an empty one", () => {
    expect(readyIssuesFromRestPages([issue(6, ["ready"])]).map((i) => i.number)).toEqual([6]);
    expect(readyIssuesFromRestPages([])).toEqual([]);
  });
});

// #9922: the check reads live GitHub state, and `gh` cannot always answer --
// offline, or with no token in the environment. It used to exit 0 there, so
// repo-audit printed `PASS` for a gate that never ran.
describe("unreachable GitHub", () => {
  it("exits with the declared unverified code rather than 0", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      // `gh` resolves nowhere, so the query throws ENOENT -- the same path a
      // missing token or an offline runner takes.
      env: { ...process.env, PATH: dirname(process.execPath) },
    });

    expect(result.status).toBe(UNVERIFIED_EXIT_CODES["github-unreachable"]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("UNVERIFIED: check-ready-label-exclusive");
  });
});
