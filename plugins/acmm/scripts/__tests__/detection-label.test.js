/**
 * Check-type criteria detect via a check() function, not a file pattern —
 * issue bodies and the report must not print the pattern as "any of" (#5858).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildIssueBody } from "../outputs/issues.js";
import { checkDetectionLabel } from "../outputs/detection-label.js";

function checkBranchProtectionDoc() {
  return { passed: true };
}

const checkCriterion = {
  id: "fullsend:branch-protection-doc",
  name: "Branch protection documentation",
  description: "Documented rules.",
  rationale: "Fence.",
  level: 3,
  source: "fullsend",
  category: "governance",
  detection: { type: "check", pattern: "docs/governance.md" },
  check: checkBranchProtectionDoc,
};

describe("check-type detection rendering", () => {
  test("checkDetectionLabel names the check function", () => {
    assert.equal(checkDetectionLabel(checkCriterion), "check() — checkBranchProtectionDoc");
  });

  test("issue body renders check() instead of 'any of' for check criteria", () => {
    const body = buildIssueBody(checkCriterion);
    assert.ok(body.includes("**Detection:** check() — checkBranchProtectionDoc"));
    assert.ok(!body.includes("any of"));
  });

  test("issue body keeps 'any of' for path criteria", () => {
    const body = buildIssueBody({
      ...checkCriterion,
      detection: { type: "path", pattern: ["a", "b"] },
      check: undefined,
    });
    assert.ok(body.includes("**Detection:** any of:"));
  });
});
