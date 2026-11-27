import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_AUDIT_CHECKS } from "../run-repo-audit.mjs";
import { findConflictingIssues, UNVERIFIED_EXIT_CODES } from "../check-ready-label-exclusive.mjs";

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

// #9922: the check reads live GitHub state, and `gh` cannot answer in a CCR
// session (GraphQL blocked) or in CI's Build job (no token). It used to exit 0
// there, so repo-audit printed `PASS` for a gate that never ran.
describe("unreachable GitHub", () => {
  it("exits with the declared unverified code rather than 0", () => {
    const result = spawnSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      // `gh` resolves nowhere, so the query throws ENOENT -- the same path a
      // missing token or a GraphQL-blocked session takes.
      env: { ...process.env, PATH: dirname(process.execPath) },
    });

    expect(result.status).toBe(UNVERIFIED_EXIT_CODES["github-unreachable"]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("UNVERIFIED: check-ready-label-exclusive");
  });
});
