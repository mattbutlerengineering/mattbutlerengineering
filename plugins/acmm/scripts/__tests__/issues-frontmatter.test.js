/**
 * Tests that ACMM-generated issue bodies include agent frontmatter (#2029).
 *
 * Gap/regression issues default to haiku tier since they are typically small,
 * file-presence tasks that don't require complex reasoning.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildIssueBody } from "../outputs/issues.js";

const minimalCriterion = {
  id: "acmm:test-criterion",
  name: "Test criterion",
  description: "A criterion for testing.",
  rationale: "It matters.",
  level: 3,
  source: "ACMM",
  category: "process",
  detection: { type: "path", pattern: "some/path" },
};

describe("buildIssueBody: agent frontmatter emission", () => {
  test("issue body contains a yaml agent block", () => {
    const body = buildIssueBody(minimalCriterion);
    assert.ok(body.includes("```yaml agent"), "issue body must contain a fenced yaml agent block");
  });

  test("yaml agent block specifies model: haiku", () => {
    const body = buildIssueBody(minimalCriterion);
    assert.ok(body.includes("model: haiku"), "haiku tier must be specified for ACMM gap issues");
  });

  test("yaml agent block specifies a budget", () => {
    const body = buildIssueBody(minimalCriterion);
    assert.ok(body.match(/budget:\s+[\d.]+/), "budget field must be present in the agent block");
  });

  test("yaml agent block closes properly", () => {
    const body = buildIssueBody(minimalCriterion);
    const openIdx = body.indexOf("```yaml agent");
    const closeIdx = body.indexOf("```", openIdx + 1);
    assert.ok(openIdx !== -1 && closeIdx !== -1, "agent block must be properly closed");
    // The block content must contain the model line
    const blockContent = body.slice(openIdx, closeIdx);
    assert.ok(blockContent.includes("model: haiku"), "block content must include model: haiku");
  });

  test("issue body still contains the criterion description and rationale", () => {
    const body = buildIssueBody(minimalCriterion);
    assert.ok(body.includes("A criterion for testing."), "description must still be present");
    assert.ok(body.includes("It matters."), "rationale must still be present");
  });

  test("criterion with implementation details includes them in the body", () => {
    const criterionWithDetails = {
      ...minimalCriterion,
      details: "Create the file at docs/runbook.md",
    };
    const body = buildIssueBody(criterionWithDetails);
    assert.ok(
      body.includes("Create the file at docs/runbook.md"),
      "details must be included when present"
    );
  });
});
