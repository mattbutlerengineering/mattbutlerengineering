/**
 * An issue the Owner closed as "not planned" is a veto: the ACMM audit must
 * classify it as "vetoed" so fileIssue() never reopens it (#6424/#6427/#6428).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { classifyIssueState } from "../outputs/issues.js";

describe("classifyIssueState", () => {
  test("CLOSED + NOT_PLANNED is vetoed (case-insensitive)", () => {
    assert.equal(classifyIssueState("CLOSED", "NOT_PLANNED"), "vetoed");
    assert.equal(classifyIssueState("closed", "not_planned"), "vetoed");
  });

  test("CLOSED with any other reason is closed", () => {
    assert.equal(classifyIssueState("CLOSED", "COMPLETED"), "closed");
    assert.equal(classifyIssueState("CLOSED", ""), "closed");
    assert.equal(classifyIssueState("CLOSED", undefined), "closed");
  });

  test("OPEN is open, even with a stale not-planned reason", () => {
    assert.equal(classifyIssueState("OPEN", "NOT_PLANNED"), "open");
  });

  test("unknown state is error", () => {
    assert.equal(classifyIssueState("WAT", ""), "error");
  });
});
