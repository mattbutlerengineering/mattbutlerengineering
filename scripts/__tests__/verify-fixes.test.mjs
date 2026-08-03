import { describe, it, expect } from "vitest";
import { verifyIssue, shouldActOnResult } from "../verify-fixes.mjs";

const issueWith = (...labels) => ({
  number: 1,
  title: "Test issue",
  body: "",
  labels: labels.map((name) => ({ name })),
});

// ---------------------------------------------------------------------------
// Unhandled labels must abstain, not act.
//
// verifyIssue's fall-through used to omit `confidence`, and the caller gated
// its side effects on `result.confidence !== "skip"` — so `undefined !==
// "skip"` read as "act". An issue carrying a label no verifier handles (today:
// `meta-improvement`, which the registry stamps but verifyIssue has no branch
// for) was commented on and reopened purely because nothing could check it.
// ---------------------------------------------------------------------------

describe("verifyIssue — unhandled labels", () => {
  it("abstains with confidence: skip when no verifier matches", () => {
    const result = verifyIssue(issueWith("meta-improvement"));

    expect(result.confidence).toBe("skip");
    expect(result.verified).toBe(false);
  });

  it("abstains for an issue with no labels at all", () => {
    expect(verifyIssue({ number: 2, title: "t", body: "" }).confidence).toBe("skip");
  });

  it("keeps the caller from commenting or reopening on an abstention", () => {
    expect(shouldActOnResult(verifyIssue(issueWith("meta-improvement")))).toBe(false);
  });
});

describe("shouldActOnResult", () => {
  it("acts on a definite verdict, whatever its confidence", () => {
    expect(shouldActOnResult({ verified: true })).toBe(true);
    expect(shouldActOnResult({ verified: false, confidence: "low" })).toBe(true);
    expect(shouldActOnResult({ verified: true, confidence: "medium" })).toBe(true);
  });

  it("never acts on an abstention", () => {
    expect(shouldActOnResult({ verified: false, confidence: "skip" })).toBe(false);
  });
});
