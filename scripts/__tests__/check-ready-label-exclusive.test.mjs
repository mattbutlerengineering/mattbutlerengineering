import { describe, it, expect } from "vitest";

import { REPO_AUDIT_CHECKS } from "../run-repo-audit.mjs";
import { findConflictingIssues } from "../check-ready-label-exclusive.mjs";

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
});
