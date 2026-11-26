import { describe, it, expect } from "vitest";
import { findNegatedClosingRefs } from "../negated-closing-refs.mjs";

describe("findNegatedClosingRefs", () => {
  it("flags the #9766 sentence", () => {
    const hits = findNegatedClosingRefs("It does not close #9718.");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ keyword: "close", issue: 9718 });
    expect(hits[0].sentence).toContain("does not close #9718");
  });

  it("flags n't, never, without and no longer, case-insensitively", () => {
    for (const s of [
      "This doesn't Fix #1.",
      "Never resolves #2.",
      "Merges without closing... Closes #3 is wrong, without Closes #3",
      "It no longer Fixed #4.",
    ]) {
      expect(findNegatedClosingRefs(s).length, s).toBeGreaterThan(0);
    }
  });

  it("returns [] for a plain closing keyword", () => {
    expect(findNegatedClosingRefs("Closes #12")).toEqual([]);
  });

  it("returns [] when the negation is in a different sentence", () => {
    expect(findNegatedClosingRefs("Fixes #12. Does not touch the API.")).toEqual([]);
  });

  it("ignores fenced code blocks and empty input", () => {
    expect(findNegatedClosingRefs("```\ndoes not close #5\n```")).toEqual([]);
    expect(findNegatedClosingRefs("")).toEqual([]);
    expect(findNegatedClosingRefs(null)).toEqual([]);
  });
});
