import { describe, it, expect } from "vitest";
import { classifyHumanTouch } from "../classify-human-touch.mjs";
import { HUMAN_TOUCH_REASONS } from "../collect-queue-telemetry.mjs";

// ── Helpers ──────────────────────────────────────────────

function agentPr(overrides = {}) {
  return {
    headRefName: "agent-fix-login",
    labels: [],
    ...overrides,
  };
}

function humanPr(overrides = {}) {
  return {
    headRefName: "feat/manual-thing",
    labels: ["feature"],
    ...overrides,
  };
}

// ── One test per taxonomy branch ────────────────────────

describe("classifyHumanTouch: taxonomy branches", () => {
  it("classifies merge-conflict when the commit message carries conflict markers", () => {
    const commit = {
      message: "Resolve merge conflict\n\n<<<<<<< HEAD\nfoo\n=======\nbar\n>>>>>>> feature",
    };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("merge-conflict");
  });

  it("classifies merge-conflict when the message mentions conflict resolution without markers", () => {
    const commit = { message: "fix merge conflicts after rebase" };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("merge-conflict");
  });

  it("classifies ci-failure when CI conclusion at commit time was failure", () => {
    const commit = { message: "retry flaky step", ciConclusion: "failure" };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("ci-failure");
  });

  it("classifies review-fix when review comments existed before the commit", () => {
    const commit = { message: "address feedback", reviewCommentsBefore: 2 };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("review-fix");
  });

  it("classifies scope-change when the message uses scope-change language", () => {
    const commit = { message: "descope: drop the CSV export for now" };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("scope-change");
  });

  it("classifies other when no pattern matches on an agent PR", () => {
    const commit = { message: "tidy up variable names", ciConclusion: "success" };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("other");
  });

  it("classifies other when the PR is not an agent PR (reuses isAgentPr)", () => {
    const commit = { message: "fix merge conflicts", ciConclusion: "failure" };
    expect(classifyHumanTouch(humanPr(), commit)).toBe("other");
  });

  it("every branch above returns a value from the shared HUMAN_TOUCH_REASONS taxonomy", () => {
    const results = [
      classifyHumanTouch(agentPr(), {
        message: "<<<<<<< HEAD\n=======\n>>>>>>> x",
      }),
      classifyHumanTouch(agentPr(), { ciConclusion: "failure" }),
      classifyHumanTouch(agentPr(), { reviewCommentsBefore: 1 }),
      classifyHumanTouch(agentPr(), { message: "reduce scope of this PR" }),
      classifyHumanTouch(agentPr(), {}),
    ];
    for (const reason of results) {
      expect(HUMAN_TOUCH_REASONS).toContain(reason);
    }
  });
});

// ── Precedence ───────────────────────────────────────────

describe("classifyHumanTouch: precedence", () => {
  it("prefers merge-conflict over ci-failure when both signals are present", () => {
    const commit = {
      message: "<<<<<<< HEAD\n=======\n>>>>>>> x",
      ciConclusion: "failure",
    };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("merge-conflict");
  });

  it("prefers ci-failure over review-fix when both signals are present", () => {
    const commit = { ciConclusion: "failure", reviewCommentsBefore: 3 };
    expect(classifyHumanTouch(agentPr(), commit)).toBe("ci-failure");
  });
});

// ── Never throws: adversarial input ─────────────────────

describe("classifyHumanTouch: never throws", () => {
  const badPrs = [null, undefined, {}, [], "not-a-pr", 42, true];
  const badCommits = [null, undefined, {}, [], "not-a-commit", 42, true];

  for (const badPr of badPrs) {
    it(`falls back to other for malformed pr: ${JSON.stringify(badPr)}`, () => {
      expect(() => classifyHumanTouch(badPr, { message: "x" })).not.toThrow();
      expect(classifyHumanTouch(badPr, { message: "x" })).toBe("other");
    });
  }

  for (const badCommit of badCommits) {
    it(`falls back to other for malformed commit on an agent PR: ${JSON.stringify(badCommit)}`, () => {
      expect(() => classifyHumanTouch(agentPr(), badCommit)).not.toThrow();
      expect(classifyHumanTouch(agentPr(), badCommit)).toBe("other");
    });
  }

  it("never throws when both pr and commit are malformed together", () => {
    expect(() => classifyHumanTouch(null, null)).not.toThrow();
    expect(classifyHumanTouch(null, null)).toBe("other");
    expect(() => classifyHumanTouch(undefined, undefined)).not.toThrow();
    expect(classifyHumanTouch(undefined, undefined)).toBe("other");
  });

  it("never throws when called with zero arguments", () => {
    expect(() => classifyHumanTouch()).not.toThrow();
    expect(classifyHumanTouch()).toBe("other");
  });

  it("never throws when pr.labels is malformed (not an array) — hardens the reused isAgentPr call", () => {
    const weirdPr = { headRefName: "agent-x", labels: 123 };
    expect(() => classifyHumanTouch(weirdPr, { message: "x" })).not.toThrow();
    expect(classifyHumanTouch(weirdPr, { message: "x" })).toBe("other");
  });

  it("never throws when pr.headRefName is malformed (not a string)", () => {
    const weirdPr = { headRefName: { nested: true }, labels: [] };
    expect(() => classifyHumanTouch(weirdPr, { message: "x" })).not.toThrow();
    expect(classifyHumanTouch(weirdPr, { message: "x" })).toBe("other");
  });

  it("never throws with a deeply-nested-null commit shape", () => {
    const commit = { message: null, ciConclusion: null, reviewCommentsBefore: null };
    expect(() => classifyHumanTouch(agentPr(), commit)).not.toThrow();
    expect(classifyHumanTouch(agentPr(), commit)).toBe("other");
  });
});
