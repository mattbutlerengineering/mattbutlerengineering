import { describe, it, expect, vi } from "vitest";
import { fileIssue } from "../lib/issue-filing.mjs";

/** Minimal request shared across tests — only dedupeKey varies where needed. */
function request(overrides = {}) {
  return {
    title: "Example finding",
    body: "Something worth tracking.",
    labels: ["ready"],
    dedupeKey: "example-key",
    ...overrides,
  };
}

/** Fake deps — every call is a vi.fn() so tests can assert on invocation. */
function fakeDeps(overrides = {}) {
  return {
    getIssueState: vi.fn(() => "missing"),
    createIssue: vi.fn(() => 101),
    reopenIssue: vi.fn(),
    ...overrides,
  };
}

describe("fileIssue: skip/create/reopen decision", () => {
  it("creates a new issue when the dedupe key has no ledger entry", () => {
    const deps = fakeDeps();
    const result = fileIssue(request(), {}, deps);

    expect(result.action).toBe("create");
    expect(result.issueNumber).toBe(101);
    expect(result.ledger).toEqual({ "example-key": 101 });
    expect(deps.createIssue).toHaveBeenCalledWith("Example finding", "Something worth tracking.", [
      "ready",
    ]);
    expect(deps.reopenIssue).not.toHaveBeenCalled();
  });

  it("skips when the ledger's prior issue is still open", () => {
    const deps = fakeDeps({ getIssueState: vi.fn(() => "open") });
    const result = fileIssue(request(), { "example-key": 42 }, deps);

    expect(result.action).toBe("skip");
    expect(result.issueNumber).toBe(42);
    expect(result.ledger).toEqual({ "example-key": 42 });
    expect(deps.createIssue).not.toHaveBeenCalled();
    expect(deps.reopenIssue).not.toHaveBeenCalled();
  });

  it("reopens the prior issue when it exists but is closed", () => {
    const deps = fakeDeps({ getIssueState: vi.fn(() => "closed") });
    const result = fileIssue(request(), { "example-key": 42 }, deps);

    expect(result.action).toBe("reopen");
    expect(result.issueNumber).toBe(42);
    expect(result.ledger).toEqual({ "example-key": 42 });
    expect(deps.reopenIssue).toHaveBeenCalledWith(42);
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("creates a fresh issue when the prior issue number no longer exists", () => {
    const deps = fakeDeps({ getIssueState: vi.fn(() => "missing"), createIssue: vi.fn(() => 99) });
    const result = fileIssue(request(), { "example-key": 42 }, deps);

    expect(result.action).toBe("create");
    expect(result.issueNumber).toBe(99);
    expect(result.ledger).toEqual({ "example-key": 99 });
    expect(deps.reopenIssue).not.toHaveBeenCalled();
  });

  it("never mutates the ledger passed in", () => {
    const deps = fakeDeps();
    const original = { "example-key": 42 };
    const originalCopy = { ...original };
    deps.getIssueState = vi.fn(() => "open");

    fileIssue(request(), original, deps);

    expect(original).toEqual(originalCopy);
  });
});
