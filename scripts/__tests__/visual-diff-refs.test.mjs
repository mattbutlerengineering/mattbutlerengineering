import { describe, it, expect } from "vitest";
import { REF_ROOT, REF_PREFIX, buildRefName, fullRef, parseRefName } from "../visual-diff-refs.mjs";

// ---------------------------------------------------------------------------
// Namespace constants — Milestone 5's probe is a one-constant change (REF_ROOT
// flips from "refs/heads" to "refs" if refs/visual-diffs/… turns out to be
// pushable under GITHUB_TOKEN), so nothing else may spell either segment out.
// ---------------------------------------------------------------------------

describe("ref namespace constants", () => {
  it("exports the branch-name prefix as a single constant", () => {
    expect(REF_PREFIX).toBe("visual-diffs");
  });

  it("exports the ref root separately, so the custom-namespace probe is one edit", () => {
    expect(REF_ROOT).toBe("refs/heads");
  });
});

// ---------------------------------------------------------------------------
// buildRefName / fullRef
// ---------------------------------------------------------------------------

describe("buildRefName", () => {
  it("produces exactly visual-diffs/pr-<N>/run-<id>", () => {
    expect(buildRefName({ prNumber: 4567, runId: 32873184619 })).toBe(
      "visual-diffs/pr-4567/run-32873184619"
    );
  });

  it("accepts string inputs unchanged (run ids arrive from the environment as strings)", () => {
    expect(buildRefName({ prNumber: "12", runId: "34" })).toBe("visual-diffs/pr-12/run-34");
  });

  it("is built from REF_PREFIX rather than a second literal", () => {
    expect(buildRefName({ prNumber: 1, runId: 2 }).startsWith(`${REF_PREFIX}/`)).toBe(true);
  });
});

describe("fullRef", () => {
  it("prefixes the ref root, giving the push destination", () => {
    expect(fullRef("visual-diffs/pr-1/run-2")).toBe("refs/heads/visual-diffs/pr-1/run-2");
  });
});

// ---------------------------------------------------------------------------
// parseRefName — round-trips, and returns null (never throws) for anything else
// ---------------------------------------------------------------------------

describe("parseRefName", () => {
  it("round-trips a constructed name", () => {
    const name = buildRefName({ prNumber: 4567, runId: 32873184619 });
    expect(parseRefName(name)).toEqual({ prNumber: 4567, runId: "32873184619" });
  });

  it("returns null for main", () => {
    expect(parseRefName("main")).toBeNull();
  });

  it("returns null for the bare prefix", () => {
    expect(parseRefName("visual-diffs/")).toBeNull();
  });

  it("returns null for a trailing-slash variant", () => {
    expect(parseRefName("visual-diffs/pr-1/run-2/")).toBeNull();
  });

  it("returns null for a fully-qualified ref (callers strip refs/heads/ first)", () => {
    expect(parseRefName("refs/heads/visual-diffs/pr-1/run-2")).toBeNull();
  });

  it("returns null for a non-numeric PR number", () => {
    expect(parseRefName("visual-diffs/pr-abc/run-2")).toBeNull();
  });

  it("returns null for an empty run id", () => {
    expect(parseRefName("visual-diffs/pr-1/run-")).toBeNull();
  });

  it("returns null for a prefix that merely starts the same way", () => {
    expect(parseRefName("visual-diffs-old/pr-1/run-2")).toBeNull();
  });

  it("returns null rather than throwing for non-string input", () => {
    expect(parseRefName(null)).toBeNull();
    expect(parseRefName(undefined)).toBeNull();
    expect(parseRefName(42)).toBeNull();
  });
});
