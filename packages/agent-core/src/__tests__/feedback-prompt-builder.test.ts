import { describe, it, expect } from "vitest";
import { buildReviewFixPrompt } from "../feedback-prompt-builder.js";
import type { FeedbackContext } from "../pr-feedback-poller.js";

describe("buildReviewFixPrompt", () => {
  it("builds prompt with review comments", () => {
    const context: FeedbackContext = {
      prNumber: 42,
      reviewComments: [
        {
          threadId: "t1",
          author: "reviewer1",
          body: "This function should handle null input",
          path: "src/utils.ts",
          line: 15,
        },
      ],
      ciFailures: [],
      reviewDecision: "CHANGES_REQUESTED",
    };

    const prompt = buildReviewFixPrompt(context);

    expect(prompt).toContain("Review Comments");
    expect(prompt).toContain("src/utils.ts:15");
    expect(prompt).toContain("@reviewer1");
    expect(prompt).toContain("handle null input");
  });

  it("builds prompt with CI failures", () => {
    const context: FeedbackContext = {
      prNumber: 42,
      reviewComments: [],
      ciFailures: [
        {
          checkName: "test-suite",
          conclusion: "failure",
          logSnippet: "FAIL src/utils.test.ts\nExpected: true\nReceived: false",
        },
      ],
      reviewDecision: "PENDING",
    };

    const prompt = buildReviewFixPrompt(context);

    expect(prompt).toContain("CI Failures");
    expect(prompt).toContain("test-suite");
    expect(prompt).toContain("Expected: true");
  });

  it("builds prompt with both review and CI feedback", () => {
    const context: FeedbackContext = {
      prNumber: 42,
      reviewComments: [
        {
          threadId: "t1",
          author: "reviewer1",
          body: "Fix the types",
          path: "src/types.ts",
          line: null,
        },
      ],
      ciFailures: [
        {
          checkName: "lint",
          conclusion: "failure",
          logSnippet: "error: unused variable",
        },
      ],
      reviewDecision: "CHANGES_REQUESTED",
    };

    const prompt = buildReviewFixPrompt(context);

    expect(prompt).toContain("Review Comments");
    expect(prompt).toContain("CI Failures");
    expect(prompt).toContain("Do NOT create a new PR");
  });

  it("handles general comments without file path", () => {
    const context: FeedbackContext = {
      prNumber: 42,
      reviewComments: [
        {
          threadId: "t1",
          author: "reviewer1",
          body: "Overall approach looks wrong",
          path: null,
          line: null,
        },
      ],
      ciFailures: [],
      reviewDecision: "CHANGES_REQUESTED",
    };

    const prompt = buildReviewFixPrompt(context);

    expect(prompt).toContain("General comment");
    expect(prompt).toContain("Overall approach looks wrong");
  });
});
