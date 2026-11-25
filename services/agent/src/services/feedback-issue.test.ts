import { describe, it, expect, vi, beforeEach } from "vitest";

const { create, createGhClient } = vi.hoisted(() => {
  const createFn = vi.fn();
  return { create: createFn, createGhClient: vi.fn(() => ({ issue: { create: createFn } })) };
});

vi.mock("@mbe/gh-client", () => ({ createGhClient }));

import { createFeedbackIssue, isFeedbackConfigured, FEEDBACK_TOKEN_ENV } from "./feedback-issue.js";

const INPUT = { title: "[Feedback] bug: x", body: "body", labels: ["feedback", "needs-triage"] };

describe("createFeedbackIssue", () => {
  beforeEach(() => {
    create.mockReset();
    createGhClient.mockClear();
  });

  it("forces the REST transport with the dedicated token and returns the number", async () => {
    create.mockReturnValue("https://github.com/o/r/issues/77\n");

    const result = await createFeedbackIssue(INPUT, { [FEEDBACK_TOKEN_ENV]: "tok" });

    expect(result).toEqual({ number: 77, url: "https://github.com/o/r/issues/77" });
    const opts = (createGhClient.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(opts.token).toBe("tok");
    expect((opts.probe as () => boolean)()).toBe(false);
    expect(create).toHaveBeenCalledWith([
      "--title",
      INPUT.title,
      "--body",
      INPUT.body,
      "--label",
      "feedback",
      "--label",
      "needs-triage",
    ]);
  });

  it("refuses without a token and never builds a client", async () => {
    await expect(createFeedbackIssue(INPUT, {})).rejects.toThrow(FEEDBACK_TOKEN_ENV);
    expect(createGhClient).not.toHaveBeenCalled();
  });

  it("rejects an answer that is not an issue URL", async () => {
    create.mockReturnValue("nope");
    await expect(createFeedbackIssue(INPUT, { [FEEDBACK_TOKEN_ENV]: "tok" })).rejects.toThrow();
  });
});

describe("isFeedbackConfigured", () => {
  it("is false for a missing or blank token", () => {
    expect(isFeedbackConfigured({})).toBe(false);
    expect(isFeedbackConfigured({ [FEEDBACK_TOKEN_ENV]: "  " })).toBe(false);
    expect(isFeedbackConfigured({ [FEEDBACK_TOKEN_ENV]: "tok" })).toBe(true);
  });
});
